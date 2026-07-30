import { articleDraftSchema } from "@public-patterns/contracts/article";
import {
  type InvestigationResult,
  investigationResultSchema,
  investigationSubmissionSchema,
  type InvestigationInput,
} from "@public-patterns/contracts/investigation";
import {
  type ArticleImageFailure,
  type ArticleImageArchive,
  type ArticleImageSandbox,
  articleImageSrc,
  readArticleImageFailure,
  saveArticleImage,
  type StoredArticleImage,
} from "./article-image.ts";
import type { Env } from "./environment.ts";
import {
  deepSeekFailureFromOutput,
  missingDeepSeekKey,
  type ProviderFailureDiagnostic,
} from "./providerFailure.ts";

type InvestigationSandbox = ArticleImageSandbox & {
  mkdir(path: string, options: { recursive: boolean }): Promise<unknown>;
  writeFile(path: string, content: string): Promise<unknown>;
  exec(
    command: string,
    options: {
      cwd: string;
      env: Record<string, string>;
      timeout: number;
    },
  ): Promise<{
    success: boolean;
    exitCode: number;
    stdout: string;
    stderr: string;
  }>;
};

type InvestigationArchive = ArticleImageArchive;

const AGENT_COMMAND =
  'opencode2 run --standalone --auto --agent investigator --format json "Investigate the case in case/input.json. Submit the internal brief and, when warranted, a publishable article."';
const maxArchivedOutput = 1_000_000;

export async function investigateCase(
  env: Env,
  input: InvestigationInput,
): Promise<InvestigationResult> {
  if (!env.DEEPSEEK_API_KEY) {
    throw missingDeepSeekKey();
  }

  const { getSandbox } = await import("@cloudflare/sandbox");
  const sandbox = getSandbox(
    env.Sandbox,
    `investigation-${crypto.randomUUID()}`,
    { sleepAfter: "20m" },
  );

  try {
    return await investigateInSandbox({
      archive: env.ARCHIVE,
      sandbox,
      input,
      deepseekApiKey: env.DEEPSEEK_API_KEY,
      openAiApiKey: env.OPENAI_API_KEY,
      environment: env.PUBLIC_PATTERNS_ENV,
    });
  } finally {
    await sandbox
      .destroy()
      .catch((error) => console.error("Sandbox destroy failed", error));
  }
}

export async function investigateInSandbox({
  archive,
  sandbox,
  input,
  deepseekApiKey,
  openAiApiKey,
  environment,
}: {
  archive: InvestigationArchive;
  sandbox: InvestigationSandbox;
  input: InvestigationInput;
  deepseekApiKey: string;
  openAiApiKey?: string;
  environment: string;
}) {
  await Promise.all(
    ["case", "work", "output"].map((directory) =>
      sandbox.mkdir(`/workspace/${directory}`, { recursive: true }),
    ),
  );
  await sandbox.writeFile(
    "/workspace/case/input.json",
    JSON.stringify({ case: input.case }, null, 2),
  );

  let run: Awaited<ReturnType<InvestigationSandbox["exec"]>>;
  let didExecutionThrow = false;
  try {
    run = await sandbox.exec(AGENT_COMMAND, {
      cwd: "/workspace",
      env: {
        DEEPSEEK_API_KEY: deepseekApiKey,
        ...(openAiApiKey
          ? {
              OPENAI_API_KEY: openAiApiKey,
              PUBLIC_PATTERNS_IMAGE_SRC: articleImageSrc(input.id),
            }
          : {}),
      },
      timeout: 720_000,
    });
  } catch (error) {
    didExecutionThrow = true;
    run = {
      success: false,
      exitCode: -1,
      stdout: "",
      stderr: error instanceof Error ? error.message : String(error),
    };
  }

  const archivedAt = new Date().toISOString();
  const archiveKey =
    `investigations/${archivedAt.slice(0, 10)}/${input.id}/` +
    `${crypto.randomUUID()}.json`;

  let result: InvestigationResult;
  let generatedImage: StoredArticleImage | undefined;
  let imageFailure: ArticleImageFailure | undefined;
  try {
    const submissionFile = await sandbox.readFile(
      "/workspace/output/submission.json",
    );
    const submission = investigationSubmissionSchema.parse(
      JSON.parse(submissionFile.content),
    );
    const briefFile = await sandbox.readFile(
      `/workspace/${submission.briefPath}`,
    );
    const articleFile = submission.articlePath
      ? await sandbox.readFile(`/workspace/${submission.articlePath}`)
      : null;
    const reviewFile = submission.reviewPath
      ? await sandbox.readFile(`/workspace/${submission.reviewPath}`)
      : null;

    const article = articleFile
      ? articleDraftSchema.parse(JSON.parse(articleFile.content))
      : null;
    imageFailure = await readArticleImageFailure(sandbox);
    generatedImage = await saveArticleImage({
      archive,
      article,
      environment,
      investigationId: input.id,
      sandbox,
    });

    result = investigationResultSchema.parse({
      id: input.id,
      archiveKey,
      submission: {
        outcome: submission.outcome,
        confidence: submission.confidence,
        evidence: submission.evidence,
      },
      brief: briefFile.content,
      article,
      review: reviewFile?.content ?? null,
    });
  } catch (submissionError) {
    const output = run.stderr || run.stdout;
    const detail = redact(output, [deepseekApiKey, openAiApiKey]);
    const reason =
      submissionError instanceof Error
        ? submissionError.message
        : String(submissionError);
    const providerFailure =
      !run.success && !didExecutionThrow
        ? deepSeekFailureFromOutput(detail)
        : undefined;
    const failure =
      providerFailure ??
      (!run.success
        ? new Error(
            `OpenCode exited ${run.exitCode}: ${detail.slice(-2_000)}; submission unavailable: ${reason}`,
          )
        : new Error(
            `OpenCode completed without a valid submission: ${reason}`,
          ));
    await archiveInvestigation({
      archive,
      archiveKey,
      archivedAt,
      environment,
      input,
      run,
      deepseekApiKey,
      openAiApiKey,
      imageFailure,
      providerFailure: providerFailure?.diagnostic,
      failure,
    }).catch((archiveError) =>
      console.error("Failed to archive investigation failure", archiveError),
    );
    throw failure;
  }
  await archiveInvestigation({
    archive,
    archiveKey,
    archivedAt,
    environment,
    input,
    run,
    deepseekApiKey,
    openAiApiKey,
    generatedImage,
    imageFailure,
    result,
  });
  return result;
}

async function archiveInvestigation({
  archive,
  archiveKey,
  archivedAt,
  environment,
  input,
  run,
  deepseekApiKey,
  openAiApiKey,
  generatedImage,
  imageFailure,
  providerFailure,
  result,
  failure,
}: {
  archive: InvestigationArchive;
  archiveKey: string;
  archivedAt: string;
  environment: string;
  input: InvestigationInput;
  run: Awaited<ReturnType<InvestigationSandbox["exec"]>>;
  deepseekApiKey: string;
  openAiApiKey?: string;
  generatedImage?: StoredArticleImage;
  imageFailure?: ArticleImageFailure;
  providerFailure?: ProviderFailureDiagnostic;
  result?: InvestigationResult;
  failure?: Error;
}) {
  const status = result ? "completed" : "failed";
  await archive.put(
    archiveKey,
    JSON.stringify(
      {
        version: 1,
        archivedAt,
        environment,
        status,
        investigation: input,
        session: {
          success: run.success,
          exitCode: run.exitCode,
          stdout: limit(redact(run.stdout, [deepseekApiKey, openAiApiKey])),
          stderr: limit(redact(run.stderr, [deepseekApiKey, openAiApiKey])),
        },
        ...(generatedImage ? { generatedImage } : {}),
        ...(imageFailure ? { imageFailure } : {}),
        ...(providerFailure ? { providerFailure } : {}),
        ...(result ? { result } : { error: failure?.message ?? "unknown error" }),
      },
      null,
      2,
    ),
    {
      httpMetadata: { contentType: "application/json" },
      customMetadata: { environment, status },
    },
  );
}

function redact(value: string, secrets: (string | undefined)[]) {
  let redacted = value;
  for (const secret of secrets) {
    if (secret) {
      redacted = redacted.replaceAll(secret, "[redacted]");
    }
  }
  return redacted;
}

function limit(value: string) {
  if (value.length <= maxArchivedOutput) {
    return value;
  }
  const half = maxArchivedOutput / 2;
  return `${value.slice(0, half)}\n[output truncated]\n${value.slice(-half)}`;
}

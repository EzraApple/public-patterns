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

type InvestigationArchive = ArticleImageArchive & {
  get?(key: string): Promise<{ text(): Promise<string> } | null>;
};

export class InvestigationFailedError extends Error {
  constructor(
    readonly archiveKey: string,
    cause: Error,
  ) {
    super(cause.message, { cause });
    this.name = "InvestigationFailedError";
  }
}

export class InvestigationCheckpointError extends Error {
  constructor(
    readonly archiveKey: string,
    cause: unknown,
  ) {
    super(
      "Investigation completed, but its recovery checkpoint could not be saved",
      { cause },
    );
    this.name = "InvestigationCheckpointError";
  }
}

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
  const checkpointKey = `investigations/by-id/${input.id}.json`;
  const inputHash = await hashInput(input);
  const recovered = await getArchivedResult(
    archive,
    checkpointKey,
    inputHash,
  );
  if (recovered) {
    return recovered;
  }

  const archivedAt = new Date().toISOString();
  const archiveKey =
    `investigations/${archivedAt.slice(0, 10)}/${input.id}/` +
    `${crypto.randomUUID()}.json`;

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
    try {
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
      });
    } catch (archiveError) {
      console.error("Failed to archive investigation failure", archiveError);
      throw failure;
    }
    throw new InvestigationFailedError(archiveKey, failure);
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
  try {
    await archiveResultCheckpoint({
      archive,
      checkpointKey,
      environment,
      inputHash,
      result,
    });
  } catch (error) {
    throw new InvestigationCheckpointError(result.archiveKey, error);
  }
  return result;
}

async function archiveResultCheckpoint({
  archive,
  checkpointKey,
  environment,
  inputHash,
  result,
}: {
  archive: InvestigationArchive;
  checkpointKey: string;
  environment: string;
  inputHash: string;
  result: InvestigationResult;
}) {
  let failure: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await archive.put(
        checkpointKey,
        JSON.stringify({ status: "completed", inputHash, result }),
        {
          httpMetadata: { contentType: "application/json" },
          customMetadata: { environment, status: "completed" },
        },
      );
      return;
    } catch (error) {
      failure = error;
    }
  }
  throw failure;
}

async function getArchivedResult(
  archive: InvestigationArchive,
  archiveKey: string,
  inputHash: string,
): Promise<InvestigationResult | undefined> {
  const object = await archive.get?.(archiveKey);
  if (!object) {
    return;
  }
  const stored = JSON.parse(await object.text()) as {
    status?: unknown;
    inputHash?: unknown;
    result?: unknown;
  };
  if (stored.status === "completed" && stored.inputHash !== inputHash) {
    throw new Error("Archived investigation input does not match this case");
  }
  return stored.status === "completed"
    ? investigationResultSchema.parse(stored.result)
    : undefined;
}

async function hashInput(input: InvestigationInput): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(input));
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
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

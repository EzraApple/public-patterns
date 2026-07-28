import {
  investigationSubmissionSchema,
  type InvestigationInput,
  type InvestigationSubmission,
} from "@public-patterns/contracts/investigation";
import type { Env } from "./environment.ts";
type InvestigationSandbox = {
  mkdir(path: string, options: { recursive: boolean }): Promise<unknown>;
  writeFile(path: string, content: string): Promise<unknown>;
  readFile(path: string): Promise<{ content: string }>;
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

const AGENT_COMMAND =
  'opencode2 run --standalone --auto --agent investigator --format json "Investigate the case in case/input.json and submit the resulting brief."';

export async function investigateCase(
  env: Env,
  input: InvestigationInput,
): Promise<{
  id: string;
  submission: InvestigationSubmission;
  brief: string;
}> {
  if (!env.DEEPSEEK_API_KEY) {
    throw new Error("DEEPSEEK_API_KEY is required");
  }

  const { getSandbox } = await import("@cloudflare/sandbox");
  const sandbox = getSandbox(
    env.Sandbox,
    `investigation-${crypto.randomUUID()}`,
    { sleepAfter: "20m" },
  );

  try {
    return await investigateInSandbox({
      sandbox,
      input,
      deepseekApiKey: env.DEEPSEEK_API_KEY,
    });
  } finally {
    await sandbox
      .destroy()
      .catch((error) => console.error("Sandbox destroy failed", error));
  }
}

export async function investigateInSandbox({
  sandbox,
  input,
  deepseekApiKey,
}: {
  sandbox: InvestigationSandbox;
  input: InvestigationInput;
  deepseekApiKey: string;
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
  try {
    run = await sandbox.exec(AGENT_COMMAND, {
      cwd: "/workspace",
      env: {
        DEEPSEEK_API_KEY: deepseekApiKey,
        OPENCODE_ENABLE_EXA: "1",
      },
      timeout: 900_000,
    });
  } catch (error) {
    run = {
      success: false,
      exitCode: -1,
      stdout: "",
      stderr: error instanceof Error ? error.message : String(error),
    };
  }

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

    return {
      id: input.id,
      submission,
      brief: briefFile.content,
    };
  } catch (submissionError) {
    const output = run.stderr || run.stdout;
    const detail = deepseekApiKey
      ? output.replaceAll(deepseekApiKey, "[redacted]")
      : output;
    const reason =
      submissionError instanceof Error
        ? submissionError.message
        : String(submissionError);
    if (!run.success) {
      throw new Error(
        `OpenCode exited ${run.exitCode}: ${detail.slice(-2_000)}; submission unavailable: ${reason}`,
      );
    }
    throw new Error(`OpenCode completed without a valid submission: ${reason}`);
  }
}

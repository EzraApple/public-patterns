import { z } from "zod";

import { deepSeekFailureFromOutput } from "./providerFailure.ts";

export const investigatorModelSchema = z.enum([
  "deepseek-v4-pro",
  "deepseek-v4-flash",
]);

export type InvestigatorModel = z.infer<typeof investigatorModelSchema>;

export type AgentSandbox = {
  readFile(path: string): Promise<{ content: string }>;
  exec(
    command: string,
    options: { cwd: string; env: Record<string, string>; timeout: number },
  ): Promise<{
    success: boolean;
    exitCode: number;
    stdout: string;
    stderr: string;
  }>;
};

const failedSessionSchema = z.object({
  type: z.literal("error"),
  sessionID: z.string().regex(/^ses_[a-zA-Z0-9]+$/),
});

export async function runInvestigatorAgent({
  sandbox,
  model,
  env,
}: {
  sandbox: AgentSandbox;
  model: InvestigatorModel;
  env: Record<string, string>;
}) {
  const deadline = Date.now() + 720_000;
  const command =
    `opencode2 run --standalone --auto --agent investigator --format json --model deepseek/${model}`;
  const execute = async (prompt: string, session = "") => {
    try {
      return {
        ...await sandbox.exec(`${command}${session} "${prompt}"`, {
          cwd: "/workspace",
          env,
          timeout: Math.max(1, deadline - Date.now()),
        }),
        didExecutionThrow: false,
      };
    } catch (error) {
      return {
        success: false,
        exitCode: -1,
        stdout: "",
        stderr: error instanceof Error ? error.message : String(error),
        didExecutionThrow: true,
      };
    }
  };

  const first = await execute(
    "Investigate the case in case/input.json. Submit the internal brief and, when warranted, a publishable article.",
  );
  const session = findFailedSession(first.stdout);
  const failure = deepSeekFailureFromOutput(`${first.stderr}\n${first.stdout}`);
  if (
    first.success ||
    first.didExecutionThrow ||
    !session ||
    !failure?.diagnostic.retryable ||
    deadline - Date.now() < 30_000
  ) {
    return { ...first, continuations: 0 };
  }
  const submission = await sandbox.readFile("/workspace/output/submission.json")
    .catch(() => undefined);
  if (submission || deadline - Date.now() < 30_000) {
    return { ...first, continuations: 0 };
  }

  const continued = await execute(
    "Continue the interrupted investigation using the existing research in work/. Finish the brief and any warranted article and review, then submit. If submit_brief was already accepted, end the run.",
    ` --session ${session}`,
  );
  return {
    ...continued,
    stdout: `${first.stdout}\n${continued.stdout}`,
    stderr: `${first.stderr}\n${continued.stderr}`,
    continuations: 1,
  };
}

function findFailedSession(output: string): string | undefined {
  const lastLine = output.trim().split("\n").at(-1);
  try {
    const parsed = failedSessionSchema.safeParse(JSON.parse(lastLine ?? ""));
    return parsed.success ? parsed.data.sessionID : undefined;
  } catch {
    return;
  }
}

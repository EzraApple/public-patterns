import { describe, expect, it, vi } from "vitest";

import { type AgentSandbox, runInvestigatorAgent } from "./agentExecution.ts";

const transport = {
  success: false,
  exitCode: 1,
  stdout: JSON.stringify({
    type: "error", sessionID: "ses_test123", error: { message: "Transport" },
  }),
  stderr: "",
};

function createSandbox() {
  return {
    exec: vi.fn<AgentSandbox["exec"]>().mockResolvedValue(transport),
    readFile: vi.fn<AgentSandbox["readFile"]>().mockRejectedValue(new Error("missing")),
  };
}

const run = (sandbox: AgentSandbox) => runInvestigatorAgent({
  sandbox, model: "deepseek-v4-flash", env: { DEEPSEEK_API_KEY: "test" },
});

describe("runInvestigatorAgent", () => {
  it("resumes the same interrupted session once within the original deadline", async () => {
    vi.spyOn(Date, "now").mockReturnValueOnce(0).mockReturnValue(1_000);
    try {
      const sandbox = createSandbox();
      sandbox.exec.mockResolvedValueOnce(transport).mockResolvedValueOnce({
        success: true, exitCode: 0, stdout: "completed", stderr: "",
      });
      const result = await run(sandbox);
      expect(result).toMatchObject({ success: true, continuations: 1 });
      expect(result.stdout).toContain(transport.stdout);
      expect(result.stdout).toContain("completed");
      expect(sandbox.exec).toHaveBeenCalledTimes(2);
      expect(sandbox.exec.mock.calls[1]).toEqual([
        expect.stringContaining("--session ses_test123"),
        expect.objectContaining({ timeout: 719_000 }),
      ]);
      expect(sandbox.exec.mock.calls[0]?.[0]).toContain("--model deepseek/deepseek-v4-flash");
    } finally {
      vi.restoreAllMocks();
    }
  });

  it("does not start a third command after repeated transport failures", async () => {
    const sandbox = createSandbox();
    expect(await run(sandbox)).toMatchObject({ success: false, continuations: 1 });
    expect(sandbox.exec).toHaveBeenCalledTimes(2);
  });

  it("preserves an existing submission after an unsuccessful exit", async () => {
    const sandbox = createSandbox();
    sandbox.readFile.mockResolvedValue({ content: "{}" });
    expect(await run(sandbox)).toMatchObject({ continuations: 0 });
    expect(sandbox.exec).toHaveBeenCalledTimes(1);
  });

  it.each([
    { ...transport, success: true, exitCode: 0 },
    { ...transport, stdout: transport.stdout.replace("Transport", "Insufficient Balance") },
    { ...transport, stdout: transport.stdout.replace("Transport", "Unauthorized") },
    { ...transport, stdout: transport.stdout.replace("ses_test123", "ses_test; echo unsafe") },
    { ...transport, stdout: "Transport" },
  ])("does not resume ineligible exits", async (response) => {
    const sandbox = createSandbox();
    sandbox.exec.mockResolvedValue(response);
    expect(await run(sandbox)).toMatchObject({ continuations: 0 });
    expect(sandbox.exec).toHaveBeenCalledTimes(1);
  });

  it("does not resume without enough time remaining", async () => {
    vi.spyOn(Date, "now").mockReturnValueOnce(0).mockReturnValue(710_000);
    try {
      const sandbox = createSandbox();
      expect(await run(sandbox)).toMatchObject({ continuations: 0 });
      expect(sandbox.exec).toHaveBeenCalledTimes(1);
    } finally {
      vi.restoreAllMocks();
    }
  });
});

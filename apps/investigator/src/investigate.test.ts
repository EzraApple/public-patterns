import { describe, expect, it, vi } from "vitest";

import {
  investigateInSandbox,
  investigationInputSchema,
} from "./investigate.ts";

function createSandbox(
  submission: unknown,
  execError = "session transport closed after submission",
) {
  const files = new Map<string, string>([
    [
      "/workspace/output/submission.json",
      JSON.stringify(submission),
    ],
    ["/workspace/output/brief.md", "# Finding"],
  ]);
  return {
    files,
    sandbox: {
      mkdir: vi.fn(),
      writeFile: vi.fn(async (path: string, content: string) => {
        files.set(path, content);
      }),
      exec: vi.fn(async () => {
        throw new Error(execError);
      }),
      readFile: vi.fn(async (path: string) => ({
        content: files.get(path) ?? "",
      })),
    },
  };
}

describe("investigateInSandbox", () => {
  it("returns a submitted brief even when terminal submission ends the transport", async () => {
    const submission = {
      outcome: "investigate",
      confidence: 0.8,
      briefPath: "output/brief.md",
      evidence: ["observation:123"],
      artifacts: [],
    };
    const { files, sandbox } = createSandbox(submission);

    const result = await investigateInSandbox({
      sandbox,
      input: { id: "case-1", case: { observations: [123] } },
      deepseekApiKey: "test-key",
    });

    expect(result).toEqual({
      id: "case-1",
      submission,
      brief: "# Finding",
    });
    expect(sandbox.exec).toHaveBeenCalledWith(
      expect.stringContaining("--agent investigator"),
      expect.objectContaining({
        cwd: "/workspace",
        env: {
          DEEPSEEK_API_KEY: "test-key",
          OPENCODE_ENABLE_EXA: "1",
        },
      }),
    );
    expect(files.get("/workspace/case/input.json")).toBe(
      JSON.stringify({ case: { observations: [123] } }, null, 2),
    );
  });

  it("rejects non-canonical submitted paths", async () => {
    const invalidPaths = [
      "output",
      "output/",
      "output//brief.md",
      "./output/brief.md",
      "output/./brief.md",
      "output/../case/input.json",
      "/etc/passwd",
      "outputx/brief.md",
    ];

    for (const path of invalidPaths) {
      for (const [briefPath, artifacts] of [
        [path, []],
        ["output/brief.md", [path]],
      ] as const) {
        const { sandbox } = createSandbox({
          outcome: "watch",
          confidence: 0.5,
          briefPath,
          evidence: [],
          artifacts,
        });

        await expect(
          investigateInSandbox({
            sandbox,
            input: { id: "case-2", case: {} },
            deepseekApiKey: "test-key",
          }),
        ).rejects.toThrow("must be");
      }
    }
  });

  it("redacts the provider key from run failures", async () => {
    const { sandbox } = createSandbox(
      {},
      "provider rejected secret-test-key",
    );
    const error = await investigateInSandbox({
      sandbox,
      input: { id: "case-3", case: {} },
      deepseekApiKey: "secret-test-key",
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain(
      "provider rejected [redacted]",
    );
    expect((error as Error).message).not.toContain("secret-test-key");
  });
});

describe("investigationInputSchema", () => {
  it("requires a case object before model work starts", () => {
    for (const value of [undefined, null, 42, "case", []]) {
      expect(
        investigationInputSchema.safeParse({ id: "case-4", case: value })
          .success,
      ).toBe(false);
    }
  });
});

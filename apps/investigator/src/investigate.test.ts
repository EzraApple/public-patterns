import { describe, expect, it, vi } from "vitest";

import { investigationInputSchema } from "@public-patterns/contracts/investigation";
import { investigateInSandbox } from "./investigate.ts";

function createSandbox(
  submission: unknown,
  execError?: string,
) {
  const files = new Map<string, string>([
    [
      "/workspace/output/submission.json",
      JSON.stringify(submission),
    ],
    ["/workspace/output/brief.md", "# Finding"],
    [
      "/workspace/output/article.json",
      JSON.stringify({
        title: "Event headline",
        dek: "A concise summary.",
        category: "Public safety",
        body: "The supported account.",
        sources: [
          { label: "Public record", href: "https://example.com/record" },
        ],
        figure: null,
      }),
    ],
    ["/workspace/output/review.md", "# Claim review\n\nAll claims verified."],
  ]);
  const archives = new Map<string, string>();
  const archive = {
    put: vi.fn(
      async (
        key: string,
        value: string,
        _options: {
          httpMetadata: { contentType: string };
          customMetadata: Record<string, string>;
        },
      ) => {
        archives.set(key, value);
      },
    ),
  };
  return {
    archive,
    archives,
    files,
    sandbox: {
      mkdir: vi.fn(),
      writeFile: vi.fn(async (path: string, content: string) => {
        files.set(path, content);
      }),
      exec: vi.fn(async () => {
        if (execError) {
          throw new Error(execError);
        }
        return {
          success: true,
          exitCode: 0,
          stdout: "",
          stderr: "",
        };
      }),
      readFile: vi.fn(async (path: string) => ({
        content: files.get(path) ?? "",
      })),
    },
  };
}

describe("investigateInSandbox", () => {
  it("returns a submitted brief after the agent exits", async () => {
    const submission = {
      outcome: "investigate",
      confidence: 0.8,
      briefPath: "output/brief.md",
      articlePath: "output/article.json",
      reviewPath: "output/review.md",
      evidence: ["observation:123"],
    };
    const { archive, archives, files, sandbox } = createSandbox(submission);

    const result = await investigateInSandbox({
      archive,
      sandbox,
      input: { id: "case-1", case: { observations: [123] } },
      deepseekApiKey: "test-key",
      environment: "test",
    });

    expect(result).toEqual({
      id: "case-1",
      archiveKey: expect.stringMatching(
        /^investigations\/\d{4}-\d{2}-\d{2}\/case-1\/.+\.json$/,
      ),
      submission: {
        outcome: "investigate",
        confidence: 0.8,
        evidence: ["observation:123"],
      },
      brief: "# Finding",
      article: {
        title: "Event headline",
        dek: "A concise summary.",
        category: "Public safety",
        body: "The supported account.",
        sources: [
          { label: "Public record", href: "https://example.com/record" },
        ],
        figure: null,
      },
      review: "# Claim review\n\nAll claims verified.",
    });
    expect(JSON.parse(archives.get(result.archiveKey)!)).toMatchObject({
      version: 1,
      environment: "test",
      status: "completed",
      investigation: {
        id: "case-1",
        case: { observations: [123] },
      },
      result,
    });
    expect(sandbox.exec).toHaveBeenCalledWith(
      expect.stringContaining("--agent investigator"),
      expect.objectContaining({
        cwd: "/workspace",
        env: {
          DEEPSEEK_API_KEY: "test-key",
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

    for (const briefPath of invalidPaths) {
      const { archive, sandbox } = createSandbox({
        outcome: "watch",
        confidence: 0.5,
        briefPath,
        evidence: [],
      });

      await expect(
        investigateInSandbox({
          archive,
          sandbox,
          input: { id: "case-2", case: {} },
          deepseekApiKey: "test-key",
          environment: "test",
        }),
      ).rejects.toThrow("must be");
    }
  });

  it("requires an article for investigate outcomes", async () => {
    const { archive, sandbox } = createSandbox({
      outcome: "investigate",
      confidence: 0.8,
      briefPath: "output/brief.md",
      evidence: [],
    });

    await expect(
      investigateInSandbox({
        archive,
        sandbox,
        input: { id: "case-article", case: {} },
        deepseekApiKey: "test-key",
        environment: "test",
      }),
    ).rejects.toThrow("article");
  });

  it("rejects blank submitted articles", async () => {
    const { archive, files, sandbox } = createSandbox({
      outcome: "investigate",
      confidence: 0.8,
      briefPath: "output/brief.md",
      articlePath: "output/article.json",
      reviewPath: "output/review.md",
      evidence: [],
    });
    files.set(
      "/workspace/output/article.json",
      JSON.stringify({
        title: "Event headline",
        dek: "A concise summary.",
        category: "Public safety",
        body: "  ",
        sources: [
          { label: "Public record", href: "https://example.com/record" },
        ],
        figure: null,
      }),
    );

    await expect(
      investigateInSandbox({
        archive,
        sandbox,
        input: { id: "case-blank-article", case: {} },
        deepseekApiKey: "test-key",
        environment: "test",
      }),
    ).rejects.toThrow("body");
  });

  it("redacts the provider key from run failures", async () => {
    const { archive, archives, sandbox } = createSandbox(
      {},
      "provider rejected secret-test-key",
    );
    const error = await investigateInSandbox({
      archive,
      sandbox,
      input: { id: "case-3", case: {} },
      deepseekApiKey: "secret-test-key",
      environment: "test",
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain(
      "provider rejected [redacted]",
    );
    expect((error as Error).message).not.toContain("secret-test-key");
    const archivedFailure = [...archives.values()][0]!;
    expect(archivedFailure).toContain("provider rejected [redacted]");
    expect(archivedFailure).not.toContain("secret-test-key");
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

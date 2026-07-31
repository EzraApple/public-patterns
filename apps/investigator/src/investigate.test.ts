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
        significance: 50,
        body: "The supported account.",
        sources: [
          { label: "Public record", href: "https://example.com/record" },
        ],
        figure: null,
      }),
    ],
    ["/workspace/output/review.md", "# Claim review\n\nAll claims verified."],
  ]);
  const archives = new Map<string, string | Uint8Array>();
  const archive = {
    put: vi.fn(
      async (
        key: string,
        value: string | Uint8Array,
        _options: {
          httpMetadata: {
            cacheControl?: string;
            contentType: string;
          };
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
      readFile: vi.fn(async (path: string) => {
        const content = files.get(path);
        if (content === undefined) {
          throw new Error(`File not found: ${path}`);
        }
        return { content };
      }),
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
        significance: 50,
        body: "The supported account.",
        sources: [
          { label: "Public record", href: "https://example.com/record" },
        ],
        figure: null,
        hero: null,
      },
      review: "# Claim review\n\nAll claims verified.",
    });
    expect(JSON.parse(String(archives.get(result.archiveKey)))).toMatchObject({
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

  it("uploads a generated article image to the public media prefix", async () => {
    const submission = {
      outcome: "investigate",
      confidence: 0.8,
      briefPath: "output/brief.md",
      articlePath: "output/article.json",
      reviewPath: "output/review.md",
      evidence: ["observation:123"],
    };
    const { archive, archives, files, sandbox } = createSandbox(submission);
    const hero = {
      src: "/media/articles/case-image.webp",
      alt: "Fog over the San Francisco coastline.",
      caption:
        "AI-generated contextual illustration; it does not depict the reported event.",
    };
    files.set(
      "/workspace/output/article.json",
      JSON.stringify({
        title: "Event headline",
        dek: "A concise summary.",
        category: "Public safety",
        significance: 50,
        body: "The supported account.",
        sources: [
          { label: "Public record", href: "https://example.com/record" },
        ],
        figure: null,
        hero,
      }),
    );
    files.set(
      "/workspace/output/hero.json",
      JSON.stringify({
        hero,
        model: "gpt-image-2",
        prompt: "A foggy contextual coastline.",
      }),
    );
    files.set(
      "/workspace/output/hero.webp",
      btoa("fake-webp"),
    );

    const result = await investigateInSandbox({
      archive,
      sandbox,
      input: { id: "case-image", case: { observations: [123] } },
      deepseekApiKey: "deepseek-key",
      openAiApiKey: "openai-key",
      environment: "test",
    });

    expect(result.article?.hero).toEqual(hero);
    expect(archives.get("article-media/case-image.webp")).toEqual(
      new TextEncoder().encode("fake-webp"),
    );
    expect(
      JSON.parse(String(archives.get(result.archiveKey))).generatedImage,
    ).toMatchObject({
      key: "article-media/case-image.webp",
      model: "gpt-image-2",
    });
    expect(sandbox.exec).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        env: {
          DEEPSEEK_API_KEY: "deepseek-key",
          OPENAI_API_KEY: "openai-key",
          PUBLIC_PATTERNS_IMAGE_SRC:
            "/media/articles/case-image.webp",
        },
      }),
    );
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
        significance: 50,
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
    expect(String(archivedFailure)).toContain(
      "provider rejected [redacted]",
    );
    expect(String(archivedFailure)).not.toContain("secret-test-key");
  });

  it("archives actionable DeepSeek quota diagnostics", async () => {
    const { archive, archives, sandbox } = createSandbox({});
    sandbox.exec.mockResolvedValue({
      success: false,
      exitCode: 1,
      stdout: "",
      stderr:
        'DeepSeek request failed {"status":402,"code":"insufficient_balance","request_id":"deepseek-request-1"}',
    });

    const error = await investigateInSandbox({
      archive,
      sandbox,
      input: { id: "case-quota", case: {} },
      deepseekApiKey: "deepseek-key",
      environment: "test",
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain("Refill credits");
    const archivedFailure = JSON.parse(
      String([...archives.values()][0]),
    );
    expect(archivedFailure.providerFailure).toMatchObject({
      provider: "DeepSeek",
      kind: "quota",
      requestId: "deepseek-request-1",
      retryable: false,
      status: 402,
    });
  });

  it("archives a non-blocking OpenAI image failure", async () => {
    const submission = {
      outcome: "investigate",
      confidence: 0.8,
      briefPath: "output/brief.md",
      articlePath: "output/article.json",
      reviewPath: "output/review.md",
      evidence: ["observation:123"],
    };
    const { archive, archives, files, sandbox } = createSandbox(submission);
    files.set(
      "/workspace/output/hero-error.json",
      JSON.stringify({
        provider: "OpenAI",
        operation: "image generation",
        kind: "quota",
        retryable: false,
        action: "Refill credits, then retry.",
        status: 429,
        providerCode: "insufficient_quota",
        requestId: "image-request-1",
      }),
    );

    const result = await investigateInSandbox({
      archive,
      sandbox,
      input: { id: "case-image-failure", case: {} },
      deepseekApiKey: "deepseek-key",
      openAiApiKey: "openai-key",
      environment: "test",
    });

    expect(result.article?.hero).toBeNull();
    expect(
      JSON.parse(String(archives.get(result.archiveKey))).imageFailure,
    ).toMatchObject({
      kind: "quota",
      requestId: "image-request-1",
    });
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

  it("rejects ids that cannot become article media paths", () => {
    expect(
      investigationInputSchema.safeParse({ id: "../case", case: {} }).success,
    ).toBe(false);
  });
});

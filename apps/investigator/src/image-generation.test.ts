import { describe, expect, it, vi } from "vitest";

import {
  buildImagePrompt,
  generateImage,
  ImageApiError,
} from "../agent/.opencode/plugins/image-generation.ts";

describe("article image generation", () => {
  it("wraps the article scene in the non-evidentiary house style", () => {
    const prompt = buildImagePrompt(
      "A foggy Presidio overlook with cold bay water.",
    );

    expect(prompt).toContain("contextual San Francisco place");
    expect(prompt).toContain("not a reconstruction");
    expect(prompt).toContain("A foggy Presidio overlook");
  });

  it("uses one fixed low-cost wide OpenAI image request", async () => {
    const fetcher = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(body).toMatchObject({
        model: "gpt-image-2",
        n: 1,
        output_format: "webp",
        quality: "low",
        size: "1536x1024",
      });
      return Response.json({
        data: [{ b64_json: "aW1hZ2U=" }],
      });
    });

    const image = await generateImage({
      apiKey: "test-key",
      fetcher: fetcher as typeof fetch,
      scene: "A quiet Mission streetscape under ordinary morning light.",
    });

    expect(image.base64).toBe("aW1hZ2U=");
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("explains when the OpenAI project needs more credits", async () => {
    const fetcher = vi.fn(async () =>
      Response.json(
        {
          error: {
            code: "insufficient_quota",
            message: "Project has no remaining credits for test-key.",
          },
        },
        {
          status: 429,
          headers: { "x-request-id": "image-request-1" },
        },
      ),
    );

    const error = await generateImage({
      apiKey: "test-key",
      fetcher: fetcher as typeof fetch,
      scene: "A quiet Mission streetscape under ordinary morning light.",
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ImageApiError);
    expect((error as ImageApiError).diagnostic).toMatchObject({
      kind: "quota",
      requestId: "image-request-1",
      retryable: false,
      status: 429,
    });
    expect((error as Error).message).toContain("Refill credits");
    expect((error as Error).message).not.toContain("test-key");
  });
});

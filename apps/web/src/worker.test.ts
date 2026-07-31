import { describe, expect, it, vi } from "vitest";

import { routeRequest } from "./worker";

function environment(fetch = vi.fn()) {
  return {
    LAB_TOKEN: "test-token",
    MEDIA: {
      get: vi.fn(),
    },
    PIPELINE: { fetch },
    PUBLIC_PATTERNS_ENV: "production" as const,
  };
}

describe("internal API", () => {
  it("requires the lab token", async () => {
    const env = environment();
    const response = await routeRequest(
      new Request("https://publicpatterns.com/api/internal/health"),
      env,
    );

    expect(response.status).toBe(401);
    expect(env.PIPELINE.fetch).not.toHaveBeenCalled();
  });

  it("fails closed when the lab token is not configured", async () => {
    const env = { ...environment(), LAB_TOKEN: "" };
    const response = await routeRequest(
      new Request("https://publicpatterns.com/api/internal/health", {
        headers: { authorization: "Bearer undefined" },
      }),
      env,
    );

    expect(response.status).toBe(503);
    expect(env.PIPELINE.fetch).not.toHaveBeenCalled();
  });

  it("forwards authenticated requests through the private binding", async () => {
    const fetch = vi.fn(async (request: Request) => {
      expect(request.url).toBe("https://pipeline/bursts?source=311");
      expect(request.headers.has("authorization")).toBe(false);
      return Response.json({ ready: true, bursts: [] });
    });
    const response = await routeRequest(
      new Request(
        "https://publicpatterns.com/api/internal/bursts?source=311",
        { headers: { authorization: "Bearer test-token" } },
      ),
      environment(fetch),
    );

    expect(response.ok).toBe(true);
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("forwards authenticated article deletion", async () => {
    const fetch = vi.fn(async (request: Request) => {
      expect(request.url).toBe("https://pipeline/articles/example");
      expect(request.method).toBe("DELETE");
      expect(request.headers.has("authorization")).toBe(false);
      return new Response(null, { status: 204 });
    });
    const response = await routeRequest(
      new Request(
        "https://publicpatterns.com/api/internal/articles/example",
        {
          method: "DELETE",
          headers: { authorization: "Bearer test-token" },
        },
      ),
      environment(fetch),
    );

    expect(response.status).toBe(204);
    expect(fetch).toHaveBeenCalledOnce();
  });
});

describe("public article API", () => {
  it("forwards article reads without the lab token", async () => {
    const fetch = vi.fn(async (request: Request) => {
      expect(request.url).toBe("https://pipeline/articles/example");
      return Response.json({ slug: "example" });
    });
    const response = await routeRequest(
      new Request("https://publicpatterns.com/api/articles/example"),
      environment(fetch),
    );

    expect(response.ok).toBe(true);
    expect(fetch).toHaveBeenCalledOnce();
  });
});

describe("article images", () => {
  it("serves only article media from R2 with immutable caching", async () => {
    const get = vi.fn(async () => ({
      body: "image-bytes",
      httpEtag: '"etag"',
      writeHttpMetadata(headers: Headers) {
        headers.set("content-type", "image/webp");
      },
    }));
    const env = {
      ...environment(),
      MEDIA: { get },
    };

    const response = await routeRequest(
      new Request(
        "https://publicpatterns.com/media/articles/case-123.webp",
      ),
      env,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/webp");
    expect(response.headers.get("cache-control")).toContain("immutable");
    expect(get).toHaveBeenCalledWith("article-media/case-123.webp");
  });
});

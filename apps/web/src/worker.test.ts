import { describe, expect, it, vi } from "vitest";

import { routeRequest } from "./worker";

function environment(fetch = vi.fn()) {
  return {
    LAB_TOKEN: "test-token",
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
});

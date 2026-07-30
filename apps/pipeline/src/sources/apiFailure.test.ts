import { describe, expect, it } from "vitest";

import {
  apiNetworkError,
  apiResponseError,
} from "./apiFailure.ts";

describe("API failure diagnostics", () => {
  it.each([
    {
      status: 401,
      body: { error: { code: "invalid_api_key", message: "Bad key" } },
      kind: "authentication",
      action: "Verify or rotate TEST_API_KEY",
    },
    {
      status: 429,
      body: {
        error: {
          code: "insufficient_quota",
          message: "Add credits to continue",
        },
      },
      kind: "quota",
      action: "Refill credits or enable billing",
    },
    {
      status: 429,
      body: { error: { code: "rate_limit", message: "Slow down" } },
      kind: "rate_limit",
      action: "Wait and retry",
    },
  ])(
    "classifies HTTP $status as $kind",
    async ({ status, body, kind, action }) => {
      const error = await apiResponseError({
        provider: "Example",
        operation: "request",
        response: Response.json(body, {
          status,
          headers: { "x-request-id": "request-1" },
        }),
        credentialName: "TEST_API_KEY",
        hasCredential: true,
      });

      expect(error.diagnostic).toMatchObject({
        kind,
        requestId: "request-1",
        status,
      });
      expect(error.message).toContain(action);
    },
  );

  it("identifies timeouts without losing the provider operation", () => {
    const cause = new Error(
      "request with api_key=test-secret timed out",
    );
    cause.name = "TimeoutError";

    const error = apiNetworkError({
      provider: "Example",
      operation: "snapshot",
      error: cause,
      secrets: ["test-secret"],
    });

    expect(error.diagnostic).toMatchObject({
      provider: "Example",
      operation: "snapshot",
      kind: "timeout",
      retryable: true,
    });
    expect(error.message).not.toContain("test-secret");
  });

  it("redacts credentials echoed by a provider", async () => {
    const error = await apiResponseError({
      provider: "Example",
      operation: "request",
      response: new Response("Invalid key secret-value", { status: 401 }),
      credentialName: "TEST_API_KEY",
      hasCredential: true,
      secrets: ["secret-value"],
    });

    expect(error.message).toContain("[redacted]");
    expect(error.message).not.toContain("secret-value");
  });
});

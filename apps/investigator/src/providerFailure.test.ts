import { describe, expect, it } from "vitest";

import {
  deepSeekFailureFromOutput,
  providerFailureDiagnostic,
} from "./providerFailure.ts";

describe("DeepSeek failure diagnostics", () => {
  it("classifies the terminal transport error instead of earlier session text", () => {
    const error = deepSeekFailureFromOutput(
      [
        '{"type":"step-start","text":"unauthorized was discussed"}',
        '{"error":{"type":"unknown","message":"Transport"}}',
      ].join("\n"),
    );

    expect(error?.diagnostic).toMatchObject({
      kind: "network",
      providerCode: "unknown",
      retryable: true,
    });
  });

  it("preserves provider diagnostics through an archived failure wrapper", () => {
    const provider = deepSeekFailureFromOutput("Transport");
    const wrapped = new Error("archived", { cause: provider });

    expect(providerFailureDiagnostic(wrapped)).toMatchObject({
      kind: "network",
    });
  });

  it("does not label an unclassified local process error as DeepSeek", () => {
    expect(deepSeekFailureFromOutput("agent process exited")).toBeUndefined();
  });

  it("uses the last status from terminal output", () => {
    expect(
      deepSeekFailureFromOutput("status:401\nstatus:503")?.diagnostic,
    ).toMatchObject({ kind: "provider", status: 503, retryable: true });
  });
});

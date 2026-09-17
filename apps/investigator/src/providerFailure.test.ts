import { describe, expect, it } from "vitest";

import {
  deepSeekFailureFromOutput,
  providerFailureDiagnostic,
} from "./providerFailure.ts";

describe("DeepSeek failure diagnostics", () => {
  it("preserves a terminal stderr failure behind long tool output", () => {
    const stdout = JSON.stringify({ type: "tool_use", text: "timeout=120" }).repeat(200);
    expect(deepSeekFailureFromOutput(stdout, "HTTP 402 Insufficient Balance")?.diagnostic)
      .toMatchObject({ kind: "quota", retryable: false });
  });

  it("prefers the structured CLI error over stderr warnings", () => {
    const stdout = '{"type":"error","error":{"message":"Transport"}}';
    expect(deepSeekFailureFromOutput(stdout, "Bootstrap timeout warning")?.diagnostic)
      .toMatchObject({ kind: "network", retryable: true });
  });

  it("does not use earlier billing text when the terminal error has no detail", () => {
    expect(deepSeekFailureFromOutput(
      'Insufficient Balance was discussed\n{"type":"error","error":null}',
    )).toBeUndefined();
  });

  it("classifies the terminal transport error instead of earlier session text", () => {
    const error = deepSeekFailureFromOutput(
      [
        '{"type":"step-start","text":"timeout=120 and insufficient balance were discussed"}',
        '{"type":"error","error":{"type":"unknown","message":"Transport"}}',
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

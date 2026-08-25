import type { InvestigationJobOutput } from "@public-patterns/contracts/investigation";
import { describe, expect, it } from "vitest";

import {
  parseInvestigationFailure,
  serializeInvestigationFailure,
} from "./manualInvestigationJobs.ts";

describe("manual investigation jobs", () => {
  it("preserves safe retry diagnostics across Workflow retries", () => {
    const failure = {
      status: "failed",
      error: "investigation failed",
      retryable: true,
      archiveKey: "investigations/failure.json",
      provider: {
        provider: "DeepSeek",
        operation: "agent investigation",
        retryable: true,
        kind: "timeout",
      },
    } satisfies Extract<InvestigationJobOutput, { status: "failed" }>;

    expect(
      parseInvestigationFailure(
        new Error(`step failed: ${serializeInvestigationFailure(failure)}`),
      ),
    ).toEqual(failure);
  });

  it("redacts unexpected Workflow errors", () => {
    expect(parseInvestigationFailure(new Error("database details"))).toEqual({
      status: "failed",
      error: "investigation failed",
      retryable: true,
    });
  });
});

import { describe, expect, it, vi } from "vitest";

import {
  investigateCase,
  InvestigatorRequestError,
  listInvestigations,
  shouldInvestigate,
} from "./investigations.ts";

describe("InvestigatorRequestError", () => {
  it("keeps the durable archive location in its message", () => {
    const error = new InvestigatorRequestError("Investigator failed", true, {
      error: "Provider unavailable",
      archiveKey: "investigations/failure.json",
    });

    expect(error.message).toBe(
      "Investigator failed; archive investigations/failure.json",
    );
  });

  it("retries an unclassified investigator 500", async () => {
    const request = investigateCase({
      db: {} as D1Database,
      investigator: {
        fetch: async () =>
          Response.json({ error: "investigation failed" }, { status: 500 }),
      },
      investigationCase: {
        input: {
          source: "311",
          day: "2026-08-24",
          kind: "Noise Report",
          area: "Mission",
        },
        createdAt: "2026-08-24T12:00:00.000Z",
        data: {},
      },
    });

    await expect(request).rejects.toMatchObject({ retryable: true });
  });
});

describe("daily candidate policy", () => {
  it("skips routine passing calls without suppressing other dispatch bursts", () => {
    expect(shouldInvestigate("dispatch", { kind: "PASSING CALL" })).toBe(false);
    expect(shouldInvestigate("dispatch", { kind: "FIGHT NO WEAPON" })).toBe(true);
    expect(shouldInvestigate("311", { kind: "Passing call" })).toBe(true);
  });
});

describe("listInvestigations", () => {
  it("skips an invalid legacy row without breaking the review queue", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const db = {
      prepare: () => ({
        all: async () => ({
          results: [
            {
              id: "legacy",
              created_at: "2026-07-28T00:00:00.000Z",
              source: "311",
              day: "2026-07-27",
              kind: "Noise",
              area: "Mission",
              result_json: JSON.stringify({
                id: "legacy",
                archiveKey: "investigations/legacy.json",
                submission: {
                  outcome: "investigate",
                  confidence: 0.8,
                  evidence: [],
                },
                brief: "Legacy brief",
                article: "Legacy markdown",
              }),
              published_slug: null,
            },
            {
              id: "current",
              created_at: "2026-07-29T00:00:00.000Z",
              source: "311",
              day: "2026-07-28",
              kind: "Noise",
              area: "Mission",
              result_json: JSON.stringify({
                id: "current",
                archiveKey: "investigations/current.json",
                submission: {
                  outcome: "watch",
                  confidence: 0.7,
                  evidence: [],
                },
                brief: "Current brief",
                article: null,
                review: null,
              }),
              published_slug: null,
            },
          ],
        }),
      }),
    };

    await expect(
      listInvestigations(db as unknown as D1Database),
    ).resolves.toEqual([
      expect.objectContaining({ id: "current", outcome: "watch" }),
    ]);
    expect(warn).toHaveBeenCalledWith(
      "Skipping invalid investigation legacy",
    );
    warn.mockRestore();
  });
});

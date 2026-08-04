import { describe, expect, it, vi } from "vitest";

import {
  listInvestigations,
  shouldInvestigate,
} from "./investigations.ts";

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

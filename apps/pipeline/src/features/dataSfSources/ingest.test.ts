import { describe, expect, it } from "vitest";

import { getBackfillCursor } from "./ingest.ts";

describe("DataSF backfill cursor", () => {
  it("rewinds a source and abandons its narrower scan", () => {
    expect(
      getBackfillCursor({
        stored: {
          collectingSince: "2026-07-26T00:00:00.000",
          through: "2026-07-29T00:00:00.000",
          scan: {
            since: "2026-07-27T00:00:00.000",
            until: "2026-07-30T00:00:00.000",
          },
        },
        observedAt: "2026-07-31T12:00:00Z",
        source: "311",
        since: "2026-06-28T00:00:00.000",
      }),
    ).toEqual({
      collectingSince: "2026-06-26T00:00:00.000",
      through: "2026-06-28T00:00:00.000",
    });
  });

  it("does not restart an already covered backfill", () => {
    expect(
      getBackfillCursor({
        stored: {
          collectingSince: "2026-06-01T00:00:00.000",
          through: "2026-07-30T00:00:00.000",
        },
        observedAt: "2026-07-31T12:00:00Z",
        source: "police-incidents",
        since: "2026-06-28T00:00:00.000",
      }),
    ).toBeNull();
  });
});

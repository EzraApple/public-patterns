import { describe, expect, it } from "vitest";

import { getCurrentDispatchMetadata } from "./read.ts";

describe("dispatch reads", () => {
  it("limits revision ranking to the requested detector days", async () => {
    let query = "";
    let bindings: unknown[] = [];
    const db = {
      prepare(sql: string) {
        query = sql;
        return {
          bind(...values: unknown[]) {
            bindings = values;
            return {
              async all() {
                return { results: [] };
              },
            };
          },
        };
      },
    } as unknown as D1Database;

    await getCurrentDispatchMetadata({
      db,
      ranges: [
        { start: "2026-07-30T00:00:00", end: "2026-07-31T00:00:00" },
        { start: "2026-07-23T00:00:00", end: "2026-07-24T00:00:00" },
      ],
    });

    expect(query).not.toContain("row_number() OVER");
    expect(query.match(/NOT EXISTS/g)).toHaveLength(2);
    expect(query.match(/occurred_at >= \?/g)).toHaveLength(2);
    expect(bindings).toHaveLength(4);
  });
});

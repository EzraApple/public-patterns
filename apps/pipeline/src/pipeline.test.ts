import { describe, expect, it } from "vitest";

import type { Env } from "./environment.ts";
import { routeRequest } from "./pipeline.ts";

describe("pipeline routes", () => {
  it("waits for closed dispatch history before detecting bursts", async () => {
    const response = await routeRequest(
      new Request(
        "http://pipeline.test/bursts?source=dispatch&day=2026-07-24",
      ),
      {
        DB: sourceDb({
          "dispatch-realtime": {
            collectingSince: "2026-06-01T00:00:00",
          },
        }),
      } as Env,
    );

    expect(await response.json()).toEqual({
      source: "dispatch",
      day: "2026-07-24",
      ready: false,
      bursts: [],
    });
  });

  it("uses closed dispatch history with a current realtime cursor", async () => {
    const response = await routeRequest(
      new Request(
        "http://pipeline.test/bursts?source=dispatch&day=2026-07-24",
      ),
      {
        DB: sourceDb({
          "dispatch-realtime": {
            collectingSince: "2026-07-23T00:00:00",
          },
          "dispatch-closed": {
            collectingSince: "2026-06-01T00:00:00",
          },
        }),
      } as Env,
    );

    expect(await response.json()).toMatchObject({ ready: true, bursts: [] });
  });

  it("rejects a legacy 311 cursor until semantic ingestion has run", async () => {
    const response = await routeRequest(
      new Request("http://pipeline.test/bursts?source=311&day=2026-07-24"),
      {
        DB: sourceDb({
          "311": { collectingSince: "2026-06-01T00:00:00" },
        }),
      } as Env,
    );

    expect(await response.json()).toMatchObject({ ready: false });
  });

  it("rejects a cursor that has not been checked recently", async () => {
    const response = await routeRequest(
      new Request("http://pipeline.test/bursts?source=311&day=2026-07-24"),
      {
        DB: sourceDb({
          "311": {
            collectingSince: "2026-06-01T00:00:00",
            cursorField: "updated_datetime",
            savedAt: "2026-07-25T00:05:00Z",
          },
        }),
      } as Env,
    );

    expect(await response.json()).toMatchObject({ ready: false });
  });

  it("does not expose transit alerts through the burst detector", async () => {
    const response = await routeRequest(
      new Request(
        "http://pipeline.test/bursts?source=transit-alerts&day=2026-07-24",
      ),
      {} as Env,
    );

    expect(response.status).toBe(400);
  });

  it("returns the recovery action for a missing transit key", async () => {
    const response = await routeRequest(
      new Request("http://pipeline.test/ingest/transit-alerts", {
        method: "POST",
      }),
      {} as Env,
    );

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      api: {
        kind: "configuration",
        action: expect.stringContaining("TRANSIT_511_API_KEY"),
      },
    });
  });
});

function sourceDb(
  cursors: Record<
    string,
    {
      collectingSince: string;
      cursorField?: string;
      savedAt?: string;
    }
  >,
): D1Database {
  return {
    prepare(sql: string) {
      if (
        sql.includes("SELECT cursor_json, saved_at")
      ) {
        return {
          bind(source: string) {
            return {
              async first() {
                const cursor = cursors[source];
                return cursor
                  ? {
                      cursor_json: JSON.stringify({
                        collectingSince: cursor.collectingSince,
                        ...(cursor.cursorField
                          ? { cursorField: cursor.cursorField }
                          : {}),
                      }),
                      saved_at: cursor.savedAt ?? new Date().toISOString(),
                    }
                  : null;
              },
            };
          },
        };
      }
      return {
        bind() {
          return {
            async all() {
              return { results: [] };
            },
          };
        },
      };
    },
  } as unknown as D1Database;
}

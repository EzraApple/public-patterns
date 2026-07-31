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
        DB: dispatchDb({
          "dispatch-realtime": "2026-06-01T00:00:00",
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
        DB: dispatchDb({
          "dispatch-realtime": "2026-07-23T00:00:00",
          "dispatch-closed": "2026-06-01T00:00:00",
        }),
      } as Env,
    );

    expect(await response.json()).toMatchObject({ ready: true, bursts: [] });
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

function dispatchDb(cursors: Record<string, string>): D1Database {
  return {
    prepare(sql: string) {
      if (
        sql ===
        "SELECT cursor_json FROM ingestion_cursors WHERE ingestion = ?"
      ) {
        return {
          bind(source: string) {
            return {
              async first() {
                const collectingSince = cursors[source];
                return collectingSince
                  ? { cursor_json: JSON.stringify({ collectingSince }) }
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

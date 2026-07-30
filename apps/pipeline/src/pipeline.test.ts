import { describe, expect, it } from "vitest";

import type { Env } from "./environment.ts";
import { routeRequest } from "./pipeline.ts";

describe("pipeline routes", () => {
  it("waits for both physical dispatch cursors before detecting bursts", async () => {
    const db = {
      prepare() {
        return {
          bind(source: string) {
            return {
              async first() {
                return source === "dispatch-realtime"
                  ? {
                      cursor_json: JSON.stringify({
                        collectingSince: "2026-06-01T00:00:00",
                      }),
                    }
                  : null;
              },
            };
          },
        };
      },
    } as unknown as D1Database;

    const response = await routeRequest(
      new Request(
        "http://pipeline.test/bursts?source=dispatch&day=2026-07-24",
      ),
      { DB: db } as Env,
    );

    expect(await response.json()).toEqual({
      source: "dispatch",
      day: "2026-07-24",
      ready: false,
      bursts: [],
    });
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

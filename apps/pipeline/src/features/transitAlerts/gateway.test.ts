import { describe, expect, it, vi } from "vitest";

import { createTransitAlertGateway } from "./gateway.ts";

describe("511 transit alert gateway", () => {
  it("explains how to configure a missing key", () => {
    expect(() =>
      createTransitAlertGateway({ fetch: vi.fn(), apiKey: "" }),
    ).toThrow("Set TRANSIT_511_API_KEY in Doppler");
  });

  it("requests the SFMTA JSON snapshot and preserves unknown fields", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(Response.json(feed([entity("alert-1")])));
    const gateway = createTransitAlertGateway({
      fetch,
      apiKey: "secret-key",
    });

    const snapshot = await gateway.getSnapshot();

    const url = new URL(String(fetch.mock.calls[0]?.[0]));
    expect(url.searchParams.get("agency")).toBe("SF");
    expect(url.searchParams.get("format")).toBe("json");
    expect(url.searchParams.get("api_key")).toBe("secret-key");
    expect(fetch.mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal);
    expect(snapshot.entities[0]).toMatchObject({
      Id: "alert-1",
      extra: "preserved",
      Alert: { providerDetail: "preserved" },
    });
  });

  it("keeps valid alerts and reports malformed entities", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      Response.json(
        feed([
          entity("alert-1"),
          { Id: "alert-2", Alert: null },
        ]),
      ),
    );
    const gateway = createTransitAlertGateway({ fetch, apiKey: "key" });

    const snapshot = await gateway.getSnapshot();

    expect(snapshot.entities).toHaveLength(1);
    expect(snapshot.errors).toMatchObject([
      {
        source: "transit-alerts",
        dataset: "511-service-alerts",
        data: { Id: "alert-2", Alert: null },
      },
    ]);
  });

  it("uses its backoff and honors HTTP-date Retry-After", async () => {
    const now = Date.UTC(2026, 6, 27, 12);
    const dateNow = vi.spyOn(Date, "now").mockReturnValue(now);
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(
        new Response(null, {
          status: 429,
          headers: {
            "Retry-After": new Date(now + 2_000).toUTCString(),
          },
        }),
      )
      .mockResolvedValueOnce(Response.json(feed([])));
    const sleep = vi.fn(async () => undefined);
    const gateway = createTransitAlertGateway({
      fetch,
      apiKey: "key",
      sleep,
      maxAttempts: 3,
    });

    await gateway.getSnapshot();

    expect(fetch).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenNthCalledWith(1, 1_000);
    expect(sleep).toHaveBeenNthCalledWith(2, 2_000);
    dateNow.mockRestore();
  });

  it("reports an actionable invalid-key failure", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      Response.json(
        { error: { code: "invalid_key", message: "Invalid key" } },
        {
          status: 401,
          headers: { "x-request-id": "transit-request-1" },
        },
      ),
    );
    const gateway = createTransitAlertGateway({
      fetch,
      apiKey: "secret-key",
      maxAttempts: 1,
    });

    const error = await gateway.getSnapshot().catch((caught) => caught);

    expect(error).toMatchObject({
      diagnostic: {
        kind: "authentication",
        requestId: "transit-request-1",
      },
    });
    expect((error as Error).message).toContain(
      "Verify or rotate TRANSIT_511_API_KEY",
    );
    expect((error as Error).message).not.toContain("secret-key");
  });
});

function feed(entities: unknown[]) {
  return {
    Header: {
      GtfsRealtimeVersion: "1.0",
      incrementality: 0,
      Timestamp: 1_753_350_000,
    },
    Entities: entities,
  };
}

function entity(id: string) {
  return {
    Id: id,
    Alert: {
      ActivePeriods: [{ Start: 1_753_346_400 }],
      InformedEntities: [{ AgencyId: "SF", RouteId: "N" }],
      HeaderText: {
        Translations: [{ Text: "N Judah disruption", Language: "en" }],
      },
      providerDetail: "preserved",
    },
    extra: "preserved",
  };
}

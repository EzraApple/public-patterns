import { describe, expect, it } from "vitest";

import type { TransitAlertSnapshot } from "./gateway.ts";
import { getTransitAlertChanges } from "./ingest.ts";

describe("511 transit alert ingestion", () => {
  it("emits new or changed alerts and ignores unchanged snapshot rows", async () => {
    const first = await getTransitAlertChanges({
      gateway: gateway(snapshot("First description")),
      observedAt: "2025-07-24T13:05:00.000Z",
    });
    const replay = await getTransitAlertChanges({
      gateway: gateway(reorderedSnapshot(1_753_362_060)),
      observedAt: "2025-07-24T13:06:00.000Z",
      storedCursor: first.cursor,
    });
    const changed = await getTransitAlertChanges({
      gateway: gateway(snapshot("Updated description", 1_753_362_120)),
      observedAt: "2025-07-24T13:07:00.000Z",
      storedCursor: replay.cursor,
    });

    expect(first.observations).toMatchObject([
      {
        source: "transit-alerts",
        id: "alert-1",
        occurredAt: "2025-07-24T12:00:00.000Z",
        updatedAt: "2025-07-24T13:00:00.000Z",
        observedAt: "2025-07-24T13:05:00.000Z",
        kind: "N Judah disruption",
        area: null,
        data: {
          Alert: {
            InformedEntities: [{ AgencyId: "SF", RouteId: "N" }],
          },
        },
      },
    ]);
    expect(replay.observations).toEqual([]);
    expect(changed.observations).toHaveLength(1);
    expect(changed.observations[0]?.updatedAt).toBe(
      "2025-07-24T13:02:00.000Z",
    );
  });
});

function gateway(result: TransitAlertSnapshot) {
  return { getSnapshot: async () => result };
}

function snapshot(
  description: string,
  generatedAt = 1_753_362_000,
): TransitAlertSnapshot {
  return {
    generatedAt,
    entities: [
      {
        Id: "alert-1",
        Alert: {
          ActivePeriods: [{ Start: 1_753_358_400 }],
          InformedEntities: [{ AgencyId: "SF", RouteId: "N" }],
          HeaderText: {
            Translations: [
              { Text: "N Judah disruption", Language: "en" },
            ],
          },
          DescriptionText: {
            Translations: [{ Text: description, Language: "en" }],
          },
        },
      },
    ],
    errors: [],
  };
}

function reorderedSnapshot(generatedAt: number): TransitAlertSnapshot {
  const original = snapshot("First description", generatedAt);
  const entity = original.entities[0]!;
  return {
    ...original,
    entities: [{ Alert: entity.Alert, Id: entity.Id }],
  };
}

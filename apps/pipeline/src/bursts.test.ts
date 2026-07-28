import { describe, expect, it } from "vitest";

import { findBursts } from "./bursts.ts";
import { shiftDay } from "./ingestion.ts";
import type { Observation } from "./observations.ts";

describe("findBursts", () => {
  it("finds a large same-weekday change", () => {
    const day = "2026-07-23";
    const observations = [
      ...[1, 2, 3, 4].flatMap((week) =>
        createObservations(shiftDay(day, -7 * week), 2),
      ),
      ...createObservations(day, 20),
    ];

    expect(findBursts(observations, day)).toMatchObject([
      {
        day,
        kind: "Noise Report",
        area: "Mission",
        observed: 20,
        expected: 2,
        ratio: 10,
      },
    ]);
  });

  it("does not treat ordinary variation as a burst", () => {
    const day = "2026-07-23";
    expect(
      findBursts(
        [1, 2, 3, 4, 0].flatMap((week) =>
          createObservations(shiftDay(day, -7 * week), 2),
        ),
        day,
      ),
    ).toEqual([]);
  });
});

function createObservations(day: string, count: number): Observation[] {
  return Array.from({ length: count }, (_, index) => ({
    source: "311",
    id: `${day}-${index}`,
    occurredAt: `${day}T12:00:00`,
    updatedAt: `${day}T13:00:00`,
    observedAt: "2026-07-24T12:00:00Z",
    kind: "Noise Report",
    area: "Mission",
    data: {},
  }));
}

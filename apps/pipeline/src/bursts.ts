import type { Observation } from "./observations.ts";
import { shiftDay } from "./ingestion.ts";

const minimumObserved = 20;
const minimumExcess = 15;
const minimumRatio = 2.5;

export type Burst = {
  day: string;
  kind: string;
  area: string | null;
  observed: number;
  expected: number;
  ratio: number;
  observationIds: string[];
};

export function findBursts(
  observations: Observation[],
  day: string,
): Burst[] {
  const baselineDays = [1, 2, 3, 4].map((week) => shiftDay(day, -7 * week));
  const relevantDays = new Set([day, ...baselineDays]);
  const groups = new Map<string, Map<string, Observation[]>>();

  for (const observation of observations) {
    const observationDay = observation.occurredAt.slice(0, 10);
    if (!relevantDays.has(observationDay)) {
      continue;
    }
    const key = JSON.stringify([observation.kind, observation.area]);
    const byDay = groups.get(key) ?? new Map();
    const values = byDay.get(observationDay) ?? [];
    values.push(observation);
    byDay.set(observationDay, values);
    groups.set(key, byDay);
  }

  const bursts: Burst[] = [];
  for (const byDay of groups.values()) {
    const current = byDay.get(day) ?? [];
    const baselineCounts = baselineDays.map(
      (baselineDay) => byDay.get(baselineDay)?.length ?? 0,
    );
    const expected =
      baselineCounts.reduce((sum, count) => sum + count, 0) /
      baselineCounts.length;
    const ratio = current.length / Math.max(expected, 2);
    if (
      current.length < minimumObserved ||
      current.length - expected < minimumExcess ||
      ratio < minimumRatio
    ) {
      continue;
    }
    const example = current[0]!;
    bursts.push({
      day,
      kind: example.kind,
      area: example.area,
      observed: current.length,
      expected,
      ratio,
      observationIds: current.map(({ id }) => id).sort(),
    });
  }

  return bursts.sort((left, right) =>
    JSON.stringify([left.kind, left.area]).localeCompare(
      JSON.stringify([right.kind, right.area]),
    ),
  );
}

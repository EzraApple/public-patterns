import type { Observation } from "./observation.ts";
import { shiftDay } from "./ingestion.ts";
import { getCurrentDispatch } from "./features/dispatch/read.ts";
import {
  getCurrent,
  getIngestionCursor,
} from "./observationStore.ts";

const minimumObserved = 20;
const minimumExcess = 15;
const minimumRatio = 2.5;

export const burstSources = [
  "311",
  "dispatch",
  "fire-ems",
  "police-incidents",
  "building-complaints",
  "traffic-crashes",
  "health-inspections",
  "building-permits",
  "eviction-notices",
] as const;

export type BurstSource = (typeof burstSources)[number];

export type Burst = {
  day: string;
  kind: string;
  area: string | null;
  observed: number;
  expected: number;
  ratio: number;
  observationIds: string[];
};

export type BurstResult = {
  source: BurstSource;
  day: string;
  ready: boolean;
  bursts: Burst[];
};

export async function getBursts(
  db: D1Database,
  source: BurstSource,
  day: string,
): Promise<BurstResult> {
  const physicalSources =
    source === "dispatch"
      ? (["dispatch-realtime", "dispatch-closed"] as const)
      : ([source] as const);
  const cursors = await Promise.all(
    physicalSources.map((physicalSource) =>
      getIngestionCursor(db, physicalSource),
    ),
  );
  const baselineStart = `${shiftDay(day, -28)}T00:00:00`;
  if (
    cursors.some((value) => {
      const cursor = value as
        | { collectingSince?: string; scan?: unknown }
        | undefined;
      return (
        !cursor?.collectingSince ||
        cursor.collectingSince > baselineStart ||
        cursor.scan !== undefined
      );
    })
  ) {
    return { source, day, ready: false, bursts: [] };
  }

  const start = shiftDay(day, -28);
  const end = shiftDay(day, 1);
  const observations =
    source === "dispatch"
      ? await getCurrentDispatch({ db, start, end })
      : await getCurrent({ db, source, start, end });
  return {
    source,
    day,
    ready: true,
    bursts: findBursts(observations, day),
  };
}

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

import type { Observation } from "./observation.ts";
import { shiftDay } from "./ingestion.ts";
import {
  getCurrentDispatchMetadata,
} from "./features/dispatch/read.ts";
import {
  getInspectionRepresentatives,
} from "./features/healthInspections/read.ts";
import {
  getCurrentMetadata,
  getIngestionCursor,
} from "./observationStore.ts";

export const weekdayBurstDetector = {
  name: "weekday-burst",
  version: 1,
  baselineWeeks: 4,
  minimumObserved: 20,
  minimumExcess: 15,
  minimumRatio: 2.5,
} as const;

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

type DetectionObservation = Pick<
  Observation,
  "source" | "id" | "occurredAt" | "kind" | "area"
>;

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

  const days = [
    day,
    ...[1, 2, 3, 4].map((week) => shiftDay(day, -7 * week)),
  ];
  const observations = await getDetectorObservations({
    db,
    source,
    days,
  });
  return {
    source,
    day,
    ready: true,
    bursts: findBursts(observations, day),
  };
}

export async function getDetectorObservations({
  db,
  source,
  days,
}: {
  db: D1Database;
  source: BurstSource;
  days: string[];
}): Promise<DetectionObservation[]> {
  const ranges = days.map((value) => ({
    start: `${value}T00:00:00`,
    end: `${shiftDay(value, 1)}T00:00:00`,
  }));
  if (source === "dispatch") {
    return getCurrentDispatchMetadata({ db, ranges });
  }
  if (source === "health-inspections") {
    return (
      await Promise.all(
        ranges.map(({ start, end }) =>
          getInspectionRepresentatives({ db, start, end }),
        ),
      )
    ).flat();
  }
  return getCurrentMetadata({ db, source, ranges });
}

export function findBursts(
  observations: DetectionObservation[],
  day: string,
): Burst[] {
  const baselineDays = Array.from(
    { length: weekdayBurstDetector.baselineWeeks },
    (_, index) => shiftDay(day, -7 * (index + 1)),
  );
  const relevantDays = new Set([day, ...baselineDays]);
  const groups = new Map<
    string,
    Map<string, DetectionObservation[]>
  >();

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
      current.length < weekdayBurstDetector.minimumObserved ||
      current.length - expected < weekdayBurstDetector.minimumExcess ||
      ratio < weekdayBurstDetector.minimumRatio
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

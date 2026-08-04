import type { Observation } from "./observation.ts";
import { shiftDay } from "./ingestion.ts";
import {
  getCurrentDispatchMetadata,
} from "./features/dispatch/read.ts";
import { getCurrentFireMetadata } from "./features/fireEms/read.ts";
import {
  getInspectionRepresentatives,
} from "./features/healthInspections/read.ts";
import {
  getCurrentMetadata,
  getIngestionState,
} from "./observationStore.ts";

export const weekdayBurstDetector = {
  name: "weekday-burst",
  version: 2,
  baselineWeeks: 4,
  minimumObserved: 20,
  minimumExcess: 15,
  minimumRatio: 2.5,
} as const;

const sourceFreshnessMilliseconds = 2 * 60 * 60 * 1_000;

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
> & { groupId?: string };

export async function getBursts(
  db: D1Database,
  source: BurstSource,
  day: string,
  checkedAt = new Date().toISOString(),
): Promise<BurstResult> {
  const physicalSources =
    source === "dispatch"
      ? (["dispatch-realtime", "dispatch-closed"] as const)
      : ([source] as const);
  const cursors = await Promise.all(
    physicalSources.map((physicalSource) =>
      getIngestionState(db, physicalSource),
    ),
  );
  const baselineStart = `${shiftDay(day, -28)}T00:00:00`;
  if (!hasCompleteBaseline(source, cursors, baselineStart, checkedAt)) {
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

function hasCompleteBaseline(
  source: BurstSource,
  values: unknown[],
  baselineStart: string,
  checkedAt: string,
): boolean {
  const checkedAfter = new Date(
    Date.parse(checkedAt) - sourceFreshnessMilliseconds,
  ).toISOString();
  if (source === "dispatch") {
    const [realtime, closed] = values;
    return (
      isReady(realtime, { checkedAfter }) &&
      isReady(closed, { baselineStart, checkedAfter })
    );
  }
  return isReady(values[0], {
    baselineStart,
    checkedAfter,
    ...(source === "311" ? { cursorField: "updated_datetime" } : {}),
  });
}

function isReady(
  value: unknown,
  {
    baselineStart,
    checkedAfter,
    cursorField,
  }: {
    baselineStart?: string;
    checkedAfter: string;
    cursorField?: string;
  },
): boolean {
  if (!value || typeof value !== "object") {
    return false;
  }
  const state = value as {
    cursor?: {
      collectingSince?: string;
      cursorField?: string;
      scan?: unknown;
    };
    savedAt?: string;
  };
  const cursor = state.cursor;
  return (
    typeof state.savedAt === "string" &&
    state.savedAt >= checkedAfter &&
    typeof cursor?.collectingSince === "string" &&
    cursor.scan === undefined &&
    (cursorField === undefined || cursor.cursorField === cursorField) &&
    (baselineStart === undefined || cursor.collectingSince <= baselineStart)
  );
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
  if (source === "fire-ems") {
    return getCurrentFireMetadata({ db, ranges });
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
      (baselineDay) => countGroups(byDay.get(baselineDay) ?? []),
    );
    const observed = countGroups(current);
    const expected =
      baselineCounts.reduce((sum, count) => sum + count, 0) /
      baselineCounts.length;
    const ratio = observed / Math.max(expected, 2);
    if (
      observed < weekdayBurstDetector.minimumObserved ||
      observed - expected < weekdayBurstDetector.minimumExcess ||
      ratio < weekdayBurstDetector.minimumRatio
    ) {
      continue;
    }
    const example = current[0]!;
    bursts.push({
      day,
      kind: example.kind,
      area: example.area,
      observed,
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

function countGroups(observations: DetectionObservation[]): number {
  return new Set(observations.map(({ groupId, id }) => groupId ?? id)).size;
}

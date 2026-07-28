import type { Observation } from "@/observation.ts";
import { getCurrent } from "@/observationStore.ts";

type InspectionGroup = {
  representative: Observation;
  observations: Observation[];
};

export async function getInspectionRepresentatives({
  db,
  start,
  end,
}: {
  db: D1Database;
  start: string;
  end: string;
}): Promise<Observation[]> {
  return selectInspectionRepresentatives(
    await getCurrent({
      db,
      source: "health-inspections",
      start,
      end,
    }),
  );
}

export function selectInspectionRepresentatives(
  observations: Observation[],
): Observation[] {
  return groupInspections(observations)
    .map(({ representative }) => representative)
    .sort(compareObservations);
}

export function getInspectionEvidence(
  observations: Observation[],
  selectedIds: Set<string>,
): Observation[] {
  return groupInspections(observations)
    .filter(({ representative }) => selectedIds.has(representative.id))
    .flatMap(({ observations }) => observations)
    .sort(compareObservations);
}

function groupInspections(
  observations: Observation[],
): InspectionGroup[] {
  const groups = new Map<string, InspectionGroup>();

  for (const observation of observations) {
    const key = inspectionKey(observation);
    const group = groups.get(key);
    if (!group) {
      groups.set(key, {
        representative: observation,
        observations: [observation],
      });
      continue;
    }
    group.observations.push(observation);
    if (compareRepresentatives(group.representative, observation) < 0) {
      group.representative = observation;
    }
  }

  return [...groups.values()];
}

function compareObservations(
  left: Observation,
  right: Observation,
): number {
  return (
    left.occurredAt.localeCompare(right.occurredAt) ||
    left.id.localeCompare(right.id)
  );
}

function inspectionKey(observation: Observation): string {
  const permit = sourceString(observation.data.permit_number);
  const inspector = sourceString(observation.data.inspector);
  if (!permit || !inspector) {
    return `row:${observation.id}`;
  }
  return JSON.stringify([
    permit,
    observation.occurredAt,
    inspector,
    sourceString(observation.data.inspection_type),
  ]);
}

function compareRepresentatives(
  left: Observation,
  right: Observation,
): number {
  return (
    statusRank(left) - statusRank(right) ||
    left.updatedAt.localeCompare(right.updatedAt) ||
    left.observedAt.localeCompare(right.observedAt) ||
    left.id.localeCompare(right.id)
  );
}

function statusRank(observation: Observation): number {
  switch (sourceString(observation.data.facility_rating_status)) {
    case "Closure":
      return 3;
    case "Conditional Pass":
      return 2;
    case "Pass":
      return 1;
    default:
      return 0;
  }
}

function sourceString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0
    ? value
    : undefined;
}

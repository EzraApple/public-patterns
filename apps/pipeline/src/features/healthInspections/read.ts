import type { Observation } from "@/observation.ts";
import { getCurrent } from "@/observationStore.ts";

export async function getCurrentHealthInspections({
  db,
  start,
  end,
}: {
  db: D1Database;
  start: string;
  end: string;
}): Promise<Observation[]> {
  return dedupeInspections(
    await getCurrent({
      db,
      source: "health-inspections",
      start,
      end,
    }),
  );
}

export function dedupeInspections(
  observations: Observation[],
): Observation[] {
  const inspections = new Map<string, Observation>();

  for (const observation of observations) {
    const key = inspectionKey(observation);
    const current = inspections.get(key);
    if (!current || compareVersions(current, observation) < 0) {
      inspections.set(key, observation);
    }
  }

  return [...inspections.values()].sort(
    (left, right) =>
      left.occurredAt.localeCompare(right.occurredAt) ||
      left.id.localeCompare(right.id),
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

function compareVersions(
  left: Observation,
  right: Observation,
): number {
  return (
    left.updatedAt.localeCompare(right.updatedAt) ||
    left.observedAt.localeCompare(right.observedAt) ||
    left.id.localeCompare(right.id)
  );
}

function sourceString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0
    ? value
    : undefined;
}

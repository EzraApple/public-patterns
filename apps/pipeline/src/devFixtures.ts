import { shiftDay } from "./ingestion.ts";
import { save, type Observation } from "./observations.ts";

export async function seed({
  db,
  day,
  observedAt,
}: {
  db: D1Database;
  day: string;
  observedAt: string;
}): Promise<{ observations: number }> {
  const baselineDays = [1, 2, 3, 4].map((week) => shiftDay(day, -7 * week));
  const observations = [
    ...baselineDays.flatMap((baselineDay) =>
      create311Observations(baselineDay, 2, observedAt),
    ),
    ...create311Observations(day, 20, observedAt),
  ];
  const closedDispatch = dispatchObservation("closed", day, observedAt);
  const dispatchCluster = createDispatchCluster(day, observedAt);
  await save({
    db,
    ingestion: "311",
    observations,
    cursor: {
      collectingSince: `${baselineDays.at(-1)}T00:00:00`,
      through: observedAt.slice(0, -1),
    },
    observedAt,
  });
  await save({
    db,
    ingestion: "dispatch-realtime",
    observations: [
      dispatchObservation("realtime", day, observedAt),
      ...dispatchCluster.filter(
        (observation) => observation.source === "dispatch-realtime",
      ),
    ],
    cursor: {
      collectingSince: `${baselineDays.at(-1)}T00:00:00`,
      through: observedAt.slice(0, -1),
    },
    observedAt,
  });
  await save({
    db,
    ingestion: "dispatch-closed",
    observations: [
      closedDispatch,
      {
        ...closedDispatch,
        kind: "Corrected Final Call",
        data: { feed: "closed", corrected: true },
      },
      ...dispatchCluster.filter(
        (observation) => observation.source === "dispatch-closed",
      ),
    ],
    cursor: {
      collectingSince: `${baselineDays.at(-1)}T00:00:00`,
      through: observedAt.slice(0, -1),
    },
    observedAt,
  });
  return { observations: observations.length + 3 + dispatchCluster.length };
}

function create311Observations(
  day: string,
  count: number,
  observedAt: string,
): Observation[] {
  return Array.from({ length: count }, (_, index) => ({
    source: "311",
    id: `${day}-${index}`,
    occurredAt: `${day}T12:00:00`,
    updatedAt: `${day}T13:00:00`,
    observedAt,
    kind: "Noise Report",
    area: "Mission",
    data: { serviceRequestId: `${day}-${index}` },
  }));
}

function dispatchObservation(
  feed: "realtime" | "closed",
  day: string,
  observedAt: string,
): Observation {
  return {
    source: feed === "realtime" ? "dispatch-realtime" : "dispatch-closed",
    id: "fixture-call",
    occurredAt: `${day}T10:00:00`,
    updatedAt: `${day}T${feed === "realtime" ? "11" : "12"}:00:00`,
    observedAt,
    kind: feed === "realtime" ? "Initial Call" : "Final Call",
    area: "Mission",
    data: { feed },
  };
}

function createDispatchCluster(
  day: string,
  observedAt: string,
): Observation[] {
  const ids = Array.from({ length: 20 }, (_, index) => `cluster-${index}`);
  const paired = ids.flatMap((id) => [
    clusterObservation("realtime", id, day, observedAt),
    clusterObservation("closed", id, day, observedAt),
  ]);
  return [
    ...paired,
    clusterObservation("realtime", "boundary", day, observedAt),
    clusterObservation("closed", "boundary", shiftDay(day, 1), observedAt),
  ];
}

function clusterObservation(
  feed: "realtime" | "closed",
  id: string,
  day: string,
  observedAt: string,
): Observation {
  return {
    source: feed === "realtime" ? "dispatch-realtime" : "dispatch-closed",
    id,
    occurredAt: `${day}T10:00:00`,
    updatedAt: `${day}T${feed === "realtime" ? "11" : "12"}:00:00`,
    observedAt,
    kind: "Dispatch Cluster",
    area: "Mission",
    data: { feed },
  };
}

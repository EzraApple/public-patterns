import { z } from "zod";

import { hashJson } from "@/canonicalJson.ts";
import type { Env } from "@/environment.ts";
import type { Observation, SourceError } from "@/observation.ts";
import {
  getIngestionCursor,
  saveBatch,
} from "@/observationStore.ts";
import {
  createTransitAlertGateway,
  type TransitAlertGateway,
} from "./gateway.ts";
import type { TransitAlertEntity } from "./schema.ts";

const cursorSchema = z
  .object({
    generatedAt: z.number().int().nonnegative(),
    entities: z.record(z.string(), z.string().regex(/^[a-f0-9]{64}$/)),
  })
  .strict();

export type TransitAlertCursor = z.infer<typeof cursorSchema>;

export type TransitAlertChanges = {
  ingestion: "transit-alerts";
  status: "complete";
  batches: 1;
  observations: Observation[];
  errors: SourceError[];
  cursor: TransitAlertCursor;
};

export async function ingestTransitAlerts(
  env: Env,
  observedAt: string,
  gateway: TransitAlertGateway = createTransitAlertGateway({
    fetch,
    apiKey: env.TRANSIT_511_API_KEY ?? "",
  }),
) {
  const changes = await getTransitAlertChanges({
    gateway,
    observedAt,
    storedCursor: await getIngestionCursor(env.DB, "transit-alerts"),
  });
  await saveBatch({
    db: env.DB,
    ingestion: "transit-alerts",
    observations: changes.observations,
    errors: changes.errors,
    cursor: changes.cursor,
    observedAt,
  });
  return {
    ingestion: changes.ingestion,
    status: changes.status,
    batches: changes.batches,
    observations: changes.observations.length,
    errors: changes.errors.length,
    cursor: changes.cursor,
  };
}

export async function getTransitAlertChanges({
  gateway,
  observedAt,
  storedCursor,
}: {
  gateway: TransitAlertGateway;
  observedAt: string;
  storedCursor?: unknown;
}): Promise<TransitAlertChanges> {
  const cursor =
    storedCursor === undefined
      ? { generatedAt: 0, entities: {} }
      : cursorSchema.parse(storedCursor);
  const snapshot = await gateway.getSnapshot();

  if (snapshot.generatedAt < cursor.generatedAt) {
    return {
      ingestion: "transit-alerts",
      status: "complete",
      batches: 1,
      observations: [],
      errors: snapshot.errors,
      cursor,
    };
  }

  const updatedAt = unixSecondsToIso(snapshot.generatedAt);
  const entityHashes: Record<string, string> = {};
  const observations: Observation[] = [];

  for (const entity of snapshot.entities) {
    const hash = await hashJson(entity);
    entityHashes[entity.Id] = hash;
    if (cursor.entities[entity.Id] !== hash) {
      observations.push(toObservation(entity, observedAt, updatedAt));
    }
  }

  return {
    ingestion: "transit-alerts",
    status: "complete",
    batches: 1,
    observations,
    errors: snapshot.errors,
    cursor: {
      generatedAt: snapshot.generatedAt,
      entities: entityHashes,
    },
  };
}

function toObservation(
  entity: TransitAlertEntity,
  observedAt: string,
  updatedAt: string,
): Observation {
  const starts = (entity.Alert.ActivePeriods ?? [])
    .flatMap((period) => (period.Start === undefined ? [] : [period.Start]));
  const occurredAt =
    starts.length === 0
      ? updatedAt
      : unixSecondsToIso(Math.min(...starts));

  return {
    source: "transit-alerts",
    id: entity.Id,
    occurredAt,
    updatedAt,
    observedAt,
    kind: translatedText(entity.Alert.HeaderText) ?? "Transit alert",
    area: null,
    data: entity,
  };
}

function translatedText(
  text: TransitAlertEntity["Alert"]["HeaderText"],
): string | undefined {
  if (!text) {
    return undefined;
  }
  return (
    text.Translations.find(
      (translation) => translation.Language?.toLowerCase() === "en",
    )?.Text ?? text.Translations[0]?.Text
  );
}

function unixSecondsToIso(seconds: number): string {
  return new Date(seconds * 1_000).toISOString();
}

import { investigationResultSchema } from "@public-patterns/contracts/investigation";
import { z } from "zod";

import {
  type Burst,
  type BurstSource,
  burstSources,
  getBursts,
} from "./bursts.ts";
import { getCurrentDispatch } from "./features/dispatch/read.ts";
import { calendarDaySchema, shiftDay } from "./ingestion.ts";
import type { Observation } from "./observation.ts";
import {
  getCurrent,
  getCurrentByArea,
} from "./observationStore.ts";

export const investigationRequestSchema = z.object({
  source: z.enum(burstSources),
  day: calendarDaySchema,
  kind: z.string().min(1),
  area: z.string().min(1).nullable(),
});

export type InvestigationRequest = z.infer<
  typeof investigationRequestSchema
>;

export class InvestigationUnavailableError extends Error {
  constructor(
    message: string,
    readonly status: 404 | 409,
  ) {
    super(message);
  }
}

export async function investigateBurst({
  db,
  investigator,
  input,
  createdAt,
}: {
  db: D1Database;
  investigator: Fetcher;
  input: InvestigationRequest;
  createdAt: string;
}) {
  const detected = await getBursts(db, input.source, input.day);
  if (!detected.ready) {
    throw new InvestigationUnavailableError(
      "the source is still collecting its baseline",
      409,
    );
  }

  const burst = detected.bursts.find(
    (candidate) =>
      candidate.kind === input.kind && candidate.area === input.area,
  );
  if (!burst) {
    throw new InvestigationUnavailableError("burst not found", 404);
  }

  const observations = await getBurstObservations(db, input.source, burst);
  const contextStart = `${shiftDay(input.day, -1)}T00:00:00`;
  const contextEnd = `${shiftDay(input.day, 2)}T00:00:00`;
  let context: Observation[] = [];
  if (input.area) {
    const [areaObservations, dispatch] = await Promise.all([
      getCurrentByArea({
        db,
        area: input.area,
        start: contextStart,
        end: contextEnd,
      }),
      getCurrentDispatch({ db, start: contextStart, end: contextEnd }),
    ]);
    context = [
      ...areaObservations.filter(
        ({ source }) =>
          source !== "dispatch-realtime" && source !== "dispatch-closed",
      ),
      ...dispatch.filter(({ area }) => area === input.area),
    ];
  }
  const selected = new Set(
    observations.map((observation) => `${observation.source}:${observation.id}`),
  );
  const id = crypto.randomUUID();
  const caseData = {
    signal: {
      detector: "weekday-burst",
      source: input.source,
      ...burst,
    },
    observations,
    nearbyObservations: context.filter(
      (observation) =>
        !selected.has(`${observation.source}:${observation.id}`),
    ),
  };
  const response = await investigator.fetch(
    new Request("https://investigator/investigations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, case: caseData }),
    }),
  );
  if (!response.ok) {
    throw new Error(`investigator returned ${response.status}`);
  }
  const result = investigationResultSchema.parse(await response.json());
  await saveInvestigation({
    db,
    id,
    input,
    createdAt,
    caseData,
    result,
  });
  return result;
}

export async function getInvestigation(
  db: D1Database,
  id: string,
) {
  const row = await db
    .prepare("SELECT result_json FROM investigations WHERE id = ?")
    .bind(id)
    .first<{ result_json: string }>();
  return row
    ? investigationResultSchema.parse(JSON.parse(row.result_json))
    : undefined;
}

async function getBurstObservations(
  db: D1Database,
  source: BurstSource,
  burst: Burst,
): Promise<Observation[]> {
  const start = `${burst.day}T00:00:00`;
  const end = `${shiftDay(burst.day, 1)}T00:00:00`;
  const observations =
    source === "dispatch"
      ? await getCurrentDispatch({ db, start, end })
      : await getCurrent({ db, source, start, end });
  const ids = new Set(burst.observationIds);
  return observations.filter((observation) => ids.has(observation.id));
}

async function saveInvestigation({
  db,
  id,
  input,
  createdAt,
  caseData,
  result,
}: {
  db: D1Database;
  id: string;
  input: InvestigationRequest;
  createdAt: string;
  caseData: Record<string, unknown>;
  result: z.infer<typeof investigationResultSchema>;
}) {
  await db
    .prepare(
      `INSERT INTO investigations (
         id, created_at, source, day, kind, area, case_json, result_json
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      createdAt,
      input.source,
      input.day,
      input.kind,
      input.area,
      JSON.stringify(caseData),
      JSON.stringify(result),
    )
    .run();
}

import {
  investigationJobIdSchema,
  investigationJobFailureSchema,
  investigationJobOutputSchema,
  publicProviderFailureSchema,
  type InvestigationJob,
  type InvestigationJobOutput,
} from "@public-patterns/contracts/investigation";
import { z } from "zod";

import { hashText, serializeJson } from "./canonicalJson.ts";
import type { Env } from "./environment.ts";
import {
  getBurstInvestigationCase,
  getReplayInvestigationCase,
  investigateCase,
  InvestigationConflictError,
  InvestigationUnavailableError,
  InvestigatorRequestError,
  investigationCaseSchema,
  type InvestigationCase,
  investigationRequestSchema,
  replayRequestSchema,
} from "./investigations.ts";

export const manualInvestigationJobSchema = z.discriminatedUnion("operation", [
  z.object({
    operation: z.literal("investigate"),
    input: investigationRequestSchema,
    createdAt: z.iso.datetime(),
  }),
  z.object({
    operation: z.literal("replay"),
    input: replayRequestSchema,
    createdAt: z.iso.datetime(),
  }),
]);

export type ManualInvestigationJob = z.infer<
  typeof manualInvestigationJobSchema
>;

export const investigationIdempotencyKeySchema = z.string().min(8).max(200);

const failureMarker = "PUBLIC_PATTERNS_INVESTIGATION_FAILURE:";

const workflowStatusSchema = z.object({
  status: z.enum([
    "queued",
    "running",
    "paused",
    "errored",
    "terminated",
    "complete",
    "waiting",
    "waitingForPause",
    "unknown",
  ]),
  output: z.unknown().optional(),
});

export class InvestigationJobNotFoundError extends Error {
  constructor(id: string) {
    super(`investigation job ${id} not found`);
  }
}

export class InvestigationIdempotencyConflictError extends Error {
  constructor() {
    super("idempotency key already belongs to a different investigation");
  }
}

export async function startManualInvestigation(
  db: D1Database,
  workflow: Workflow<ManualInvestigationJob>,
  job: ManualInvestigationJob,
  idempotencyKey: string,
): Promise<InvestigationJob> {
  const id = investigationJobIdSchema.parse(
    `manual-${job.operation}-${await hashText(idempotencyKey)}`,
  );
  const requestHash = await hashText(
    serializeJson({ operation: job.operation, input: job.input }),
  );
  const caseKey = `manual-investigations/${id}/case.json`;
  await db
    .prepare(
      `INSERT INTO manual_investigation_jobs (
         id, request_hash, case_key, created_at
       ) VALUES (?, ?, ?, ?)
       ON CONFLICT(id) DO NOTHING`,
    )
    .bind(id, requestHash, caseKey, job.createdAt)
    .run();
  const recorded = await db
    .prepare(
      "SELECT request_hash FROM manual_investigation_jobs WHERE id = ?",
    )
    .bind(id)
    .first<{ request_hash: string }>();
  if (!recorded) {
    throw new Error("manual investigation job was not recorded");
  }
  if (recorded.request_hash !== requestHash) {
    throw new InvestigationIdempotencyConflictError();
  }
  try {
    await workflow.create({
      id,
      params: job,
      retention: {
        successRetention: "7 days",
        errorRetention: "7 days",
      },
    });
  } catch (createError) {
    // A lost 202 can leave the Workflow created before the caller retries.
    try {
      await workflow.get(id);
      return { id, status: "queued" };
    } catch {
      throw createError;
    }
  }
  console.log("Manual investigation queued", {
    event: "manual-investigation.queued",
    investigationId: id,
    operation: job.operation,
  });
  return { id, status: "queued" };
}

export async function getManualInvestigationJob(
  workflow: Workflow<ManualInvestigationJob>,
  id: string,
): Promise<InvestigationJob> {
  let instance: WorkflowInstance;
  try {
    instance = await workflow.get(id);
  } catch (error) {
    if (error instanceof Error && error.message === "instance.not_found") {
      throw new InvestigationJobNotFoundError(id);
    }
    throw error;
  }
  const status = workflowStatusSchema.parse(await instance.status());
  switch (status.status) {
    case "queued":
    case "paused":
    case "waiting":
    case "waitingForPause":
      return { id, status: "queued" };
    case "running":
      return { id, status: "running" };
    case "complete": {
      const output = investigationJobOutputSchema.safeParse(status.output);
      return output.success
        ? { id, ...output.data }
        : workflowFailure(id, true);
    }
    case "errored":
    case "unknown":
      return workflowFailure(id, true);
    case "terminated":
      return workflowFailure(id, false);
  }
}

export async function prepareManualInvestigation(
  env: Env,
  id: string,
  job: ManualInvestigationJob,
): Promise<string> {
  const investigationCase = await (job.operation === "replay"
    ? getReplayInvestigationCase({
        db: env.DB,
        input: job.input,
        createdAt: job.createdAt,
      })
    : getBurstInvestigationCase({
        db: env.DB,
        input: job.input,
        createdAt: job.createdAt,
      }));
  const caseJson = JSON.stringify(investigationCase);
  const stored = await env.DB.prepare(
    "SELECT case_key FROM manual_investigation_jobs WHERE id = ?",
  )
    .bind(id)
    .first<{ case_key: string }>();
  if (!stored) {
    throw new Error("manual investigation job was not recorded");
  }
  await env.ARCHIVE.put(stored.case_key, caseJson, {
    onlyIf: { etagDoesNotMatch: "*" },
    httpMetadata: { contentType: "application/json" },
  });
  if (!(await env.ARCHIVE.head(stored.case_key))) {
    throw new Error("manual investigation case was not archived");
  }
  return id;
}

export async function executeManualInvestigation(
  env: Env,
  id: string,
): Promise<InvestigationJobOutput> {
  const stored = await env.DB.prepare(
    "SELECT case_key FROM manual_investigation_jobs WHERE id = ?",
  )
    .bind(id)
    .first<{ case_key: string }>();
  const archived = stored ? await env.ARCHIVE.get(stored.case_key) : null;
  if (!archived) {
    return {
      status: "failed",
      error: "investigation case unavailable",
      retryable: false,
    };
  }
  const investigationCase = investigationCaseSchema.safeParse(
    parseJson(await archived.text()),
  );
  if (!investigationCase.success) {
    return {
      status: "failed",
      error: "investigation case invalid",
      retryable: false,
    };
  }
  try {
    const result = await investigateCase({
      db: env.DB,
      investigator: env.INVESTIGATOR,
      investigationCase: investigationCase.data,
      investigationId: id,
    });
    return {
      status: "complete",
      investigationId: result.id,
      outcome: result.submission.outcome,
      archiveKey: result.archiveKey,
    };
  } catch (error) {
    return classifyInvestigationFailure(error);
  }
}

export function serializeInvestigationFailure(
  failure: Extract<InvestigationJobOutput, { status: "failed" }>,
) {
  return `${failureMarker}${JSON.stringify(failure)}`;
}

export function parseInvestigationFailure(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const markerIndex = message.lastIndexOf(failureMarker);
  if (markerIndex === -1) {
    return classifyInvestigationFailure(error);
  }
  try {
    const parsed = investigationJobFailureSchema.safeParse(
      JSON.parse(message.slice(markerIndex + failureMarker.length)),
    );
    return parsed.success ? parsed.data : classifyInvestigationFailure(error);
  } catch {
    return classifyInvestigationFailure(error);
  }
}

export function classifyInvestigationFailure(
  error: unknown,
): Extract<InvestigationJobOutput, { status: "failed" }> {
  if (error instanceof InvestigationUnavailableError) {
    return {
      status: "failed",
      error: error.message,
      retryable: false,
    };
  }
  if (error instanceof InvestigationConflictError) {
    return {
      status: "failed",
      error: "investigation result conflict",
      retryable: false,
    };
  }
  if (error instanceof InvestigatorRequestError) {
    return {
      status: "failed",
      error: "investigation failed",
      retryable: error.retryable,
      ...(error.failure?.archiveKey
        ? { archiveKey: error.failure.archiveKey }
        : {}),
      ...(error.failure?.provider
        ? { provider: publicProviderFailureSchema.parse(error.failure.provider) }
        : {}),
    };
  }
  return {
    status: "failed",
    error: "investigation failed",
    retryable: true,
  };
}

function workflowFailure(id: string, retryable: boolean): InvestigationJob {
  return {
    id,
    status: "failed",
    error: "investigation workflow failed",
    retryable,
  };
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return;
  }
}

import {
  WorkflowEntrypoint,
  type WorkflowEvent,
  type WorkflowStep,
} from "cloudflare:workers";
import { NonRetryableError } from "cloudflare:workflows";

import type { Env } from "./environment.ts";
import {
  classifyInvestigationFailure,
  executeManualInvestigation,
  manualInvestigationJobSchema,
  parseInvestigationFailure,
  prepareManualInvestigation,
  serializeInvestigationFailure,
  type ManualInvestigationJob,
} from "./manualInvestigationJobs.ts";

export class InvestigationWorkflow extends WorkflowEntrypoint<
  Env,
  ManualInvestigationJob
> {
  async run(event: WorkflowEvent<ManualInvestigationJob>, step: WorkflowStep) {
    const job = manualInvestigationJobSchema.parse(event.payload);
    try {
      await step.do(
        "prepare investigation",
        {
          retries: { limit: 2, delay: "5 seconds" },
          timeout: "2 minutes",
        },
        async () => {
          try {
            return await prepareManualInvestigation(
              this.env,
              event.instanceId,
              job,
            );
          } catch (error) {
            throwWorkflowFailure(classifyInvestigationFailure(error));
          }
        },
      );
      return await step.do(
        "investigate",
        {
          retries: { limit: 2, delay: "30 seconds" },
          timeout: "15 minutes",
        },
        async ({ attempt }) => {
          console.log("Manual investigation started", {
            event: "manual-investigation.started",
            investigationId: event.instanceId,
            operation: job.operation,
            attempt,
          });
          const output = await executeManualInvestigation(
            this.env,
            event.instanceId,
          );
          if (output.status === "complete") {
            console.log("Manual investigation completed", {
              event: "manual-investigation.completed",
              investigationId: output.investigationId,
              operation: job.operation,
              outcome: output.outcome,
              attempt,
            });
            return output;
          }
          throwWorkflowFailure(output);
        },
      );
    } catch (error) {
      const failure = parseInvestigationFailure(error);
      console.error("Manual investigation failed", {
        event: "manual-investigation.failed",
        investigationId: event.instanceId,
        operation: job.operation,
        retryable: failure.retryable,
        archiveKey: failure.archiveKey ?? null,
        provider: failure.provider ?? null,
      });
      return failure;
    }
  }
}

function throwWorkflowFailure(
  failure: ReturnType<typeof classifyInvestigationFailure>,
): never {
  const message = serializeInvestigationFailure(failure);
  if (failure.retryable) {
    throw new Error(message);
  }
  throw new NonRetryableError(message);
}

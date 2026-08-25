import { z } from "zod";
import { articleDraftSchema } from "./article.ts";

export const investigationInputSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  case: z.record(z.string(), z.unknown()),
});

export type InvestigationInput = z.infer<typeof investigationInputSchema>;

export const providerFailureDiagnosticSchema = z.object({
  provider: z.string().min(1),
  operation: z.string().min(1),
  kind: z.enum([
    "configuration",
    "authentication",
    "quota",
    "rate_limit",
    "timeout",
    "provider",
    "network",
  ]),
  retryable: z.boolean(),
  action: z.string().min(1),
  status: z.number().int().optional(),
  providerCode: z.string().min(1).optional(),
  requestId: z.string().min(1).optional(),
  detail: z.string().optional(),
});

export type ProviderFailureDiagnostic = z.infer<
  typeof providerFailureDiagnosticSchema
>;

export const publicProviderFailureSchema = providerFailureDiagnosticSchema.omit({
  action: true,
  detail: true,
});

export const investigationFailureResponseSchema = z.object({
  error: z.string().min(1),
  archiveKey: z.string().min(1).optional(),
  retryable: z.boolean().optional(),
  provider: publicProviderFailureSchema.optional(),
});

const outputPathSchema = z
  .string()
  .refine(isOutputPath, "must be a file under output/");

export const investigationSubmissionSchema = z
  .object({
    outcome: z.enum(["investigate", "watch", "discard"]),
    confidence: z.number().min(0).max(1),
    briefPath: outputPathSchema,
    articlePath: outputPathSchema.optional(),
    reviewPath: outputPathSchema.optional(),
    evidence: z.array(z.string()),
  })
  .superRefine((submission, context) => {
    if (submission.outcome === "investigate") {
      for (const path of ["articlePath", "reviewPath"] as const) {
        if (!submission[path]) {
          context.addIssue({
            code: "custom",
            path: [path],
            message: `investigate outcomes require ${path}`,
          });
        }
      }
    }
  });

export type InvestigationSubmission = z.infer<
  typeof investigationSubmissionSchema
>;

const nonBlankString = z.string().refine((value) => value.trim().length > 0);

export const investigationResultSchema = z.object({
  id: z.string().min(1),
  archiveKey: z.string().min(1),
  submission: z.object({
    outcome: z.enum(["investigate", "watch", "discard"]),
    confidence: z.number().min(0).max(1),
    evidence: z.array(z.string()),
  }),
  brief: nonBlankString,
  article: articleDraftSchema.nullable(),
  review: nonBlankString.nullable(),
});

export type InvestigationResult = z.infer<typeof investigationResultSchema>;

export const investigationJobFailureSchema = z.object({
  status: z.literal("failed"),
  error: z.string().min(1),
  retryable: z.boolean(),
  archiveKey: z.string().min(1).optional(),
  provider: publicProviderFailureSchema.optional(),
});

export const investigationJobCompleteSchema = z.object({
  status: z.literal("complete"),
  investigationId: z.string().min(1),
  outcome: z.enum(["investigate", "watch", "discard"]),
  archiveKey: z.string().min(1),
});

export const investigationJobOutputSchema = z.discriminatedUnion("status", [
  investigationJobCompleteSchema,
  investigationJobFailureSchema,
]);

export type InvestigationJobOutput = z.infer<
  typeof investigationJobOutputSchema
>;

export const investigationJobIdSchema = z
  .string()
  .max(100)
  .regex(/^[a-zA-Z0-9_][a-zA-Z0-9_-]*$/);

export const investigationJobSchema = z.discriminatedUnion("status", [
  z.object({ id: investigationJobIdSchema, status: z.literal("queued") }),
  z.object({ id: investigationJobIdSchema, status: z.literal("running") }),
  investigationJobCompleteSchema.extend({ id: investigationJobIdSchema }),
  investigationJobFailureSchema.extend({ id: investigationJobIdSchema }),
]);

export type InvestigationJob = z.infer<typeof investigationJobSchema>;

function isOutputPath(value: string): boolean {
  const segments = value.split("/");
  return (
    segments[0] === "output" &&
    segments.length > 1 &&
    segments.every(
      (segment) => segment !== "" && segment !== "." && segment !== "..",
    )
  );
}

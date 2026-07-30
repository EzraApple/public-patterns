import { z } from "zod";
import { articleDraftSchema } from "./article.ts";

export const investigationInputSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  case: z.record(z.string(), z.unknown()),
});

export type InvestigationInput = z.infer<typeof investigationInputSchema>;

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

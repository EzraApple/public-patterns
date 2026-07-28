import { z } from "zod";

export const investigationInputSchema = z.object({
  id: z.string().min(1),
  case: z.record(z.string(), z.unknown()),
});

export type InvestigationInput = z.infer<typeof investigationInputSchema>;

export const investigationSubmissionSchema = z.object({
  outcome: z.enum(["investigate", "watch", "discard"]),
  confidence: z.number().min(0).max(1),
  briefPath: z
    .string()
    .refine(isOutputPath, "briefPath must be a file under output/"),
  evidence: z.array(z.string()),
});

export type InvestigationSubmission = z.infer<
  typeof investigationSubmissionSchema
>;

export const investigationResultSchema = z.object({
  id: z.string().min(1),
  submission: investigationSubmissionSchema.omit({ briefPath: true }),
  brief: z.string().min(1),
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

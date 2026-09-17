import { z } from "zod";

// Keep in sync with packages/contracts/src/investigation.ts.
export const investigationFollowUpSchema = z.object({
  question: z.string().trim().min(1).max(500),
  evidenceUrls: z.array(z.httpUrl()).min(1).max(5),
  afterDays: z.number().int().min(1).max(30),
});

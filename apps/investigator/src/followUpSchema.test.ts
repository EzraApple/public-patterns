import { describe, expect, it } from "vitest";
import { investigationFollowUpSchema as workerSchema, investigationResultSchema } from "@public-patterns/contracts/investigation";
import { investigationFollowUpSchema as agentSchema } from "../agent/.opencode/follow-up-schema.ts";

describe("watch follow-up contract", () => {
  it.each([
    [{ question: "What changed?", evidenceUrls: ["https://example.com/record"], afterDays: 7 }, true],
    [{ question: " ", evidenceUrls: ["https://example.com/record"], afterDays: 7 }, false],
    [{ question: "What changed?", evidenceUrls: [], afterDays: 7 }, false],
    [{ question: "What changed?", evidenceUrls: ["file:///etc/passwd"], afterDays: 7 }, false],
    [{ question: "What changed?", evidenceUrls: ["https://example.com/record"], afterDays: 0 }, false],
    [{ question: "What changed?", evidenceUrls: ["https://example.com/record"], afterDays: 31 }, false],
  ])("validates agent and worker inputs consistently: %j", (value, accepted) => {
    expect(agentSchema.safeParse(value).success).toBe(accepted);
    expect(workerSchema.safeParse(value).success).toBe(accepted);
  });
  it("keeps archived watch outcomes without follow-up readable", () => {
    expect(investigationResultSchema.parse({
      id: "old", archiveKey: "investigations/old.json",
      submission: { outcome: "watch", confidence: 0.5, evidence: [] },
      brief: "No concrete next check.", article: null, review: null,
    }).submission.followUp).toBeUndefined();
  });
});

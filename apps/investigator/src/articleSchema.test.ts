import { articleDraftSchema as contractSchema } from "@public-patterns/contracts/article";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { articleDraftSchema as agentSchema } from "../agent/.opencode/article-schema.ts";

describe("agent article schema", () => {
  it("matches the Worker contract", () => {
    expect(z.toJSONSchema(agentSchema)).toEqual(
      z.toJSONSchema(contractSchema),
    );
  });

  it.each([
    ["agent", agentSchema],
    ["contract", contractSchema],
  ])("accepts only HTTP source links in the %s schema", (_, schema) => {
    const article = {
      title: "Event headline",
      dek: "A concise summary.",
      category: "Public safety",
      significance: 50,
      body: "The supported account.",
      sources: [{ label: "Public record", href: "https://example.com/record" }],
      figure: null,
    };

    expect(schema.safeParse(article).success).toBe(true);
    for (const href of ["javascript:alert(1)", "data:text/plain,x", "//host"]) {
      expect(
        schema.safeParse({
          ...article,
          sources: [{ label: "Public record", href }],
        }).success,
      ).toBe(false);
    }
  });
});

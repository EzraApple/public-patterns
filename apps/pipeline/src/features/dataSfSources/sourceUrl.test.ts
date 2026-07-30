import { describe, expect, it } from "vitest";

import type { Observation } from "@/observation.ts";
import { getSourceUrl } from "./sourceUrl.ts";

function observation(
  source: Observation["source"],
  id: string,
): Observation {
  return {
    source,
    id,
    occurredAt: "2026-07-25T08:33:30.000",
    updatedAt: "2026-07-26T06:01:20.000",
    observedAt: "2026-07-26T12:00:00.000Z",
    kind: "Water Rescue",
    area: "Presidio",
    data: {},
  };
}

describe("getSourceUrl", () => {
  it("links a DataSF observation to its exact record query", () => {
    const href = getSourceUrl(
      observation("fire-ems", "262060755-E35"),
    );
    const url = new URL(href!);

    expect(url.pathname).toBe("/resource/nuek-vuh3.json");
    expect(url.searchParams.get("$where")).toBe(
      "rowid = '262060755-E35'",
    );
  });

  it("escapes quotes in a SoQL string literal", () => {
    const href = getSourceUrl(observation("311", "case'42"));

    expect(new URL(href!).searchParams.get("$where")).toBe(
      "service_request_id = 'case''42'",
    );
  });

  it("leaves non-DataSF sources without a query URL", () => {
    expect(
      getSourceUrl(observation("transit-alerts", "alert-1")),
    ).toBeUndefined();
  });
});

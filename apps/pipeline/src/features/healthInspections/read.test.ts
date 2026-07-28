import { describe, expect, it } from "vitest";

import type { Observation } from "@/observation.ts";
import { dedupeInspections } from "./read.ts";

describe("dedupeInspections", () => {
  it("keeps one current row for each inspection", () => {
    const first = inspection({
      id: "row-a",
      permit: "permit-1",
      inspector: "Alex",
    });
    const replacement = inspection({
      id: "row-b",
      permit: "permit-1",
      inspector: "Alex",
      updatedAt: "2026-07-03T00:00:00",
    });
    const other = inspection({
      id: "row-c",
      permit: "permit-1",
      inspector: "Alex",
      type: "Follow-up",
    });

    expect(dedupeInspections([first, replacement, other])).toEqual([
      replacement,
      other,
    ]);
  });

  it("does not merge rows without a stable inspection identity", () => {
    const first = inspection({ id: "row-a" });
    const second = inspection({ id: "row-b" });

    expect(dedupeInspections([first, second])).toEqual([first, second]);
  });
});

function inspection({
  id,
  permit,
  inspector,
  type,
  updatedAt = "2026-07-02T00:00:00",
}: {
  id: string;
  permit?: string;
  inspector?: string;
  type?: string;
  updatedAt?: string;
}): Observation {
  return {
    source: "health-inspections",
    id,
    occurredAt: "2026-07-02T00:00:00",
    updatedAt,
    observedAt: "2026-07-28T00:00:00Z",
    kind: "Pass",
    area: "Financial District/South Beach",
    data: {
      ...(permit ? { permit_number: permit } : {}),
      ...(inspector ? { inspector } : {}),
      ...(type ? { inspection_type: type } : {}),
    },
  };
}

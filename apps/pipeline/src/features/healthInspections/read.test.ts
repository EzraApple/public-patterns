import { describe, expect, it } from "vitest";

import type { Observation } from "@/observation.ts";
import {
  getInspectionEvidence,
  selectInspectionRepresentatives,
} from "./read.ts";

describe("selectInspectionRepresentatives", () => {
  it("selects one representative per inspection", () => {
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

    expect(
      selectInspectionRepresentatives([first, replacement, other]),
    ).toEqual([replacement, other]);
  });

  it("does not merge rows without a stable inspection identity", () => {
    const first = inspection({ id: "row-a" });
    const second = inspection({ id: "row-b" });

    expect(selectInspectionRepresentatives([first, second])).toEqual([
      first,
      second,
    ]);
  });

  it("counts one inspection without dropping its evidence", () => {
    const violations = inspection({
      id: "row-a",
      permit: "53068",
      inspector: "Montre Tieu",
      status: "Closure",
      violations: "seven violations",
    });
    const summary = inspection({
      id: "row-z",
      permit: "53068",
      inspector: "Montre Tieu",
    });

    expect(
      selectInspectionRepresentatives([violations, summary]),
    ).toEqual([violations]);
    expect(
      getInspectionEvidence(
        [violations, summary],
        new Set([violations.id]),
      ),
    ).toEqual([violations, summary]);
  });
});

function inspection({
  id,
  permit,
  inspector,
  type,
  status = "Pass",
  violations,
  updatedAt = "2026-07-02T00:00:00",
}: {
  id: string;
  permit?: string;
  inspector?: string;
  type?: string;
  status?: "Pass" | "Conditional Pass" | "Closure";
  violations?: string;
  updatedAt?: string;
}): Observation {
  return {
    source: "health-inspections",
    id,
    occurredAt: "2026-07-02T00:00:00",
    updatedAt,
    observedAt: "2026-07-28T00:00:00Z",
    kind: status,
    area: "Financial District/South Beach",
    data: {
      ...(permit ? { permit_number: permit } : {}),
      ...(inspector ? { inspector } : {}),
      ...(type ? { inspection_type: type } : {}),
      facility_rating_status: status,
      ...(violations ? { violation_codes: violations } : {}),
    },
  };
}

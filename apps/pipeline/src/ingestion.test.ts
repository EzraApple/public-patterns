import { describe, expect, it } from "vitest";

import { calendarDaySchema } from "./ingestion.ts";

describe("calendarDaySchema", () => {
  it("returns validation failures for impossible dates", () => {
    for (const day of ["2026-99-99", "2026-02-29", "0000-00-00"]) {
      expect(calendarDaySchema.safeParse(day).success).toBe(false);
    }
  });

  it("accepts a valid leap day", () => {
    expect(calendarDaySchema.safeParse("2024-02-29").success).toBe(true);
  });
});

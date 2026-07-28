import { describe, expect, it, vi } from "vitest";

import {
  buildDataSfUrl,
  createDataSfGateway,
} from "./gateway.ts";

describe("configured DataSF sources gateway", () => {
  it.each([
    {
      source: "dispatch-realtime" as const,
      dataset: "gnap-fj3t",
      cursor: "call_last_updated_at",
      extraFields: ["id", "call_last_updated_at"],
    },
    {
      source: "dispatch-closed" as const,
      dataset: "2zdj-bwza",
      cursor: "data_updated_at",
      extraFields: [
        "data_updated_at",
        "source_filename",
        "dup_cad_number",
        "pd_incident_report",
      ],
    },
  ])(
    "keeps the $source dispatch feed's load-time keyset and selected payload",
    ({ source, dataset, cursor, extraFields }) => {
      const url = buildDataSfUrl({
        source,
        since: "2026-07-24T09:00:00",
        until: "2026-07-24T13:00:00",
        after: { cursorAt: "2026-07-24T10:00:00", id: "260010001" },
        limit: 501,
      });
      const select = url.searchParams.get("$select")?.split(",");

      expect(url.pathname).toBe(`/resource/${dataset}.json`);
      expect(url.searchParams.get("$order")).toBe(
        `${cursor} ASC,cad_number ASC`,
      );
      expect(url.searchParams.get("$where")).toContain(
        `${cursor} > '2026-07-24T10:00:00'`,
      );
      expect(select).toEqual(
        expect.arrayContaining([
          "cad_number",
          "received_datetime",
          "intersection_point",
          "analysis_neighborhood",
          ...extraFields,
        ]),
      );
      expect(select).not.toContain("*");
    },
  );

  it.each([
    ["dispatch-realtime", "call_last_updated_at"],
    ["dispatch-closed", "data_updated_at"],
  ] as const)(
    "clamps the %s upper watermark to current source time",
    async (source, cursorField) => {
      const fetch = vi
        .fn<typeof globalThis.fetch>()
        .mockResolvedValue(Response.json([{}]));
      const gateway = createDataSfGateway({ fetch });

      await gateway.getUpperWatermark(
        source,
        "2026-07-24T09:00:00",
        "2026-07-24T14:00:00",
      );

      const url = new URL(String(fetch.mock.calls[0]?.[0]));
      expect(url.searchParams.get("$select")).toBe(
        `max(${cursorField}) AS upper_watermark`,
      );
      expect(url.searchParams.get("$where")).toContain(
        `${cursorField} <= '2026-07-24T14:00:00'`,
      );
    },
  );

  it("batches Fire/EMS loads while keeping unit responses distinct", () => {
    const url = buildDataSfUrl({
      source: "fire-ems",
      since: "2026-07-26T00:00:00.000",
      until: "2026-07-27T00:00:00.000",
      after: {
        cursorAt: "2026-07-26T12:00:00.000",
        id: "260000001-E01",
      },
      limit: 501,
    });

    expect(url.pathname).toBe("/resource/nuek-vuh3.json");
    expect(url.searchParams.get("$order")).toBe(
      "data_loaded_at ASC,rowid ASC",
    );
    expect(url.searchParams.get("$where")).toContain(
      "data_loaded_at >= '2026-07-26T00:00:00.000'",
    );
    expect(url.searchParams.get("$where")).toContain(
      "rowid > '260000001-E01'",
    );
    expect(url.searchParams.get("$where")).not.toContain("call_number >");
  });

  it("batches 311 by portal update time and requests its explicit fields", () => {
    const url = buildDataSfUrl({
      source: "311",
      since: "2026-07-20T00:00:00",
      until: "2026-07-24T00:00:00",
      after: { cursorAt: "2026-07-22T06:00:00", id: "10" },
      limit: 501,
    });

    expect(url.searchParams.get("$order")).toBe(
      "data_loaded_at ASC,service_request_id ASC",
    );
    expect(url.searchParams.get("$select")).toContain("media_url");
    expect(url.searchParams.get("$select")).not.toBe("*");
  });

  it("maps every configured dataset and preserves unmodeled JSON", async () => {
    const cases = [
      {
        source: "311" as const,
        row: {
          service_request_id: "1",
          requested_datetime: "2026-07-23T10:00:00",
          updated_datetime: "2026-07-23T11:00:00",
          service_name: "Graffiti",
          analysis_neighborhood: "Mission",
          data_loaded_at: "2026-07-24T06:00:00",
        },
        expected: {
          id: "1",
          kind: "Graffiti",
          area: "Mission",
        },
      },
      {
        source: "dispatch-realtime" as const,
        row: {
          cad_number: "260010001",
          id: "260010001",
          received_datetime: "2026-07-24T09:30:00",
          call_last_updated_at: "2026-07-24T10:00:00",
          call_type_original_desc: "HOMELESS COMPLAINT",
          analysis_neighborhood: "Mission",
          data_as_of: "2026-07-24T10:05:00",
          data_loaded_at: "2026-07-24T10:10:00",
        },
        expected: {
          id: "260010001",
          kind: "HOMELESS COMPLAINT",
          area: "Mission",
        },
      },
      {
        source: "dispatch-closed" as const,
        row: {
          cad_number: "260010002",
          received_datetime: "2026-07-23T09:30:00",
          data_updated_at: "2026-07-24T05:00:00",
          source_filename: "dispatch.csv",
          call_type_original: "FIGHT",
          analysis_neighborhood: "Tenderloin",
          data_as_of: "2026-07-24T05:05:00",
          data_loaded_at: "2026-07-24T05:10:00",
        },
        expected: {
          id: "260010002",
          kind: "FIGHT",
          area: "Tenderloin",
        },
      },
      {
        source: "fire-ems" as const,
        row: {
          rowid: "1-E01",
          received_dttm: "2026-07-26T12:00:00.000",
          data_loaded_at: "2026-07-26T13:00:00.000",
          call_type: "Medical Incident",
          neighborhoods_analysis_boundaries: "Mission",
        },
        expected: {
          id: "1-E01",
          kind: "Medical Incident",
          area: "Mission",
        },
      },
      {
        source: "police-incidents" as const,
        row: {
          row_id: "200071040",
          incident_datetime: "2026-07-25T11:00:00.000",
          data_loaded_at: "2026-07-26T10:00:00.000",
          incident_category: "Robbery",
          analysis_neighborhood: "Tenderloin",
        },
        expected: {
          id: "200071040",
          kind: "Robbery",
          area: "Tenderloin",
        },
      },
      {
        source: "building-complaints" as const,
        row: {
          complaint_number: "202600001",
          date_filed: "2026-07-24T00:00:00.000",
          data_loaded_at: "2026-07-26T05:34:21.000",
          receiving_division: "Housing Inspection Services",
          analysis_neighborhood: "Outer Richmond",
        },
        expected: {
          id: "202600001",
          kind: "Housing Inspection Services",
          area: "Outer Richmond",
        },
      },
      {
        source: "traffic-crashes" as const,
        row: {
          unique_id: "4543",
          collision_datetime: "2026-05-09T07:44:00.000",
          data_updated_at: "2026-07-08T00:00:00.000",
          collision_severity: "Injury (Severe)",
          analysis_neighborhood: "Outer Mission",
        },
        expected: {
          id: "4543",
          kind: "Injury (Severe)",
          area: "Outer Mission",
        },
      },
      {
        source: "health-inspections" as const,
        row: {
          ":id": "row-pf6c_6354_8zgq",
          inspection_date: "2026-06-25T00:00:00.000",
          data_loaded_at: "2026-07-26T02:35:28.375",
          facility_rating_status: "Pass",
          analysis_neighborhood: "Financial District/South Beach",
        },
        expected: {
          id: "row-pf6c_6354_8zgq",
          kind: "Pass",
          area: "Financial District/South Beach",
        },
      },
      {
        source: "building-permits" as const,
        row: {
          record_id: "1545854157209",
          filed_date: "2026-07-22T14:35:59.000",
          data_loaded_at: "2026-07-26T04:38:02.190",
          permit_type_definition: "additions alterations or repairs",
          neighborhoods_analysis_boundaries: "Castro/Upper Market",
        },
        expected: {
          id: "1545854157209",
          kind: "additions alterations or repairs",
          area: "Castro/Upper Market",
        },
      },
      {
        source: "eviction-notices" as const,
        row: {
          eviction_id: "M140726",
          file_date: "2026-07-24T00:00:00.000",
          data_loaded_at: "2026-07-26T05:24:16.000",
          neighborhood: "Outer Richmond",
        },
        expected: {
          id: "M140726",
          kind: "eviction notice",
          area: "Outer Richmond",
        },
      },
    ];

    for (const testCase of cases) {
      const fetch = vi
        .fn<typeof globalThis.fetch>()
        .mockResolvedValue(
          Response.json([{ ...testCase.row, future_field: "preserved" }]),
        );
      const gateway = createDataSfGateway({ fetch });
      const batch = await gateway.getBatch({
        source: testCase.source,
        since: "2026-01-01T00:00:00.000",
        until: "2026-07-27T00:00:00.000",
        limit: 1,
        observedAt: "2026-07-27T12:00:00Z",
      });

      expect(batch).toMatchObject({
        done: true,
        errors: [],
        observations: [
          {
            source: testCase.source,
            ...testCase.expected,
            observedAt: "2026-07-27T12:00:00Z",
            data: { future_field: "preserved" },
          },
        ],
      });
    }
  });

  it("records an invalid row while retaining a keyset cursor", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      Response.json([
        {
          complaint_number: "202600001",
          date_filed: "2026-07-24T00:00:00.000",
        },
        {
          complaint_number: "202600002",
          date_filed: "2026-07-25T00:00:00.000",
          data_loaded_at: "2026-07-26T05:34:21.000",
        },
      ]),
    );
    const gateway = createDataSfGateway({ fetch });
    const batch = await gateway.getBatch({
      source: "building-complaints",
      since: "2026-07-01T00:00:00.000",
      until: "2026-07-27T00:00:00.000",
      limit: 1,
      observedAt: "2026-07-27T12:00:00Z",
    });

    expect(batch.observations).toHaveLength(0);
    expect(batch.errors).toMatchObject([
      {
        source: "building-complaints",
        dataset: "gm2e-bten",
        data: { complaint_number: "202600001" },
      },
    ]);
    expect(batch.next).toEqual({
      cursorAt: "2026-07-24T00:00:00.000",
      id: "202600001",
    });
    expect(batch.done).toBe(false);
  });

  it("excludes future-dated events from the upper watermark", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(Response.json([{}]));
    const gateway = createDataSfGateway({ fetch });

    await gateway.getUpperWatermark(
      "health-inspections",
      "2026-04-27T00:00:00.000",
      "2026-07-27T12:00:00.000",
    );

    const url = new URL(String(fetch.mock.calls[0]?.[0]));
    expect(url.searchParams.get("$where")).toContain(
      "inspection_date <= '2026-07-27T12:00:00.000'",
    );
  });
});

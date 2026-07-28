import { z } from "zod";

import { socrataTimestampSchema } from "@/sources/dataSf.ts";
import {
  case311Schema,
  dispatchClosedSchema,
  dispatchRealtimeSchema,
  dispatchSelect,
  optionalSourceStringSchema,
} from "./schema.ts";

const definitions = {
  "311": defineSource({
    datasetId: "vw6y-z8j6",
    idField: "service_request_id",
    occurredField: "requested_datetime",
    updatedField: "data_loaded_at",
    cursorField: "data_loaded_at",
    kindFields: ["service_name"],
    defaultKind: "311 case",
    areaField: "analysis_neighborhood",
    select: [
      "service_request_id",
      "requested_datetime",
      "updated_datetime",
      "closed_date",
      "service_name",
      "service_subtype",
      "service_details",
      "status_description",
      "status_notes",
      "agency_responsible",
      "address",
      "street",
      "lat",
      "long",
      "point",
      "point_geom",
      "analysis_neighborhood",
      "neighborhoods_sffind_boundaries",
      "supervisor_district",
      "police_district",
      "source",
      "media_url",
      "data_as_of",
      "data_loaded_at",
    ].join(","),
    initialWindowMinutes: 2 * 24 * 60,
    overlapMinutes: 2 * 24 * 60,
    schema: case311Schema,
  }),
  "dispatch-realtime": defineSource({
    datasetId: "gnap-fj3t",
    idField: "cad_number",
    occurredField: "received_datetime",
    updatedField: "call_last_updated_at",
    cursorField: "call_last_updated_at",
    kindFields: ["call_type_original_desc", "call_type_original"],
    defaultKind: "unknown",
    areaField: "analysis_neighborhood",
    select: [...dispatchSelect, "id", "call_last_updated_at"].join(","),
    initialWindowMinutes: 2 * 24 * 60,
    overlapMinutes: 2 * 60,
    schema: dispatchRealtimeSchema,
  }),
  "dispatch-closed": defineSource({
    datasetId: "2zdj-bwza",
    idField: "cad_number",
    occurredField: "received_datetime",
    updatedField: "data_updated_at",
    cursorField: "data_updated_at",
    kindFields: ["call_type_original_desc", "call_type_original"],
    defaultKind: "unknown",
    areaField: "analysis_neighborhood",
    select: [
      ...dispatchSelect,
      "data_updated_at",
      "source_filename",
      "dup_cad_number",
      "pd_incident_report",
    ].join(","),
    initialWindowMinutes: 2 * 24 * 60,
    overlapMinutes: 2 * 60,
    schema: dispatchClosedSchema,
  }),
  "fire-ems": defineSource({
    datasetId: "nuek-vuh3",
    idField: "rowid",
    occurredField: "received_dttm",
    updatedField: "data_loaded_at",
    cursorField: "data_loaded_at",
    kindFields: ["call_type", "call_type_group"],
    defaultKind: "fire or EMS call",
    areaField: "neighborhoods_analysis_boundaries",
    initialWindowMinutes: 2 * 24 * 60,
    overlapMinutes: 6 * 60,
  }),
  "police-incidents": defineSource({
    datasetId: "wg3w-h783",
    idField: "row_id",
    occurredField: "incident_datetime",
    updatedField: "data_loaded_at",
    kindFields: [
      "incident_category",
      "incident_subcategory",
      "incident_description",
    ],
    defaultKind: "police incident",
    areaField: "analysis_neighborhood",
    initialWindowMinutes: 7 * 24 * 60,
    overlapMinutes: 2 * 24 * 60,
  }),
  "building-complaints": defineSource({
    datasetId: "gm2e-bten",
    idField: "complaint_number",
    occurredField: "date_filed",
    updatedField: "data_loaded_at",
    kindFields: ["nov_type", "receiving_division"],
    defaultKind: "building complaint",
    areaField: "analysis_neighborhood",
    initialWindowMinutes: 30 * 24 * 60,
    overlapMinutes: 7 * 24 * 60,
  }),
  "traffic-crashes": defineSource({
    datasetId: "ubvf-ztfx",
    idField: "unique_id",
    occurredField: "collision_datetime",
    updatedField: "data_updated_at",
    kindFields: ["collision_severity", "type_of_collision"],
    defaultKind: "injury crash",
    areaField: "analysis_neighborhood",
    initialWindowMinutes: 365 * 24 * 60,
    overlapMinutes: 180 * 24 * 60,
  }),
  "health-inspections": defineSource({
    datasetId: "tvy3-wexg",
    idField: ":id",
    occurredField: "inspection_date",
    updatedField: "data_loaded_at",
    kindFields: ["inspection_type", "facility_rating_status"],
    defaultKind: "health inspection",
    areaField: "analysis_neighborhood",
    select: "*,:id",
    initialWindowMinutes: 90 * 24 * 60,
    overlapMinutes: 30 * 24 * 60,
  }),
  "building-permits": defineSource({
    datasetId: "i98e-djp9",
    idField: "record_id",
    occurredField: "filed_date",
    updatedField: "data_loaded_at",
    kindFields: ["permit_type_definition", "permit_type"],
    defaultKind: "building permit",
    areaField: "neighborhoods_analysis_boundaries",
    initialWindowMinutes: 30 * 24 * 60,
    overlapMinutes: 7 * 24 * 60,
  }),
  "eviction-notices": defineSource({
    datasetId: "5cei-gny5",
    idField: "eviction_id",
    occurredField: "file_date",
    updatedField: "data_loaded_at",
    kindFields: [],
    defaultKind: "eviction notice",
    areaField: "neighborhood",
    initialWindowMinutes: 90 * 24 * 60,
    overlapMinutes: 30 * 24 * 60,
  }),
} as const;

export const dataSfSourceNames = Object.keys(
  definitions,
) as DataSfSourceName[];

export type DataSfSourceName = keyof typeof definitions;
export type DataSfSourceConfig = (typeof definitions)[DataSfSourceName];
export type DataSfSourceRow = z.infer<DataSfSourceConfig["schema"]>;

export function getDataSfSourceConfig(
  source: DataSfSourceName,
): DataSfSourceConfig {
  return definitions[source];
}

function defineSource({
  areaField,
  cursorField,
  kindFields,
  schema,
  select = "*",
  ...definition
}: {
  datasetId: string;
  idField: string;
  occurredField: string;
  updatedField: string;
  cursorField?: string;
  kindFields: readonly string[];
  defaultKind: string;
  areaField?: string;
  schema?: z.ZodType<Record<string, unknown>>;
  select?: string;
  initialWindowMinutes: number;
  overlapMinutes: number;
}) {
  const shape: Record<string, z.ZodType> = {
    [definition.idField]: z.string().min(1),
    [definition.occurredField]: socrataTimestampSchema,
    [definition.updatedField]: socrataTimestampSchema,
  };
  for (const field of kindFields) {
    shape[field] = optionalSourceStringSchema;
  }
  if (areaField) {
    shape[areaField] = optionalSourceStringSchema;
  }

  return {
    ...definition,
    cursorField: cursorField ?? definition.occurredField,
    kindFields,
    areaField,
    select,
    schema: schema ?? z.object(shape).passthrough(),
  };
}

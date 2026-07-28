import { z } from "zod";

import { socrataTimestampSchema } from "@/sources/dataSf.ts";

export const optionalSourceStringSchema = z.string().nullable().optional();
const optionalSourceTimestampSchema = socrataTimestampSchema
  .nullable()
  .optional();

const dispatchFields = {
  cad_number: z.string().min(1),
  received_datetime: socrataTimestampSchema,
  entry_datetime: optionalSourceTimestampSchema,
  dispatch_datetime: optionalSourceTimestampSchema,
  enroute_datetime: optionalSourceTimestampSchema,
  onscene_datetime: optionalSourceTimestampSchema,
  close_datetime: optionalSourceTimestampSchema,
  call_type_original: optionalSourceStringSchema,
  call_type_original_desc: optionalSourceStringSchema,
  call_type_final: optionalSourceStringSchema,
  call_type_final_desc: optionalSourceStringSchema,
  priority_original: optionalSourceStringSchema,
  priority_final: optionalSourceStringSchema,
  agency: optionalSourceStringSchema,
  disposition: optionalSourceStringSchema,
  onview_flag: optionalSourceStringSchema,
  sensitive_call: z.boolean().nullable().optional(),
  intersection_name: optionalSourceStringSchema,
  intersection_id: optionalSourceStringSchema,
  intersection_point: z.unknown().optional(),
  supervisor_district: optionalSourceStringSchema,
  analysis_neighborhood: optionalSourceStringSchema,
  police_district: optionalSourceStringSchema,
  data_as_of: socrataTimestampSchema,
  data_loaded_at: socrataTimestampSchema,
} satisfies z.ZodRawShape;

export const dispatchSelect = Object.keys(dispatchFields);

export const case311Schema = z
  .object({
    service_request_id: z.string().min(1),
    requested_datetime: socrataTimestampSchema,
    updated_datetime: socrataTimestampSchema.optional(),
    service_name: z.string().min(1),
    service_subtype: z.string().optional(),
    service_details: z.string().optional(),
    status_description: z.string().optional(),
    agency_responsible: z.string().optional(),
    analysis_neighborhood: z.string().optional(),
    supervisor_district: z.string().optional(),
    police_district: z.string().optional(),
    source: z.string().optional(),
    lat: z.string().optional(),
    long: z.string().optional(),
    data_as_of: socrataTimestampSchema.optional(),
    data_loaded_at: socrataTimestampSchema,
  })
  .passthrough();

export const dispatchRealtimeSchema = z
  .object({
    ...dispatchFields,
    id: z.string().min(1),
    call_last_updated_at: socrataTimestampSchema,
  })
  .passthrough();

export const dispatchClosedSchema = z
  .object({
    ...dispatchFields,
    data_updated_at: socrataTimestampSchema,
    source_filename: z.string().min(1),
    dup_cad_number: optionalSourceStringSchema,
    pd_incident_report: optionalSourceStringSchema,
  })
  .passthrough();

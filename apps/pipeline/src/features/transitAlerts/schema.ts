import { z } from "zod";

const unixSecondsSchema = z.number().int().nonnegative().max(8_640_000_000);

const translationSchema = z
  .object({
    Text: z.string(),
    Language: z.string().optional(),
  })
  .passthrough();

const translatedTextSchema = z
  .object({
    Translations: z.array(translationSchema),
  })
  .passthrough();

const activePeriodSchema = z
  .object({
    Start: unixSecondsSchema.optional(),
    End: unixSecondsSchema.optional(),
  })
  .passthrough();

const informedEntitySchema = z
  .object({
    AgencyId: z.string().optional(),
    RouteId: z.string().optional(),
    RouteType: z.number().int().optional(),
    StopId: z.string().optional(),
    Trip: z.unknown().optional(),
  })
  .passthrough();

export const transitAlertEntitySchema = z
  .object({
    Id: z.string().min(1),
    Alert: z
      .object({
        ActivePeriods: z.array(activePeriodSchema).optional(),
        InformedEntities: z.array(informedEntitySchema).optional(),
        cause: z.number().int().optional(),
        effect: z.number().int().optional(),
        Url: translatedTextSchema.nullish(),
        HeaderText: translatedTextSchema.nullish(),
        DescriptionText: translatedTextSchema.nullish(),
        TtsHeaderText: translatedTextSchema.nullish(),
        TtsDescriptionText: translatedTextSchema.nullish(),
      })
      .passthrough(),
  })
  .passthrough();

export const transitAlertFeedSchema = z
  .object({
    Header: z
      .object({
        GtfsRealtimeVersion: z.string().optional(),
        incrementality: z.number().int().optional(),
        Timestamp: unixSecondsSchema,
      })
      .passthrough(),
    Entities: z.array(z.unknown()),
  })
  .passthrough();

export type TransitAlertEntity = z.infer<typeof transitAlertEntitySchema>;

import { z } from "zod";

import type { Batch, Observation } from "../../observations.ts";
import {
  fetchDataSf,
  invalidSourceRow,
  parseDataSfUpperWatermark,
  socrataTimestampSchema,
  type DataSfSleep,
} from "../../sources/dataSf.ts";
import {
  getDataSfSourceConfig,
  type DataSfSourceConfig,
  type DataSfSourceName,
  type DataSfSourceRow,
} from "./config.ts";

const DATA_SF_ORIGIN = "https://data.sfgov.org";

export type DataSfSourceCursor = {
  cursorAt: string;
  id: string;
};

export type DataSfSourcesGateway = {
  getUpperWatermark(
    source: DataSfSourceName,
    since: string,
    notAfter: string,
  ): Promise<string | null>;
  getPage(input: {
    source: DataSfSourceName;
    since: string;
    until: string;
    after?: DataSfSourceCursor;
    limit: number;
    observedAt: string;
  }): Promise<Batch<DataSfSourceCursor>>;
};

export function createDataSfSourcesGateway({
  fetch,
  appToken,
  origin = DATA_SF_ORIGIN,
  sleep,
  maxRequestAttempts,
}: {
  fetch: typeof globalThis.fetch;
  appToken?: string;
  origin?: string;
  sleep?: DataSfSleep;
  maxRequestAttempts?: number;
}): DataSfSourcesGateway {
  const headers = appToken ? { "X-App-Token": appToken } : undefined;

  return {
    async getUpperWatermark(source, since, notAfter) {
      const config = getDataSfSourceConfig(source);
      const cursorField = config.cursorField;
      const url = new URL(`/resource/${config.datasetId}.json`, origin);
      url.searchParams.set(
        "$select",
        `max(${cursorField}) AS upper_watermark`,
      );
      url.searchParams.set(
        "$where",
        `${cursorField} IS NOT NULL AND ` +
          `${config.idField} IS NOT NULL AND ` +
          `${cursorField} >= '${escapeSoql(since)}' AND ` +
          `${cursorField} <= '${escapeSoql(notAfter)}'`,
      );
      const response = await fetchDataSf({
        fetch,
        url,
        headers,
        sleep,
        maxAttempts: maxRequestAttempts,
      });
      if (!response.ok) {
        throw new Error(
          `DataSF ${source} request failed: ${response.status}`,
        );
      }
      return parseDataSfUpperWatermark(await response.json());
    },

    async getPage({ source, since, until, after, limit, observedAt }) {
      const config = getDataSfSourceConfig(source);
      const response = await fetchDataSf({
        fetch,
        url: buildDataSfSourceUrl({
          origin,
          source,
          since,
          until,
          after,
          limit: limit + 1,
        }),
        headers,
        sleep,
        maxAttempts: maxRequestAttempts,
      });
      if (!response.ok) {
        throw new Error(
          `DataSF ${source} request failed: ${response.status}`,
        );
      }

      const sourceRows = z.array(z.unknown()).parse(await response.json());
      const acceptedRows = sourceRows.slice(0, limit);
      const observations: Observation[] = [];
      const errors: Batch<DataSfSourceCursor>["errors"] = [];

      for (const sourceRow of acceptedRows) {
        const parsed = config.schema.safeParse(sourceRow);
        if (!parsed.success) {
          errors.push(
            invalidSourceRow({
              source,
              dataset: config.datasetId,
              data: sourceRow,
              error: parsed.error,
            }),
          );
          continue;
        }
        observations.push(
          toObservation(source, config, parsed.data, observedAt),
        );
      }

      const done = sourceRows.length <= limit;
      const next = done
        ? undefined
        : parsePageCursor(config, acceptedRows.at(-1));
      if (!done && next === undefined) {
        throw new Error(`DataSF ${source} batch ended without a cursor`);
      }
      return { observations, errors, ...(next ? { next } : {}), done };
    },
  };
}

export function buildDataSfSourceUrl({
  origin = DATA_SF_ORIGIN,
  source,
  since,
  until,
  after,
  limit,
}: {
  origin?: string;
  source: DataSfSourceName;
  since: string;
  until: string;
  after?: DataSfSourceCursor;
  limit: number;
}): URL {
  const config = getDataSfSourceConfig(source);
  const cursorField = config.cursorField;
  const url = new URL(`/resource/${config.datasetId}.json`, origin);
  url.searchParams.set("$select", config.select);
  url.searchParams.set(
    "$order",
    `${cursorField} ASC,${config.idField} ASC`,
  );
  url.searchParams.set("$limit", String(limit));

  const where = [
    `${cursorField} IS NOT NULL`,
    `${config.idField} IS NOT NULL`,
    `${cursorField} >= '${escapeSoql(since)}'`,
    `${cursorField} <= '${escapeSoql(until)}'`,
  ];
  if (after) {
    const cursorAt = escapeSoql(after.cursorAt);
    const id = escapeSoql(after.id);
    where.push(
      `(${cursorField} > '${cursorAt}' OR ` +
        `(${cursorField} = '${cursorAt}' AND ` +
        `${config.idField} > '${id}'))`,
    );
  }
  url.searchParams.set("$where", where.join(" AND "));
  return url;
}

function toObservation(
  source: DataSfSourceName,
  config: DataSfSourceConfig,
  row: DataSfSourceRow,
  observedAt: string,
): Observation {
  return {
    source,
    id: requiredString(row, config.idField),
    occurredAt: requiredString(row, config.occurredField),
    updatedAt: requiredString(row, config.updatedField),
    observedAt,
    kind:
      firstSourceString(row, config.kindFields) ?? config.defaultKind,
    area: config.areaField
      ? sourceString(row, config.areaField)
      : null,
    data: row,
  };
}

function parsePageCursor(
  config: DataSfSourceConfig,
  row: unknown,
): DataSfSourceCursor | undefined {
  const cursorField = config.cursorField;
  const parsed = z
    .object({
      [cursorField]: socrataTimestampSchema,
      [config.idField]: z.string().min(1),
    })
    .passthrough()
    .safeParse(row);
  return parsed.success
    ? {
        cursorAt: requiredString(parsed.data, cursorField),
        id: requiredString(parsed.data, config.idField),
      }
    : undefined;
}

function firstSourceString(
  row: Record<string, unknown>,
  fields: readonly string[],
): string | null {
  for (const field of fields) {
    const value = sourceString(row, field);
    if (value !== null) {
      return value;
    }
  }
  return null;
}

function sourceString(
  row: Record<string, unknown>,
  field: string,
): string | null {
  const value = row[field];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function requiredString(
  row: Record<string, unknown>,
  field: string,
): string {
  const value = sourceString(row, field);
  if (value === null) {
    throw new Error(`Expected ${field} after source validation`);
  }
  return value;
}

function escapeSoql(value: string): string {
  return value.replaceAll("'", "''");
}

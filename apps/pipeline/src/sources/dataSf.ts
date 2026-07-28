import { z } from "zod";

import type { SourceError } from "@/observation.ts";
import {
  fetchWithRetry,
  type RequestSleep,
} from "./request.ts";

const INITIAL_RETRY_DELAY_MILLISECONDS = 250;

export type DataSfSleep = RequestSleep;

export const socrataTimestampSchema = z
  .string()
  .refine(isValidSocrataTimestamp, {
    message: "Expected a valid offset-free Socrata timestamp",
  });

const upperWatermarkSchema = z
  .array(
    z.union([
      z.object({ upper_watermark: socrataTimestampSchema }).strict(),
      z.object({}).strict(),
    ]),
  )
  .length(1);

export function parseDataSfUpperWatermark(payload: unknown): string | null {
  const [row] = upperWatermarkSchema.parse(payload);
  return "upper_watermark" in row ? row.upper_watermark : null;
}

export async function fetchDataSf({
  fetch,
  url,
  headers,
  sleep,
  maxAttempts,
  requestTimeoutMilliseconds,
}: {
  fetch: typeof globalThis.fetch;
  url: URL;
  headers?: Record<string, string>;
  sleep?: DataSfSleep;
  maxAttempts?: number;
  requestTimeoutMilliseconds?: number;
}): Promise<Response> {
  return fetchWithRetry({
    fetch,
    url,
    headers,
    label: "DataSF",
    sleep,
    maxAttempts,
    requestTimeoutMilliseconds,
    initialRetryDelayMilliseconds: INITIAL_RETRY_DELAY_MILLISECONDS,
  });
}

export function invalidSourceRow({
  source,
  dataset,
  data,
  error,
}: {
  source: SourceError["source"];
  dataset: string;
  data: unknown;
  error: z.ZodError;
}): SourceError {
  return {
    source,
    dataset,
    data,
    issues: error.issues.map((issue) => ({
      path:
        issue.path.length === 0 ? "$" : issue.path.map(String).join("."),
      message: issue.message,
    })),
  };
}

export function dataSfTimestampBefore(
  instant: string,
  minutes: number,
): string {
  const date = new Date(Date.parse(instant) - minutes * 60_000);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  })
    .formatToParts(date)
    .reduce<Record<string, string>>((result, part) => {
      result[part.type] = part.value;
      return result;
    }, {});

  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}.000`;
}

export function subtractDataSfMinutes(
  timestamp: string,
  minutes: number,
): string {
  return new Date(Date.parse(`${timestamp}Z`) - minutes * 60_000)
    .toISOString()
    .slice(0, -1);
}

function isValidSocrataTimestamp(value: string): boolean {
  const match =
    /^(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})T(?<hour>\d{2}):(?<minute>\d{2}):(?<second>\d{2})(?:\.(?<fraction>\d{1,3}))?$/.exec(
      value,
    );
  if (!match?.groups) {
    return false;
  }

  const year = Number(match.groups.year);
  const month = Number(match.groups.month);
  const day = Number(match.groups.day);
  const hour = Number(match.groups.hour);
  const minute = Number(match.groups.minute);
  const second = Number(match.groups.second);

  return (
    year >= 1 &&
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= daysInMonth(year, month) &&
    hour >= 0 &&
    hour <= 23 &&
    minute >= 0 &&
    minute <= 59 &&
    second >= 0 &&
    second <= 59
  );
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    const isLeapYear =
      year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    return isLeapYear ? 29 : 28;
  }

  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

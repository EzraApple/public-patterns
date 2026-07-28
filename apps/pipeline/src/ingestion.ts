import { z } from "zod";

export const MAX_BATCHES_PER_RUN = 4;

export const calendarDaySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((day) => {
    const date = new Date(`${day}T00:00:00Z`);
    return (
      Number.isFinite(date.getTime()) &&
      date.toISOString().slice(0, 10) === day
    );
  });

export function sourceTimeBefore(instant: string, minutes: number): string {
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

export function subtractMinutes(timestamp: string, minutes: number): string {
  return new Date(Date.parse(`${timestamp}Z`) - minutes * 60_000)
    .toISOString()
    .slice(0, -1);
}

export function shiftDay(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export const sources = [
  "311",
  "dispatch-realtime",
  "dispatch-closed",
  "fire-ems",
  "police-incidents",
  "building-complaints",
  "traffic-crashes",
  "health-inspections",
  "building-permits",
  "eviction-notices",
  "transit-alerts",
] as const;

export type Source = (typeof sources)[number];

export type Observation = {
  source: Source;
  id: string;
  occurredAt: string;
  updatedAt: string;
  observedAt: string;
  kind: string;
  area: string | null;
  data: Record<string, unknown>;
};

export type SourceError = {
  source: Source;
  dataset: string;
  data: unknown;
  issues: { path: string; message: string }[];
};

export type Batch<Cursor> = {
  observations: Observation[];
  errors: SourceError[];
  next?: Cursor;
  done: boolean;
};

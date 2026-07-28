export type Env = {
  DB: D1Database;
  INVESTIGATOR: Fetcher;
  PUBLIC_PATTERNS_ENV: string;
  SOCRATA_APP_TOKEN?: string;
  TRANSIT_511_API_KEY?: string;
  ENABLE_DEV_FIXTURES?: string;
};

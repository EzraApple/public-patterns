import type { ManualInvestigationJob } from "./manualInvestigationJobs.ts";

export type Env = {
  ARCHIVE: R2Bucket;
  DB: D1Database;
  INVESTIGATOR: Fetcher;
  INVESTIGATION_WORKFLOW: Workflow<ManualInvestigationJob>;
  PUBLIC_PATTERNS_ENV: string;
  SOCRATA_APP_TOKEN?: string;
  TRANSIT_511_API_KEY?: string;
  ENABLE_DEV_FIXTURES?: string;
};

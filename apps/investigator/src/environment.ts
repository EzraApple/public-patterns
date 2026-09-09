import type { Sandbox } from "@cloudflare/sandbox";

export type Env = {
  ARCHIVE: R2Bucket;
  Sandbox: DurableObjectNamespace<Sandbox>;
  PUBLIC_PATTERNS_ENV: string;
  INVESTIGATOR_MODEL?: string;
  DEEPSEEK_API_KEY?: string;
  OPENAI_API_KEY?: string;
};

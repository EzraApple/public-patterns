import type { Sandbox } from "@cloudflare/sandbox";

export type Env = {
  ARCHIVE: R2Bucket;
  Sandbox: DurableObjectNamespace<Sandbox>;
  PUBLIC_PATTERNS_ENV: string;
  DEEPSEEK_API_KEY?: string;
};

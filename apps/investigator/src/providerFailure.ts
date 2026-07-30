export type ProviderFailureDiagnostic = {
  provider: "DeepSeek";
  operation: "agent investigation";
  kind:
    | "configuration"
    | "authentication"
    | "quota"
    | "rate_limit"
    | "timeout"
    | "provider"
    | "network"
    | "unknown";
  retryable: boolean;
  action: string;
  status?: number;
  providerCode?: string;
  requestId?: string;
  detail?: string;
};

export class ProviderFailureError extends Error {
  readonly diagnostic: ProviderFailureDiagnostic;

  constructor(diagnostic: ProviderFailureDiagnostic) {
    super(formatProviderFailure(diagnostic));
    this.name = "ProviderFailureError";
    this.diagnostic = diagnostic;
  }
}

export function missingDeepSeekKey(): ProviderFailureError {
  return new ProviderFailureError({
    provider: "DeepSeek",
    operation: "agent investigation",
    kind: "configuration",
    retryable: false,
    action:
      "Set DEEPSEEK_API_KEY in the active Doppler config and redeploy the investigator Worker.",
  });
}

export function deepSeekFailureFromOutput(
  output: string,
): ProviderFailureError | undefined {
  const status = parseNumber(
    output,
    /(?:HTTP|["']?status["']?)\s*[:=]?\s*(\d{3})\b/i,
  );
  const providerCode = parseString(
    output,
    /["']?(?:code|type)["']?\s*[:=]\s*["']([^"'\s,}]+)["']/i,
  );
  const requestId = parseString(
    output,
    /["']?(?:request[_ -]?id|x-request-id)["']?\s*[:=]\s*["']?([a-z0-9._-]+)/i,
  );
  const normalized = output.toLowerCase();
  const kind = classifyDeepSeekFailure(status, normalized);
  if (!kind) {
    return;
  }
  return new ProviderFailureError({
    provider: "DeepSeek",
    operation: "agent investigation",
    kind,
    retryable: ["rate_limit", "timeout", "provider", "network"].includes(kind),
    action: actionFor(kind),
    ...(status ? { status } : {}),
    ...(providerCode ? { providerCode } : {}),
    ...(requestId ? { requestId } : {}),
    detail: compactDetail(output),
  });
}

function classifyDeepSeekFailure(
  status: number | undefined,
  normalized: string,
): ProviderFailureDiagnostic["kind"] | undefined {
  if (
    /deepseek_api_key.*(?:required|missing|not set)|(?:required|missing).*deepseek_api_key/.test(
      normalized,
    )
  ) {
    return "configuration";
  }
  if (
    status === 402 ||
    /insufficient[_ -]?(quota|balance|credits?)|billing|payment required|account balance/.test(
      normalized,
    )
  ) {
    return "quota";
  }
  if (
    status === 401 ||
    status === 403 ||
    /invalid api key|authentication failed|unauthorized/.test(normalized)
  ) {
    return "authentication";
  }
  if (status === 429 || /rate[_ -]?limit|too many requests/.test(normalized)) {
    return "rate_limit";
  }
  if (
    status === 408 ||
    status === 504 ||
    /timed? ?out|timeout/.test(normalized)
  ) {
    return "timeout";
  }
  if (
    (status !== undefined && status >= 500) ||
    /service unavailable|provider overloaded|internal server error/.test(
      normalized,
    )
  ) {
    return "provider";
  }
  if (/econn|network|dns|connection reset|fetch failed/.test(normalized)) {
    return "network";
  }
}

export function providerFailureDiagnostic(
  error: unknown,
): ProviderFailureDiagnostic | undefined {
  return error instanceof ProviderFailureError
    ? error.diagnostic
    : undefined;
}

function actionFor(kind: ProviderFailureDiagnostic["kind"]): string {
  switch (kind) {
    case "configuration":
      return "Set DEEPSEEK_API_KEY in Doppler and redeploy the investigator Worker.";
    case "authentication":
      return "Verify or rotate DEEPSEEK_API_KEY in Doppler, then redeploy the investigator Worker.";
    case "quota":
      return "Refill credits or enable billing for the DeepSeek account behind DEEPSEEK_API_KEY, then retry.";
    case "rate_limit":
      return "Wait and retry; if this persists, check the DeepSeek account tier and rate limits.";
    case "timeout":
      return "Retry; if this persists, check DeepSeek status and model latency.";
    case "provider":
      return "Check DeepSeek status and retry after the outage clears.";
    case "network":
      return "Retry; if this persists, check sandbox egress and DeepSeek reachability.";
    case "unknown":
      return "Inspect the archived agent output before retrying.";
  }
}

function compactDetail(output: string): string {
  return output.replace(/\s+/g, " ").trim().slice(-500);
}

function parseNumber(value: string, pattern: RegExp): number | undefined {
  const match = pattern.exec(value)?.[1];
  return match ? Number(match) : undefined;
}

function parseString(value: string, pattern: RegExp): string | undefined {
  return pattern.exec(value)?.[1];
}

function formatProviderFailure(
  diagnostic: ProviderFailureDiagnostic,
): string {
  const references = [
    diagnostic.status ? `HTTP ${diagnostic.status}` : undefined,
    diagnostic.providerCode
      ? `code ${diagnostic.providerCode}`
      : undefined,
    diagnostic.requestId
      ? `request ${diagnostic.requestId}`
      : undefined,
  ].filter(Boolean);
  const suffix = references.length ? ` (${references.join(", ")})` : "";
  const detail = diagnostic.detail ? ` ${diagnostic.detail}` : "";
  return `DeepSeek agent investigation failed [${diagnostic.kind}]${suffix}.${detail} Action: ${diagnostic.action}`;
}

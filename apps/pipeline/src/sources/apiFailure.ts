export type ApiFailureKind =
  | "configuration"
  | "authentication"
  | "quota"
  | "rate_limit"
  | "timeout"
  | "provider"
  | "network"
  | "unknown";

export type ApiFailureDiagnostic = {
  provider: string;
  operation: string;
  kind: ApiFailureKind;
  retryable: boolean;
  action: string;
  status?: number;
  providerCode?: string;
  requestId?: string;
  detail?: string;
};

export class ApiRequestError extends Error {
  readonly diagnostic: ApiFailureDiagnostic;

  constructor(diagnostic: ApiFailureDiagnostic) {
    super(formatApiFailure(diagnostic));
    this.name = "ApiRequestError";
    this.diagnostic = diagnostic;
  }
}

export function apiConfigurationError({
  provider,
  operation,
  credentialName,
}: {
  provider: string;
  operation: string;
  credentialName: string;
}): ApiRequestError {
  return new ApiRequestError({
    provider,
    operation,
    kind: "configuration",
    retryable: false,
    action: `Set ${credentialName} in Doppler, then redeploy the Worker.`,
  });
}

export async function apiResponseError({
  provider,
  operation,
  response,
  credentialName,
  hasCredential,
  secrets = [],
}: {
  provider: string;
  operation: string;
  response: Response;
  credentialName: string;
  hasCredential: boolean;
  secrets?: (string | undefined)[];
}): Promise<ApiRequestError> {
  const responseText = redact(
    (await response.text()).slice(0, 2_000),
    secrets,
  );
  const providerError = parseProviderError(responseText);
  const providerRequestId = requestId(response);
  const kind = classifyFailure(
    response.status,
    `${providerError.code ?? ""} ${providerError.message ?? ""}`,
  );
  return new ApiRequestError({
    provider,
    operation,
    kind,
    retryable: isRetryable(kind),
    action: actionFor({
      provider,
      kind,
      credentialName,
      hasCredential,
    }),
    status: response.status,
    ...(providerError.code
      ? { providerCode: providerError.code }
      : {}),
    ...(providerRequestId ? { requestId: providerRequestId } : {}),
    ...(providerError.message
      ? { detail: providerError.message.slice(0, 500) }
      : {}),
  });
}

export function apiNetworkError({
  provider,
  operation,
  error,
  secrets = [],
}: {
  provider: string;
  operation: string;
  error: unknown;
  secrets?: (string | undefined)[];
}): ApiRequestError {
  if (error instanceof ApiRequestError) {
    return error;
  }
  const detail = redact(
    error instanceof Error ? error.message : String(error),
    secrets,
  );
  const kind = isTimeout(error, detail) ? "timeout" : "network";
  return new ApiRequestError({
    provider,
    operation,
    kind,
    retryable: true,
    action: actionFor({
      provider,
      kind,
      credentialName: "",
      hasCredential: false,
    }),
    detail: detail.slice(0, 500),
  });
}

export function apiFailureDiagnostic(
  error: unknown,
): ApiFailureDiagnostic | undefined {
  return error instanceof ApiRequestError
    ? error.diagnostic
    : undefined;
}

function classifyFailure(
  status: number,
  providerDetail: string,
): ApiFailureKind {
  const detail = providerDetail.toLowerCase();
  if (
    status === 402 ||
    /insufficient[_ -]?(quota|balance|credits?)|billing|payment required|account balance/.test(
      detail,
    )
  ) {
    return "quota";
  }
  if (status === 401 || status === 403) {
    return "authentication";
  }
  if (status === 429) {
    return "rate_limit";
  }
  if (status === 408 || status === 504) {
    return "timeout";
  }
  if (status >= 500) {
    return "provider";
  }
  return "unknown";
}

function actionFor({
  provider,
  kind,
  credentialName,
  hasCredential,
}: {
  provider: string;
  kind: ApiFailureKind;
  credentialName: string;
  hasCredential: boolean;
}): string {
  switch (kind) {
    case "configuration":
      return `Set ${credentialName} in Doppler, then redeploy the Worker.`;
    case "authentication":
      return hasCredential
        ? `Verify or rotate ${credentialName} in Doppler, then redeploy the Worker.`
        : `Set ${credentialName} in Doppler, then redeploy the Worker.`;
    case "quota":
      return `Refill credits or enable billing for the ${provider} account behind ${credentialName}, then retry.`;
    case "rate_limit":
      return hasCredential
        ? `Wait and retry; if this persists, check the ${provider} account tier and rate limits.`
        : `Wait and retry, or add ${credentialName} in Doppler for authenticated limits.`;
    case "timeout":
      return `Retry; if this persists, check ${provider} status and request latency.`;
    case "provider":
      return `Check ${provider} status and retry after the outage clears.`;
    case "network":
      return `Retry; if this persists, check Worker egress and ${provider} reachability.`;
    case "unknown":
      return `Inspect the provider code, request ID, and sanitized detail before retrying.`;
  }
}

function isRetryable(kind: ApiFailureKind): boolean {
  return ["rate_limit", "timeout", "provider", "network"].includes(kind);
}

function parseProviderError(value: string): {
  code?: string;
  message?: string;
} {
  try {
    const body = JSON.parse(value) as Record<string, unknown>;
    const candidate =
      typeof body.error === "object" && body.error !== null
        ? (body.error as Record<string, unknown>)
        : body;
    const code = firstString(candidate, ["code", "errorCode", "type"]);
    const message = firstString(candidate, [
      "message",
      "error",
      "description",
    ]);
    return {
      ...(code ? { code } : {}),
      ...(message ? { message } : {}),
    };
  } catch {
    const message = value.replace(/\s+/g, " ").trim();
    return message ? { message } : {};
  }
}

function firstString(
  value: Record<string, unknown>,
  keys: string[],
): string | undefined {
  for (const key of keys) {
    if (typeof value[key] === "string" && value[key].trim()) {
      return value[key];
    }
  }
}

function requestId(response: Response): string | undefined {
  return (
    response.headers.get("x-request-id") ??
    response.headers.get("x-socrata-requestid") ??
    response.headers.get("cf-ray") ??
    undefined
  );
}

function isTimeout(error: unknown, message: string): boolean {
  return (
    (error instanceof Error &&
      ["AbortError", "TimeoutError"].includes(error.name)) ||
    /timed? ?out|timeout/i.test(message)
  );
}

function redact(value: string, secrets: (string | undefined)[]): string {
  let redacted = value;
  for (const secret of secrets) {
    if (secret) {
      redacted = redacted.replaceAll(secret, "[redacted]");
    }
  }
  return redacted;
}

function formatApiFailure(diagnostic: ApiFailureDiagnostic): string {
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
  return `${diagnostic.provider} ${diagnostic.operation} failed [${diagnostic.kind}]${suffix}.${detail} Action: ${diagnostic.action}`;
}

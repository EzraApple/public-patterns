const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_REQUEST_TIMEOUT_MILLISECONDS = 10_000;
const MAX_ATTEMPTS = 5;
const MAX_RETRY_DELAY_MILLISECONDS = 30_000;

export type RequestSleep = (
  delayMilliseconds: number,
) => Promise<void>;

export async function fetchWithRetry({
  fetch,
  url,
  headers,
  label,
  sleep = defaultSleep,
  maxAttempts = DEFAULT_MAX_ATTEMPTS,
  requestTimeoutMilliseconds = DEFAULT_REQUEST_TIMEOUT_MILLISECONDS,
  initialRetryDelayMilliseconds,
}: {
  fetch: typeof globalThis.fetch;
  url: URL;
  headers?: Record<string, string>;
  label: string;
  sleep?: RequestSleep;
  maxAttempts?: number;
  requestTimeoutMilliseconds?: number;
  initialRetryDelayMilliseconds: number;
}): Promise<Response> {
  assertBoundedInteger(maxAttempts, "maxAttempts", MAX_ATTEMPTS);
  assertPositiveInteger(
    requestTimeoutMilliseconds,
    "requestTimeoutMilliseconds",
  );
  assertPositiveInteger(
    initialRetryDelayMilliseconds,
    "initialRetryDelayMilliseconds",
  );

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    let response: Response;
    try {
      response = await fetch(url, {
        headers,
        signal: AbortSignal.timeout(requestTimeoutMilliseconds),
      });
    } catch (error) {
      if (attempt === maxAttempts - 1) {
        throw error;
      }

      await sleep(defaultRetryDelayMilliseconds(
        attempt,
        initialRetryDelayMilliseconds,
      ));
      continue;
    }

    if (!isRetryableStatus(response.status) || attempt === maxAttempts - 1) {
      return response;
    }

    await sleep(
      retryDelayMilliseconds(
        response,
        attempt,
        initialRetryDelayMilliseconds,
      ),
    );
  }

  throw new Error(`${label} request exhausted its retry attempts`);
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || (status >= 500 && status <= 599);
}

function retryDelayMilliseconds(
  response: Response,
  attempt: number,
  initialRetryDelayMilliseconds: number,
): number {
  const retryAfter = response.headers.get("Retry-After");
  if (retryAfter === null) {
    return defaultRetryDelayMilliseconds(
      attempt,
      initialRetryDelayMilliseconds,
    );
  }

  const seconds = Number(retryAfter);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(seconds * 1_000, MAX_RETRY_DELAY_MILLISECONDS);
  }

  const retryAt = Date.parse(retryAfter);
  return Number.isFinite(retryAt)
    ? Math.min(
        Math.max(0, retryAt - Date.now()),
        MAX_RETRY_DELAY_MILLISECONDS,
      )
    : defaultRetryDelayMilliseconds(
        attempt,
        initialRetryDelayMilliseconds,
      );
}

function defaultRetryDelayMilliseconds(
  attempt: number,
  initialRetryDelayMilliseconds: number,
): number {
  return Math.min(
    initialRetryDelayMilliseconds * 2 ** attempt,
    MAX_RETRY_DELAY_MILLISECONDS,
  );
}

function defaultSleep(delayMilliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMilliseconds));
}

function assertBoundedInteger(
  value: number,
  name: string,
  maximum: number,
): void {
  if (!Number.isInteger(value) || value < 1 || value > maximum) {
    throw new RangeError(
      `${name} must be an integer from 1 to ${maximum}`,
    );
  }
}

function assertPositiveInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 1) {
    throw new RangeError(`${name} must be a positive integer`);
  }
}

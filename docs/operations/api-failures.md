# API failure diagnosis

Provider failures are translated at the API boundary into sanitized diagnostics:

```json
{
  "provider": "OpenAI",
  "operation": "image generation",
  "kind": "quota",
  "status": 429,
  "providerCode": "insufficient_quota",
  "requestId": "request-id",
  "retryable": false,
  "action": "Refill credits or enable billing..."
}
```

Credential values and credential-bearing request URLs are never logged. Provider
messages are truncated and any known credential echoed in a response is
redacted.

## Where failures appear

- Manual ingestion responses include `api` when DataSF or 511 fails.
- Scheduled ingestion logs emit `source.ingestion.failed`.
- Investigator logs emit `investigation.failed`.
- R2 investigation archives store a blocking DeepSeek error as
  `providerFailure`.
- A non-blocking OpenAI hero failure is stored as `imageFailure`; the reviewed
  article may still complete with no hero.

Use the diagnostic `requestId` when contacting a provider. The `action` field
names the Doppler credential or account operation to check.

## Failure kinds

| Kind | Meaning | First action |
| --- | --- | --- |
| `configuration` | Credential was not injected | Set it in Doppler and redeploy |
| `authentication` | Missing, invalid, revoked, or wrong-project key | Verify or rotate the named key |
| `quota` | Credits, balance, or billing are exhausted | Refill or enable billing |
| `rate_limit` | Account request limit was reached | Wait, then check the account tier |
| `timeout` | Provider did not answer in time | Retry, then check provider latency |
| `provider` | Provider returned a server failure | Check provider status |
| `network` | Worker or sandbox could not reach the provider | Check egress and retry |
| `invalid_response` | Provider returned an unexpected successful payload | Inspect the request ID before changing code |
| `unknown` | Failure did not match a safe known category | Inspect the sanitized detail |

Authentication and quota failures are not marked retryable because retries
cannot repair the account. Rate limits, timeouts, provider outages, and network
errors are retryable after the underlying condition changes.

## Production logs

Tail the relevant Worker while reproducing the failure:

```sh
doppler run --config prd -- pnpm --filter @public-patterns/pipeline exec wrangler tail public-patterns-pipeline
doppler run --config prd -- pnpm --filter @public-patterns/investigator exec wrangler tail public-patterns-investigator
```

After changing a runtime key in Doppler, redeploy the owning Worker so CI
synchronizes the updated secret into Cloudflare. DeepSeek and OpenAI belong to
the investigator; 511 and Socrata belong to the pipeline; `LAB_TOKEN` belongs
to the web Worker. A missing lab token fails closed and emits
`credential.configuration.failed`.

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

## Interrupted agent sessions

A terminal structured OpenCode error takes precedence over earlier tool output
when classifying a failure. A tool command containing `timeout=120` is not
proof that a later `Transport` error was a provider timeout.

The July 27 OpenCode build (`0.0.0-next-16303`) ended long-running CLI event
streams after Bun's default five-minute deadline. This could interrupt useful
research and surface only `Transport`, independently of DeepSeek billing.
The investigator now pins `0.0.0-beta-17823`, published August 21, after the
[upstream event-stream fix](https://github.com/anomalyco/opencode/commit/d5bf8799c0e0706ec604324d9abef45cfae4dcd0).
The existing 12-minute sandbox limit and Workflow retry budget remain in force.

When a run exits or times out without a valid submission, its failed archive
also retains any standard `output/brief.md`, `output/article.json`, and
`output/review.md` files under `unsubmittedArtifacts`. Text is redacted and
bounded like session output. These are unvalidated recovery material; they do
not create a completed checkpoint or authorize publication.

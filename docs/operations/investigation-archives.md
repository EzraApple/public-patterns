# Investigation archives

D1 is the searchable index for successful investigations. R2 holds an audit
bundle for every run: its input, redacted OpenCode output, result, brief, and
article. Failed runs are archived too and can be inspected in the private R2
bucket.

The daily trial considers the previous calendar day and skips investigations
already indexed in D1. It favors sources investigated less often in the last
seven days, then burst ratio and excess; this is source exploration, not a
validated ranking of story quality. The two trigger slots can complete at most
two investigations, stopping after publication. A watch or discard frees the
next slot for another lead; retries recover a saved result before selecting
anything new. Complete `investigate` outcomes publish automatically; `watch`, `discard`, and failed
outcomes remain private.

`daily_investigation_runs` holds the current result for each day, including
days with no candidate. `daily_investigation_attempts` preserves every retry.
Both capture detector version and thresholds, per-source readiness and
candidate summaries, the selected signal, terminal status, investigation and
article links, or a sanitized failure stage. Treat interesting misses and
failures as an eval inbox: reproduce the case, then add only the compact input
and expected behavior to git.

For manual diagnosis, `POST /api/internal/investigations/replay` accepts a
source, day, kind, and area and returns a Workflow job ID with HTTP 202. Poll
`GET /api/internal/investigation-jobs/JOB_ID`; a completed job points to the
saved investigation, while a failed job preserves its safe retry, R2 archive,
and allowlisted provider diagnostics. The Workflow loads the exact slice from D1 and sends
the raw observations plus nearby cross-source context through the normal
investigator. It does not accept injected evidence or bypass publication
review.

Manual investigation jobs first freeze the selected observations and nearby
context in R2; D1 stores the request fingerprint and archive key. Workflow then
passes only the job ID into one 15-minute investigation step with one retry
after 30 seconds. Retries reuse both the frozen case and the Workflow ID,
allowing the investigator to recover a completed R2 checkpoint instead of
repeating model work. Workflow state is retained for seven days; the
investigation and archive remain in D1 and R2.

Every start requires an `Idempotency-Key` of 8-200 characters. Reuse the key
when retrying the same HTTP request; generate a new key for a deliberate rerun.
The same key with changed input returns HTTP 409.

Start a replay, copy the returned `id`, then poll it without keeping the start
request open:

```sh
doppler run --config prd -- sh -c 'curl -fsS \
  -X POST \
  -H "Authorization: Bearer $LAB_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: $IDEMPOTENCY_KEY" \
  -d '\''{"source":"dispatch","day":"YYYY-MM-DD","kind":"TRAFFIC STOP","area":"AREA"}'\'' \
  https://publicpatterns.com/api/internal/investigations/replay'

doppler run --config prd -- sh -c 'curl -fsS \
  -H "Authorization: Bearer $LAB_TOKEN" \
  https://publicpatterns.com/api/internal/investigation-jobs/JOB_ID'
```

Keep investigator capacity above one instance. Cloudflare may retain the prior
container briefly during a deploy; a single-instance ceiling can reject the
first post-deploy investigation before the agent starts.

Compact eval definitions and expected behavior stay in git so changes remain
reviewable. Large source snapshots, replay inputs, and saved run artifacts
belong in R2 and can be referenced by an eval fixture.

## Find recent runs

```sh
doppler run --config prd -- sh -c 'curl -fsS \
  -H "Authorization: Bearer $LAB_TOKEN" \
  https://publicpatterns.com/api/internal/daily-runs'
```

Run an unprocessed day through the same operation used by the cron trigger:

```sh
doppler run --config prd -- sh -c 'curl -fsS \
  -X POST \
  -H "Authorization: Bearer $LAB_TOKEN" \
  -H "Content-Type: application/json" \
  -d '\''{"day":"YYYY-MM-DD"}'\'' \
  https://publicpatterns.com/api/internal/daily-runs'
```

Published days and days with two completed watch/discard investigations return
`409`. A first watch or discard permits one more candidate. A day can be
reclaimed when data was not ready,
detection failed, a retryable investigation failed, or a `running` lease is
older than 30 minutes. Publication and nonretryable provider failures stay
locked. Reclaimed work first resumes any saved daily investigation instead of
selecting a second candidate. Exact case retries reuse a content-derived ID and
completed R2 checkpoint, so a lost D1 write does not repeat paid model work.

## Find recent investigations

```sh
doppler run --config prd -- wrangler d1 execute public-patterns-pipeline \
  --remote \
  --command "SELECT id, created_at, source, kind, area, json_extract(result_json, '$.submission.outcome') AS outcome, json_extract(result_json, '$.archiveKey') AS archive_key FROM investigations ORDER BY created_at DESC LIMIT 50"
```

## Download one archive

Copy the immutable, attempt-specific `archive_key` returned above. The separate
`investigations/by-id/INVESTIGATION_ID.json` object is only a completed-result
checkpoint used for retry recovery:

```sh
doppler run --config prd -- wrangler r2 object get public-patterns-archive/ARCHIVE_KEY \
  --file investigation.json --remote
```

Use `public-patterns-archive-dev` for preview runs. Archives may contain public
source records and agent working output; keep both buckets private.

## Diagnose a failed run

Worker logs emit one correlated lifecycle for each investigation ID:

- `investigation.started` when the route accepts the case
- `investigation.agent.started` after the sandbox and input are ready
- `investigation.agent.finished` with execution duration, exit code, and
  whether the Sandbox call threw
- `investigation.completed` or `investigation.failed` with total duration and
  the archive key; failures also include safe retry and provider fields

The R2 archive retains the agent start, completion, duration, exit code, and
Sandbox-throw flag alongside redacted output. This survives Worker log
retention. A missing `agent.started` event isolates setup; a Sandbox throw
isolates the control path; an ordinary nonzero exit with a provider diagnostic
isolates the agent or provider path.

Before the first CI deployment, the `CLOUDFLARE_API_TOKEN` stored in Doppler
must include account-level R2 object and bucket edit permission.

## Recovery publication checks

A replay is private until explicitly published. Before publishing recovered
work, compare its full article, record IDs, dates, and main finding with the
existing articles. A new date or title can still repeat a finding already
covered in an older article.

Publication atomically refuses a second slug for an already-published case
with the same source, day, kind, and area, even when the replay uses a new
investigation ID. A new investigation can still create a revision under the
existing slug. This exact-case check does not recognize semantic overlap
between different dates or sources; that still requires editorial review.

Each new case also receives up to 20 current articles with full text and source
links, prioritizing the selected area and then recent publication dates. This
coverage is frozen with manual replay input. The agent uses it to identify
repeated findings; it is not an independent source for factual claims.
Coverage outside that bounded context, or published after the case was frozen,
still requires a final editorial comparison before a manual backfill is published.

## Watch follow-ups

New watch submissions may supply `followUp: { question, evidenceUrls, afterDays }`.
The question names evidence that could change the decision; the URL list has
1–5 HTTP(S) sources and the delay is 1–30 days from the investigation record's
creation time.
At most one due follow-up takes a daily slot, and a chain ends after two
attempts including recorded failures. Terminal failures retire the plan.
The attempt ledger records the parent ID even when the check fails before
saving a child investigation.
Older watch results without a plan are not automatically replayed. Due checks
only run for the current scheduler day, not during historical daily replays.
The fresh case records its parent ID, follow-up attempt, previous brief, and
scheduling day. Publication keeps the selected case's event day in its slug.

Missing hero images no longer block publication. The public layout already
supports a text-only article; citation and duplicate checks still apply.

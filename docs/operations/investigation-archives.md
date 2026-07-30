# Investigation archives

D1 is the searchable index for successful investigations. R2 holds an audit
bundle for every run: its input, redacted OpenCode output, result, brief, and
article. Failed runs are archived too and can be inspected in the private R2
bucket.

The daily trial considers the previous calendar day, chooses one strong ready
burst, and skips successful investigations already indexed in D1. Generated
articles remain private review candidates.

Compact eval definitions and expected behavior stay in git so changes remain
reviewable. Large source snapshots, replay inputs, and saved run artifacts
belong in R2 and can be referenced by an eval fixture.

## Find recent runs

```sh
doppler run --config prd -- wrangler d1 execute public-patterns-pipeline \
  --remote \
  --command "SELECT id, created_at, source, kind, area, json_extract(result_json, '$.submission.outcome') AS outcome, json_extract(result_json, '$.archiveKey') AS archive_key FROM investigations ORDER BY created_at DESC LIMIT 50"
```

## Download one archive

Copy the `archive_key` returned above:

```sh
doppler run --config prd -- wrangler r2 object get public-patterns-archive/ARCHIVE_KEY \
  --file investigation.json --remote
```

Use `public-patterns-archive-dev` for preview runs. Archives may contain public
source records and agent working output; keep both buckets private.

Before the first CI deployment, the `CLOUDFLARE_API_TOKEN` stored in Doppler
must include account-level R2 object and bucket edit permission.

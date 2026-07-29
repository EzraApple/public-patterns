# Investigator

This Worker runs one investigation per ephemeral Cloudflare Sandbox.
The container includes OpenCode 2, DeepSeek V4 Pro Thinking, Python, analysis
and article-writing skills, and a `submit_brief` tool.

```sh
doppler run -- pnpm dev:investigator
```

For a one-command end-to-end test:

```sh
pnpm dev:investigator:smoke
```

The smoke command starts and stops the Worker, sends an evidence-only historical
fixture, and prints the submitted brief and any article. It requires Docker and
the repo-scoped Doppler `dev` config, takes a few minutes, and makes a paid
DeepSeek request.

Send a candidate as flexible JSON:

```sh
curl -X POST http://127.0.0.1:8788/investigations \
  -H 'content-type: application/json' \
  --data '{"id":"example","case":{"observations":[]}}'
```

The agent reads `case/input.json`, works under `work/`, and writes its internal
brief under `output/`. An `investigate` outcome also requires a publishable
article. The submission tool validates both paths and ends the OpenCode session.
The Worker archives the input, redacted session output, brief, and optional
article in R2 before destroying the sandbox. Its response includes the archive
key, which the pipeline preserves in D1.

Eval callers must pass only the evidence under test and source links. Expected
results, fixture notes, and detector settings stay outside the agent payload.

The production Worker has no public route and is reachable through the
pipeline's service binding. The prototype passes a limited DeepSeek key into
each sandbox; replace that with a short-lived model proxy before untrusted or
unattended use.

The local container limit is one, so run one investigation at a time.

Production uses `public-patterns-archive`; local and preview runs use
`public-patterns-archive-dev`. See
[`docs/operations/investigation-archives.md`](../../docs/operations/investigation-archives.md)
for the audit workflow.

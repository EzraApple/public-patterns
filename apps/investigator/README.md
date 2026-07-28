# Investigator

This Worker runs one investigation per ephemeral Cloudflare Sandbox.
The container includes OpenCode 2, DeepSeek V4 Pro Thinking, Python, one analysis
skill, and a `submit_brief` tool.

```sh
doppler run -- pnpm dev:investigator
```

For a one-command end-to-end test:

```sh
pnpm dev:investigator:smoke
```

The smoke command starts and stops the Worker, sends an evidence-only historical
fixture, and prints the submitted brief. It requires Docker and the repo-scoped
Doppler `dev` config, takes a few minutes, and makes a paid DeepSeek request.

Send a candidate as flexible JSON:

```sh
curl -X POST http://127.0.0.1:8788/investigations \
  -H 'content-type: application/json' \
  --data '{"id":"example","case":{"observations":[]}}'
```

The agent reads `case/input.json`, works under `work/`, and writes its brief
under `output/`. The submission tool validates the path and ends the OpenCode
session. The Worker returns the brief and destroys the sandbox.

Eval callers must pass only the evidence under test and source links. Expected
results, fixture notes, and detector settings stay outside the agent payload.

The production Worker has no public route and is reachable through the
pipeline's service binding. The prototype passes a limited DeepSeek key into
each sandbox; replace that with a short-lived model proxy before untrusted or
unattended use.

The local container limit is one, so run one investigation at a time.

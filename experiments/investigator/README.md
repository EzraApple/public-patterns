# Investigator eval

These cases test whether the sandboxed investigator preserves evidence
boundaries and recognizes useful cross-source stories after the detector has
selected a candidate. Expectations are deliberately sparse: acceptable
outcomes, essential findings, and known unsupported claims.

List cases without spending model tokens:

```sh
pnpm eval:investigator -- --list
```

Run one paid sandbox case:

```sh
pnpm eval:investigator -- --run marina-fire-2025-10-15
```

The runner passes only source rows or aggregate series, comparison windows,
source queries, evidence URLs, and limitations to the agent. Labels, notes,
roles, expectations, `independentEvidence`, and `absentEvidence` remain outside
the sandbox for human scoring. `investigate` results include a publishable
article for human editorial review. Generated briefs and articles use a
temporary directory and are not committed.

These are online research evals: the fixture is frozen, but the agent may
re-fetch its queries and evidence URLs. Live sources can drift, so every result
requires brief review and paid cases do not run in CI.
Treat any brief citing this repository or its eval files as contaminated.

This is a sparse regression screen, not a semantic judge. Phrase checks should
name essential positive claims; forbidden phrases should be wording that a
correct brief would not reasonably quote to deny. Review failures and reasoning
before changing prompts because a failure may reflect source drift or an
unresolved product decision rather than a model defect.

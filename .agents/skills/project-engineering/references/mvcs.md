# MVCS and runtime boundaries

MVCS describes responsibilities. It does not require a class or file for every
layer.

```text
Route or trigger → service → gateway or storage
                         ↓
                       view
```

## Route or trigger

Cloudflare `fetch`, `scheduled`, queue, and workflow handlers are transport
boundaries. They should:

- parse and validate transport input
- authenticate and authorize when applicable
- call one application operation
- map domain failures into transport responses
- format protocol metadata such as status codes and headers

Do not pass `Request`, execution context, or provider wire objects deeper than
the boundary.

## View

A view formats domain data for a consumer:

- public JSON
- article HTML
- agent-readable Markdown
- an internal review screen

Use a plain function. Create a separate view module only when formatting is
non-trivial or reused. Views do not perform ingestion, investigations, or
storage mutations.

## Service

A service owns one use case or business transition:

- ingest one source window
- evaluate one detector
- promote a signal into a case
- publish an article revision

Services receive domain inputs and coordinate work. Prefer plain functions
until shared construction or state makes a class useful. A service may call
another service when one use case genuinely composes another.

Do not create logic-free service methods that only forward arguments.

## Gateway

A gateway owns communication with an external system such as DataSF, a model
provider, PostHog, or another API.

It owns:

- provider request and response formats
- runtime validation of provider responses
- authentication
- timeouts, retry, and rate-limit policy
- provider-specific error translation

It does not own product decisions. A DataSF gateway may know SoQL and Socrata
pagination; it should not decide whether a trend is publishable.

Retries belong here because the gateway knows whether an operation is safe to
retry. Never blindly retry a mutation without idempotency.

## Storage

D1 and R2 are infrastructure bindings, not automatically repository
abstractions.

- Keep queries near the feature that owns the data.
- Let D1 be the repository until a real boundary requires more.
- Use R2 for immutable evidence, disappearing source snapshots, or large raw
  batches—not as an alternate relational database.
- Introduce a repository interface only for a second storage implementation,
  a reusable query boundary, or a meaningfully isolated domain.

## Worker boundaries

For the MVP:

- the web Worker owns public reads
- the pipeline Worker owns scheduled ingestion and mutations
- investigation remains a pipeline module

Add a Worker when deployment, failure isolation, runtime requirements, or cost
controls materially differ. Do not split a Worker merely to mirror a diagram.

Use service bindings for private Worker-to-Worker calls when a split becomes
real. Do not create public internal endpoints by default.

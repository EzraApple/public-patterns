# Deployment

GitHub Actions is the production deployment boundary.

## Pull requests

Every pull request into `main` installs locked dependencies, typechecks and
builds both executable Workers, runs pipeline unit tests, runs an isolated
pipeline Worker+D1 smoke test, and verifies the web application in local
Workerd. These checks are informational: branch protection requires a pull
request but does not require a passing check.

## Local development

`pnpm dev` selects the Wrangler `dev` environment but runs it entirely locally
through the Cloudflare Vite plugin. The site and Worker share one Vite server
with hot-module replacement. Local Cloudflare binding state persists beneath
`apps/web/.wrangler/state` and is excluded from Git.

Local mode does not upload Worker code or access deployed bindings. When D1,
R2, Queues, or other bindings are added, the Cloudflare tooling will create
local equivalents in that state directory.

`pnpm dev:smoke` starts an isolated local server on port 4173 and verifies both
the site shell and `/api/health`.

The pipeline is a separate local Worker. Apply its D1 migrations once, then
start it:

```sh
pnpm --filter @public-patterns/pipeline db:migrate:local
doppler run -- pnpm dev:pipeline
```

It uses local D1 state and has no remote database, scheduled trigger, or
deployment workflow. Doppler provides the declared `TRANSIT_511_API_KEY`
binding without writing it to a local file. DataSF runs anonymously for this
MVP. `pnpm test` also starts an isolated pipeline Worker+D1 instance and
enables its synthetic fixture endpoint only for that process.

## Remote development

The Wrangler `dev` environment names its deployed Worker
`public-patterns-web-dev`, enables its `workers.dev` URL, and has no production
custom-domain routes. It is deployed only by manually running the **Deploy
dev** GitHub Actions workflow. Local scripts build the same environment but do
not provide a general-purpose dev deploy command.

## Production

Every push to `main` reruns the checks, then deploys only `apps/web` to
Cloudflare. Production deploys are serialized so an older run cannot overtake
a newer one. Pipeline deployment remains intentionally absent while the first
source slices stabilize locally.

The deploy job authenticates to Doppler with the repository's
`DOPPLER_TOKEN` GitHub Actions secret. That read-only service token is scoped to
the `public-patterns` project's `prd` config. Doppler injects:

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`

Do not add provider credentials directly to GitHub or commit local environment
files. Local development uses the repo-scoped Doppler `dev` config.

The manual dev workflow uses the separate `DOPPLER_DEV_TOKEN` GitHub Actions
secret, which is a read-only service token scoped to the Doppler `dev` config.

## Credential boundaries

- A personal Doppler CLI token is scoped to this repository directory for
  local development and administration.
- GitHub Actions receives only the read-only `prd` service token.
- Cloudflare receives the API token only during deployment. The web Worker has
  no runtime secrets today.
- Future runtime secrets should be synchronized explicitly and narrowly rather
  than exposing the full Doppler config to a Worker.

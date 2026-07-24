# Deployment

GitHub Actions is the production deployment boundary.

## Pull requests

Every pull request into `main` installs the locked dependencies, typechecks the
web application, and builds its Worker bundle. These checks are informational:
branch protection requires a pull request but does not require a passing check.

## Production

Every push to `main` reruns the checks, then deploys `apps/web` to Cloudflare.
Production deploys are serialized so an older run cannot overtake a newer one.

The deploy job authenticates to Doppler with the repository's
`DOPPLER_TOKEN` GitHub Actions secret. That read-only service token is scoped to
the `public-patterns` project's `prd` config. Doppler injects:

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`

Do not add provider credentials directly to GitHub or commit local environment
files. Local development uses the repo-scoped Doppler `dev` config.

## Credential boundaries

- A personal Doppler CLI token is scoped to this repository directory for
  local development and administration.
- GitHub Actions receives only the read-only `prd` service token.
- Cloudflare receives the API token only during deployment. The web Worker has
  no runtime secrets today.
- Future runtime secrets should be synchronized explicitly and narrowly rather
  than exposing the full Doppler config to a Worker.

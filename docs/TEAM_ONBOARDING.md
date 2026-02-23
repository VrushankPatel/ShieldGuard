# ShieldGuard Team Onboarding

## What is ShieldGuard?
ShieldGuard is an independent Node.js automation test suite for the SHIELD backend platform (Smart Housing Infrastructure and Entry Log Digitalization).

Its core purpose is to validate SHIELD behavior end-to-end through real API calls, with emphasis on:
- authentication and authorization correctness
- session lifecycle and token invalidation safety
- regression detection before production rollout
- repeatable diagnostics when deployment/runtime failures happen

ShieldGuard is intentionally decoupled from SHIELD source code so QA/automation can evolve independently.

## How ShieldGuard is wired
- Target system URL is environment-driven, never hardcoded.
- Runtime startup can be automated via SHIELD's `run.sh` when local/integration runs require it.
- Container diagnostics are captured before/after test runs to quickly identify unstable containers and restart loops.

Primary env variables:
- `SHIELD_BASE_URL`
- `SHIELD_HEALTH_PATH`
- `SHIELD_AUTOSTART`
- `SHIELD_AUTOSTOP`
- `SHIELD_ENV_FILE`
- `SHIELD_ROOT_PASSWORD` or `SHIELD_ROOT_CREDENTIAL_FILE`

## Access and coordination
To work on ShieldGuard effectively, engineers must get environment access details from:
- **Vrushank Patel** (required contact for host URL access and credentials)

You must request from Vrushank:
- SHIELD target base URL
- environment context (dev/stage/pre-prod)
- required auth credentials/secrets (if not local)
- any IP/network allowlisting constraints

## Swagger/OpenAPI reference for SHIELD
The SHIELD host URL shared by Vrushank will have Swagger enabled for reference.
Use:
- Swagger UI: `<SHIELD_BASE_URL>/swagger-ui.html`
- OpenAPI docs: `<SHIELD_BASE_URL>/v3/api-docs`

Example:
- if base URL is `https://shield-stage.example.com`
  - `https://shield-stage.example.com/swagger-ui.html`
  - `https://shield-stage.example.com/v3/api-docs`

## Expected technical expertise
Contributors are expected to be comfortable with:
- Node.js 18+
- Jest test architecture
- Supertest HTTP testing
- REST/OpenAPI contract validation
- Docker/container troubleshooting
- CI/CD test pipeline basics
- secure handling of environment variables and secrets

## Engineering workflow (mandatory)
1. Pull latest `master`.
2. Create a feature branch per ticket, format:
   - `feature/SG-000X-short-description`
3. Keep changes focused and small.
4. Add/adjust tests with concise comments only where needed.
5. Run full local suite before PR.
6. Open PR to `master` and request review.

No direct pushes to `master`.

## Coding style and test design rules
- Keep tests deterministic and idempotent.
- Avoid fragile timing assumptions.
- Use shared utilities for setup/auth/data factories.
- Keep request payloads explicit and readable.
- Prefer reusable helper methods over copy-paste.
- Comments should be short and purpose-driven.
- Never hardcode secrets or production URLs.

## PR quality bar
Each PR should include:
- linked SG ticket
- scope summary
- test evidence (local run output)
- risk notes (if any)
- diagnostics artifacts path when failure analysis is involved

Use the repository PR template at `.github/pull_request_template.md` and complete every field.

Detailed execution expectations are documented in `docs/CONTRIBUTING.md`.

## Definition of done
A ticket is done when:
- implementation is complete
- tests pass locally and in CI
- documentation updated if behavior changed
- PR approved and merged

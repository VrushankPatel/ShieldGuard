# Contributing to ShieldGuard

This document is the operational workflow for contributors delivering SG tickets.

## 1. Access prerequisites

Before writing code, contact **Vrushank Patel** to receive:
- SHIELD base URL for your assigned environment
- credentials/secrets needed for that environment
- network or VPN requirements
- any environment-specific constraints

Reference endpoints on the provided SHIELD host:
- Swagger UI: `<SHIELD_BASE_URL>/swagger-ui.html`
- OpenAPI docs: `<SHIELD_BASE_URL>/v3/api-docs`

## 2. Ticket-first execution

All work must map to a single SG ticket.

Required flow:
1. Move ticket to **In Progress** on the ShieldGuard Kanban board.
2. Create one branch per ticket.
3. Keep PR scope aligned to ticket acceptance criteria.
4. Link ticket in PR and include test evidence.

## 3. Branch naming

Contributor branches must follow:
- `feature/SG-XXXX-short-description`

Examples:
- `feature/SG-0008-observability-deltas`
- `feature/SG-0010-pr-template-checklist`

Automation branches may use a different approved prefix, but contributor work should stay on `feature/SG-*`.

## 4. Development standards

- Keep tests deterministic and environment-safe.
- Prefer shared setup utilities over copy-paste setup.
- Use concise comments for non-obvious behavior only.
- Never hardcode secrets, tokens, or production URLs.
- Keep each PR narrowly focused.

## 5. Evidence expectations for PR review

Every PR must include:
- linked SG ticket/issue
- clear summary of implemented behavior
- exact commands executed locally
- pass/fail result summary
- diagnostics report paths when relevant (`reports/`)
- known risks and follow-up notes (if any)

Use the repository PR template and fill every section.

## 6. Definition of done

A ticket is complete when:
- acceptance criteria are satisfied
- required tests pass locally and in CI
- docs are updated for behavior/process changes
- PR is reviewed and merged
- ticket is moved to **Done** and closed

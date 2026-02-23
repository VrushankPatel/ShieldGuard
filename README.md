# ShieldGuard

ShieldGuard is an independent Node.js end-to-end automation suite for SHIELD. It validates authentication, token/session lifecycle, and root-to-admin onboarding flows using the deployed REST API contract.

## Scope

This suite currently targets:
- root authentication and refresh token rotation
- root endpoint access control
- society onboarding through root APIs
- admin authentication and protected endpoint access
- OpenAPI-driven billing/payment smoke coverage
- admin refresh token rotation (`/auth/refresh` and `/auth/refresh-token`)
- session invalidation on logout
- session invalidation on password change

## Tech Stack

- Node.js 18+
- Jest (test runner)
- Supertest (HTTP assertions)
- Dotenv (environment loading)

## Project Structure

```text
ShieldGuard/
├── .env.example
├── package.json
├── jest.config.cjs
├── scripts/
│   ├── inspect-containers.cjs
│   ├── run-e2e-with-diagnostics.cjs
│   └── shield-runtime.cjs
├── src/
│   ├── clients/
│   │   └── shieldApiClient.js
│   ├── config/
│   │   └── env.js
│   ├── core/
│   │   ├── abstractApiTest.js
│   │   └── shieldRuntimeManager.js
│   └── utils/
│       ├── containerDiagnostics.js
│       ├── dataFactory.js
│       ├── openApiContract.js
│       ├── polling.js
│       ├── rootAuth.js
│       └── rootCredential.js
└── tests/
    ├── amenities-meeting/
    │   └── amenities-meeting-flows.e2e.test.js
    ├── asset-complaint/
    │   └── asset-complaint-workflows.e2e.test.js
    ├── billing/
    │   └── billing-payments-contract-smoke.e2e.test.js
    ├── auth/
    │   ├── admin-auth-session.e2e.test.js
    │   ├── otp-lockout.e2e.test.js
    │   ├── root-auth.e2e.test.js
    │   └── root-bootstrap-hardening.e2e.test.js
    ├── onboarding/
    │   └── tenant-onboarding.e2e.test.js
    └── visitor/
        └── visitor-gatepass-flows.e2e.test.js
```

## Environment Configuration

1. Copy `.env.example` to `.env`.
2. Adjust URL and runtime values based on your machine.

Important variables:

| Variable | Purpose |
|---|---|
| `SHIELD_BASE_URL` | Proxy URL used by tests (`http://localhost:8080` by default). |
| `SHIELD_AUTOSTART` | Auto-start SHIELD stack if health check fails. |
| `SHIELD_AUTOSTOP` | Auto-stop SHIELD stack after tests only if ShieldGuard started it. |
| `SHIELD_RUN_SCRIPT` | Path to SHIELD `run.sh`. |
| `SHIELD_ENV_FILE` | SHIELD env file path consumed by `run.sh` (`../dev.env` or `../prod.env`). |
| `SHIELD_ROOT_PASSWORD` | Root password. If empty, ShieldGuard reads bootstrap credential file. |
| `SHIELD_ROOT_CREDENTIAL_FILE` | Path to `root-bootstrap-credential.txt`. |
| `SHIELD_ADMIN_EMAIL` | Optional tenant admin email for suites that need tenant-scoped role testing. |
| `SHIELD_ADMIN_PASSWORD` | Optional tenant admin password for strict environments where root onboarding is blocked. |
| `SHIELD_OTP_TEST_CODE` | Optional OTP code override when your environment exposes a fixed test OTP. |
| `SHIELD_LOCAL_POSTGRES_CONTAINER` | Optional explicit postgres container name for SG-0001 local DB helper. |
| `SHIELD_POSTGRES_DB` | DB name used by SG-0001 local DB helper (`shield` by default). |
| `SHIELD_POSTGRES_USER` | DB user used by SG-0001 local DB helper (`shield` by default). |

## How Runtime Boot Works

When tests start:
1. ShieldGuard checks `SHIELD_BASE_URL + SHIELD_HEALTH_PATH`.
2. If healthy, tests run immediately.
3. If not healthy and `SHIELD_AUTOSTART=true`, it runs SHIELD `run.sh` with configured instance/proxy/env values.
4. It polls health until ready or timeout.

Manual commands:

```bash
npm run shield:start
npm run shield:stop
npm run shield:inspect
# requires authenticated gh + GH_PROJECT_NUMBER
node scripts/create-kanban-issues.cjs
```

## Install and Run

```bash
npm install
cp .env.example .env
npm run test:e2e
```

Run raw Jest only (without pre/post container diagnostics):

```bash
npm run test:e2e:raw
```

Run only billing/payment OpenAPI smoke checks:

```bash
npm run test:e2e:billing
```

Run only visitor/gate-pass scenario checks:

```bash
npm run test:e2e:visitor
```

Run auth-focused suites (includes OTP/lockout):

```bash
npm run test:e2e:auth
```

Run only OTP and lockout hardening checks:

```bash
npm run test:e2e:auth-otp-lockout
```

Run only asset/complaint workflow checks:

```bash
npm run test:e2e:asset-complaint
```

Run only amenities and meeting lifecycle checks:

```bash
npm run test:e2e:amenities-meeting
```

## Crash Triage Workflow

If SHIELD becomes unstable during test runs:
1. Run `npm run shield:inspect` to capture container status and logs.
2. Check generated reports under `ShieldGuard/reports/`.
3. Look for restart loops, database auth errors, or startup exceptions.
4. Re-run `npm run test:e2e` after fixing env/runtime mismatch.

`test:e2e` captures diagnostics automatically before and after the suite.

## Test Catalog

### `root-auth.e2e.test.js`

- `rotates root refresh tokens and rejects token reuse`
  - Simulates two refresh operations for root session.
  - Verifies single-use refresh semantics and replay protection.
- `rejects society onboarding for unauthenticated callers`
  - Verifies root-only onboarding endpoint cannot be called without root bearer token.

### `root-bootstrap-hardening.e2e.test.js`

- `resolves bootstrap credential and produces a valid root auth payload`
  - Validates that ShieldGuard can resolve root credentials and obtain root auth tokens.
  - Also validates environment-aware behavior when password rotation is blocked by verification policy.
- `enforces password-change hardening by invalidating stale refresh sessions`
  - Verifies stale refresh invalidation after root password rotation.
  - In environments where verification is intentionally blocked (for example strict production-like settings), asserts actionable verification failure semantics.

### `admin-auth-session.e2e.test.js`

- `allows authenticated admin access to protected user APIs`
  - Verifies admin access token is accepted on `/api/v1/users`.
- `rotates admin refresh token on both refresh endpoints and blocks replay`
  - Uses `/auth/refresh` then `/auth/refresh-token`.
  - Verifies consumed refresh tokens cannot be reused.
- `invalidates refresh sessions on logout`
  - Calls `/auth/logout` and verifies previous refresh token becomes invalid.
- `invalidates older sessions when admin changes password`
  - Calls `/auth/change-password`.
  - Verifies old refresh token fails and old password login fails.
  - Verifies login succeeds with the new password.

### `otp-lockout.e2e.test.js`

- `sends OTP login challenge with stable response shape`
  - Verifies challenge token structure, destination masking behavior, and expiry field presence.
- `verifies OTP success path and rejects challenge replay`
  - Verifies one-time OTP challenge semantics and replay rejection.
  - Supports either `SHIELD_OTP_TEST_CODE` or local Postgres metadata override for deterministic execution.
- `enforces invalid OTP attempt limits and challenge invalidation`
  - Verifies invalid OTP attempts are rejected and challenge is invalidated after max attempts.
- `locks account after failed password attempts and validates recovery path`
  - Verifies lockout after threshold of wrong password attempts and validates recovery login path.

### `tenant-onboarding.e2e.test.js`

- `creates a society and tenant admin via root onboarding`
  - Covers happy-path society onboarding via root APIs.
  - For strict environments where root password rotation verification is intentionally blocked, asserts the onboarding gate (`password change is required`) with actionable failure details.
- `allows onboarded admin login and protected route access in tenant scope`
  - Validates `/users` and `/users/{id}` using newly onboarded admin credentials.
  - In strict verification-gated environments, verifies admin login is rejected because onboarding is blocked.

### `billing-payments-contract-smoke.e2e.test.js`

- `discovers billing/payment smoke endpoints from OpenAPI`
  - Reads SHIELD OpenAPI spec from the SHIELD repository and derives smoke endpoint list.
- `rejects unauthenticated access on protected billing/payment endpoints`
  - Verifies unauthorized requests on discovered endpoints return `401` or `403`.
- `returns contract-aligned responses for root-authenticated billing/payment smoke calls`
  - Verifies root-authenticated smoke calls return expected status and API envelope.
  - Emits endpoint-specific mismatch summaries when status/envelope diverge from contract expectations.

### `visitor-gatepass-flows.e2e.test.js`

- `runs resident-to-security gate workflow with explicit role boundaries`
  - Covers resident pass creation, security-only entry/exit logging, and final pass status transitions.
  - Validates resident cannot log visitor entry while security can.
  - In strict environments where root onboarding is blocked, emits actionable setup guidance for `SHIELD_ADMIN_EMAIL` and `SHIELD_ADMIN_PASSWORD`.
- `blocks unauthenticated visitor pass creation requests`
  - Verifies unauthenticated callers cannot create visitor passes.

### `asset-complaint-workflows.e2e.test.js`

- `creates asset and drives complaint through explicit lifecycle transitions`
  - Covers category and asset creation, complaint registration, assign/resolve/close transitions.
  - Asserts status progression explicitly (`OPEN -> ASSIGNED -> RESOLVED -> CLOSED`).
- `rejects invalid asset references in complaint workflows`
  - Verifies complaint creation with invalid asset IDs is rejected.
  - Verifies missing asset lookup returns `404`.

### `amenities-meeting-flows.e2e.test.js`

- `drives amenity booking lifecycle with approval and availability checks`
  - Creates amenity, books slot, approves booking, validates overlap availability signal, and completes booking.
- `rejects overlapping amenity bookings and missing meeting minutes lookups`
  - Verifies overlapping booking creation is rejected.
  - Verifies minutes lookup is rejected when no minutes exist for a meeting.
- `executes meeting start, minutes publish, approval, and closure flow`
  - Covers meeting status progression (`SCHEDULED -> ONGOING -> COMPLETED`), minutes creation/approval, and reminder lifecycle.

## Notes

- If root credential in `root-bootstrap-credential.txt` is stale, set `SHIELD_ROOT_PASSWORD` in `.env`.
- If your SHIELD stack is already up, keep `SHIELD_AUTOSTART=true` or set it to `false`; both are supported.

# ShieldGuard

ShieldGuard is an independent Node.js end-to-end automation suite for SHIELD. It validates authentication, token/session lifecycle, and root-to-admin onboarding flows using the deployed REST API contract.

## Scope

This suite currently targets:
- root authentication and refresh token rotation
- root endpoint access control
- society onboarding through root APIs
- admin authentication and protected endpoint access
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
│       ├── polling.js
│       ├── rootAuth.js
│       └── rootCredential.js
└── tests/
    └── auth/
        ├── admin-auth-session.e2e.test.js
        └── root-auth.e2e.test.js
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

## Notes

- If root credential in `root-bootstrap-credential.txt` is stale, set `SHIELD_ROOT_PASSWORD` in `.env`.
- If your SHIELD stack is already up, keep `SHIELD_AUTOSTART=true` or set it to `false`; both are supported.

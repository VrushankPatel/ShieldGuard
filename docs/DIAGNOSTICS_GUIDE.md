# ShieldGuard Diagnostics Interpretation Guide

This guide explains the runtime artifacts produced by `npm run test:e2e` when ShieldGuard runs with diagnostics enabled.

## Report Files

ShieldGuard writes reports in `ShieldGuard/reports/` with timestamped names:

- `shield-diagnostics-before-e2e-*.log`
  - Container state before Jest executes.
- `shield-diagnostics-after-e2e-*.log`
  - Container state immediately after Jest completes.
- `shield-diagnostics-delta-e2e-*.log`
  - Before/after comparison containing restart deltas, status changes, and synthesized hints.
- `shield-diagnostics-failure-e2e-*.log`
  - Failure-context snapshot with logs (generated when tests fail or runtime instability is detected).
- `shield-diagnostics-failure-delta-e2e-*.log`
  - Comparison between initial snapshot and failure-context snapshot.

## How to Triage a Failed Run

1. Open the latest `shield-diagnostics-delta-e2e-*.log` first.
2. Check `restartDeltas`:
   - Any `+N` value means a container restarted during the run.
3. Check `statusChanges`:
   - Look for transitions like `Up -> Restarting` or `Up -> Exited`.
4. Check `hints` for known failure signatures:
   - Database auth mismatch
   - DB connection acquisition failures
   - OOM conditions
   - Port conflicts
5. If present, inspect `shield-diagnostics-failure-e2e-*.log` for raw container logs.

## Typical Root Causes and Actions

- `password authentication failed for user`
  - Verify SHIELD env values (`SHIELD_ENV_FILE`, DB credentials) and persisted DB volume state.
- `unable to obtain connection from database`
  - Verify database container health and startup ordering.
- `OutOfMemoryError`
  - Increase container memory limits or reduce parallel load.
- `address already in use`
  - Resolve local port conflicts before rerun.

## Operational Rule

Treat any non-zero `restartDeltas` or unstable container status as runtime instability, even when all test assertions pass.

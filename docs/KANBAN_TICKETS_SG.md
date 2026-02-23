# ShieldGuard Kanban Ticket Drafts

These are the planned GitHub issues to be created and attached to the ShieldGuard Kanban project.

## SG-0001 - Expand Auth E2E Coverage: OTP and Failure Lockout Flows
**Type**: Feature

### Scope
- Add E2E tests for:
  - OTP send/verify success path
  - OTP invalid attempts path
  - lockout behavior after threshold
  - lockout recovery behavior after duration

### Acceptance Criteria
- New tests under `tests/auth/` with shared helpers.
- Positive and negative responses asserted with stable semantics.
- Test data setup/cleanup deterministic.

## SG-0002 - Add Root Account Bootstrap and First-Login Hardening Tests
**Type**: Feature

### Scope
- Validate root bootstrap behavior:
  - generated bootstrap credential path handling
  - first login requires password rotation
  - root token invalidation after password change

### Acceptance Criteria
- Tests cover forced password change and stale token rejection.
- Failure output clearly indicates bootstrap misconfiguration.

## SG-0003 - Build Tenant Onboarding End-to-End Flow Pack
**Type**: Feature

### Scope
- Cover root onboarding of society and admin user lifecycle.
- Validate admin login and initial protected route access.

### Acceptance Criteria
- Assertions verify returned IDs and usable tenant context.
- Tests reusable for multiple environments.

## SG-0004 - Add Payment/Billing API Contract Smoke Suite
**Type**: Feature

### Scope
- Add contract-level E2E smoke for billing/payment routes based on OpenAPI.
- Include auth checks and basic role validation.

### Acceptance Criteria
- Smoke suite runs independently.
- Failures include endpoint and contract mismatch summary.

## SG-0005 - Add Visitor + Gate Pass End-to-End Scenario Suite
**Type**: Feature

### Scope
- Validate visitor registration, pass creation, entry/exit log flows.
- Assert authorization boundaries for resident/security roles.

### Acceptance Criteria
- Real-life scenario sequence captured in test cases.
- Failures provide actionable endpoint-level diagnostics.

## SG-0006 - Add Asset/Complaint Workflow End-to-End Tests
**Type**: Feature

### Scope
- Validate asset creation, complaint creation, assignment, resolution path.
- Include negative checks for missing/invalid assets.

### Acceptance Criteria
- End-to-end scenario tests are deterministic.
- Assertions include status transitions.

## SG-0007 - Add Amenities + Meeting Real-World Flow Suite
**Type**: Feature

### Scope
- Add tests for amenity booking lifecycle and meeting scheduling/minutes flow.
- Assert conflicts/validation rules where applicable.

### Acceptance Criteria
- Scenario coverage includes both success and rejection cases.
- Minimal setup duplication via shared utilities.

## SG-0008 - Add Observability Guardrails to Test Runs
**Type**: Reliability

### Scope
- Strengthen diagnostics capture:
  - container restart count deltas
  - 5xx spike detection
  - request/response correlation IDs in failure output

### Acceptance Criteria
- Diagnostics reports generated automatically on failed runs.
- Documentation includes report interpretation guide.

## SG-0009 - CI Pipeline for ShieldGuard with Artifacts
**Type**: DevOps

### Scope
- Add GitHub Actions workflow for:
  - dependency install
  - test execution
  - diagnostics artifact upload

### Acceptance Criteria
- CI runs on PRs and `master`.
- Failure artifacts downloadable from workflow runs.

## SG-0010 - Contributor Guide and Definition-of-Done Enforcement
**Type**: Documentation/Process

### Scope
- Finalize contributor docs with branch strategy, PR checklist, and ticket workflow.
- Add PR template linking SG tickets and test evidence.

### Acceptance Criteria
- Docs clear for new contributors to start work independently.
- PR template required fields align with review expectations.

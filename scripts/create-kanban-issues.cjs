#!/usr/bin/env node
const { spawnSync } = require('child_process');

const owner = process.env.GH_OWNER || 'VrushankPatel';
const repo = process.env.GH_REPO || 'ShieldGuard';
const projectNumber = process.env.GH_PROJECT_NUMBER;

if (!projectNumber) {
  console.error('Missing GH_PROJECT_NUMBER. Example: GH_PROJECT_NUMBER=3 node scripts/create-kanban-issues.cjs');
  process.exit(1);
}

const tickets = [
  {
    key: 'SG-0001',
    title: 'Expand Auth E2E Coverage: OTP and Failure Lockout Flows',
    body: [
      '## Scope',
      '- Add E2E tests for OTP send/verify success path.',
      '- Add E2E tests for OTP invalid attempts path.',
      '- Validate lockout behavior after threshold and post-lockout recovery.',
      '',
      '## Acceptance Criteria',
      '- Tests added under `tests/auth/` with shared helpers.',
      '- Positive and negative responses asserted with stable semantics.',
      '- Test setup/cleanup deterministic and repeatable.',
      '',
      '## Owner',
      '- Coordinate environment/URL access with Vrushank Patel before execution.'
    ].join('\n')
  },
  {
    key: 'SG-0002',
    title: 'Add Root Account Bootstrap and First-Login Hardening Tests',
    body: [
      '## Scope',
      '- Validate generated bootstrap credential behavior.',
      '- Validate forced first-login password change.',
      '- Validate stale root token invalidation after password change.',
      '',
      '## Acceptance Criteria',
      '- Tests cover full first-run root hardening flow.',
      '- Failures provide clear bootstrap misconfiguration hints.',
      '',
      '## Owner',
      '- Coordinate environment/URL access with Vrushank Patel before execution.'
    ].join('\n')
  },
  {
    key: 'SG-0003',
    title: 'Build Tenant Onboarding End-to-End Flow Pack',
    body: [
      '## Scope',
      '- Cover root onboarding of society and tenant admin.',
      '- Validate admin login and protected route access.',
      '',
      '## Acceptance Criteria',
      '- Assertions verify created IDs and usable tenant context.',
      '- Tests reusable across target environments.',
      '',
      '## Owner',
      '- Coordinate environment/URL access with Vrushank Patel before execution.'
    ].join('\n')
  },
  {
    key: 'SG-0004',
    title: 'Add Payment/Billing API Contract Smoke Suite',
    body: [
      '## Scope',
      '- Add OpenAPI-driven smoke coverage for billing/payment endpoints.',
      '- Validate auth boundaries and key status codes.',
      '',
      '## Acceptance Criteria',
      '- Suite runs independently as billing/payment smoke pack.',
      '- Failures include endpoint + contract mismatch summary.',
      '',
      '## Owner',
      '- Coordinate environment/URL access with Vrushank Patel before execution.'
    ].join('\n')
  },
  {
    key: 'SG-0005',
    title: 'Add Visitor and Gate Pass End-to-End Scenario Suite',
    body: [
      '## Scope',
      '- Validate visitor registration, pass creation, and entry/exit flow.',
      '- Validate role boundaries for resident/security actors.',
      '',
      '## Acceptance Criteria',
      '- End-to-end scenario tests reflect real gate workflows.',
      '- Failures are actionable at endpoint level.',
      '',
      '## Owner',
      '- Coordinate environment/URL access with Vrushank Patel before execution.'
    ].join('\n')
  },
  {
    key: 'SG-0006',
    title: 'Add Asset and Complaint Workflow End-to-End Tests',
    body: [
      '## Scope',
      '- Validate asset creation to complaint lifecycle and resolution.',
      '- Include negative checks for missing/invalid asset references.',
      '',
      '## Acceptance Criteria',
      '- Status transition assertions are explicit and stable.',
      '- Shared utility usage avoids setup duplication.',
      '',
      '## Owner',
      '- Coordinate environment/URL access with Vrushank Patel before execution.'
    ].join('\n')
  },
  {
    key: 'SG-0007',
    title: 'Add Amenities and Meeting Real-World Flow Suite',
    body: [
      '## Scope',
      '- Add amenity booking lifecycle scenarios.',
      '- Add meeting schedule/minutes flow scenarios.',
      '',
      '## Acceptance Criteria',
      '- Includes success + rejection paths.',
      '- Test setup remains deterministic and environment-safe.',
      '',
      '## Owner',
      '- Coordinate environment/URL access with Vrushank Patel before execution.'
    ].join('\n')
  },
  {
    key: 'SG-0008',
    title: 'Add Observability Guardrails to Test Runs',
    body: [
      '## Scope',
      '- Strengthen diagnostics for container restart deltas and failure hints.',
      '- Capture meaningful crash triage artifacts per failed run.',
      '',
      '## Acceptance Criteria',
      '- Diagnostics automatically generated on failed runs.',
      '- Report interpretation guide documented.',
      '',
      '## Owner',
      '- Coordinate environment/URL access with Vrushank Patel before execution.'
    ].join('\n')
  },
  {
    key: 'SG-0009',
    title: 'Set Up GitHub Actions CI with Diagnostics Artifacts',
    body: [
      '## Scope',
      '- Add CI workflow for install, run, and diagnostics artifact upload.',
      '- Ensure workflow is triggered for PR and master branch.',
      '',
      '## Acceptance Criteria',
      '- CI failures publish relevant logs/reports as downloadable artifacts.',
      '- Workflow status clearly gates PR merges.',
      '',
      '## Owner',
      '- Coordinate environment/URL access with Vrushank Patel before execution.'
    ].join('\n')
  },
  {
    key: 'SG-0010',
    title: 'Finalize Contributor Workflow and PR Quality Checklist',
    body: [
      '## Scope',
      '- Add PR template and contributor checklist tied to SG ticket workflow.',
      '- Document branch naming and evidence expectations.',
      '',
      '## Acceptance Criteria',
      '- Contributors can onboard and deliver without ambiguity.',
      '- PR template enforces ticket link + test proof.',
      '',
      '## Owner',
      '- Coordinate environment/URL access with Vrushank Patel before execution.'
    ].join('\n')
  }
];

function runGh(args) {
  const result = spawnSync('gh', args, {
    stdio: 'pipe',
    encoding: 'utf8'
  });

  if (result.status !== 0) {
    const err = result.stderr || result.stdout || 'unknown gh error';
    throw new Error(err.trim());
  }

  return (result.stdout || '').trim();
}

function issueExists(key) {
  const output = runGh([
    'issue',
    'list',
    '--repo',
    `${owner}/${repo}`,
    '--search',
    `${key} in:title`,
    '--state',
    'all',
    '--json',
    'title,url'
  ]);

  const parsed = JSON.parse(output || '[]');
  return parsed.find((item) => item.title && item.title.startsWith(`${key}:`));
}

for (const ticket of tickets) {
  const existing = issueExists(ticket.key);
  let issueUrl;

  if (existing) {
    issueUrl = existing.url;
    console.log(`[skip] ${ticket.key} already exists -> ${issueUrl}`);
  } else {
    issueUrl = runGh([
      'issue',
      'create',
      '--repo',
      `${owner}/${repo}`,
      '--title',
      `${ticket.key}: ${ticket.title}`,
      '--body',
      ticket.body
    ]);
    console.log(`[created] ${ticket.key} -> ${issueUrl}`);
  }

  runGh([
    'project',
    'item-add',
    String(projectNumber),
    '--owner',
    owner,
    '--url',
    issueUrl
  ]);
  console.log(`[project] added ${ticket.key} to project #${projectNumber}`);
}

console.log('Done.');

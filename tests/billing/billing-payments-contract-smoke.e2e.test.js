const { AbstractApiTest } = require('../../src/core/abstractApiTest')
const { ensureRootReady } = require('../../src/utils/rootAuth')
const { discoverBillingPaymentGetSmokePaths, loadOpenApiSpec } = require('../../src/utils/openApiContract')

const ROOT_AUTH_ALLOWED_STATUSES_BY_PATH = {
  '/billing-cycles/current': [200, 404]
}

function allowedRootStatuses(contractPath) {
  return ROOT_AUTH_ALLOWED_STATUSES_BY_PATH[contractPath] || [200]
}

function assertNoContractMismatches(title, mismatches) {
  if (!mismatches.length) {
    return
  }

  const details = mismatches
    .map((item) => `- ${item.method} ${item.path}: expected ${item.expected}, got ${item.actual}`)
    .join('\n')

  throw new Error(`${title}\n${details}`)
}

describe('Billing and payments OpenAPI contract smoke', () => {
  const suite = new AbstractApiTest()
  let rootSession
  let contractSource
  let contractPaths = []

  beforeAll(async () => {
    await suite.setup()
    rootSession = await ensureRootReady(suite.api, suite.config)

    const loaded = loadOpenApiSpec(suite.config.projectDir)
    contractSource = loaded.openApiPath
    contractPaths = discoverBillingPaymentGetSmokePaths(loaded.spec)
  })

  afterAll(async () => {
    await suite.teardown()
  })

  it('discovers billing/payment smoke endpoints from OpenAPI', () => {
    expect(contractSource).toContain('openapi.yml')
    expect(contractPaths.length).toBeGreaterThan(0)
  })

  it('rejects unauthenticated access on protected billing/payment endpoints', async () => {
    const mismatches = []

    for (const contractPath of contractPaths) {
      const response = await suite.api.get(`/api/v1${contractPath}`)
      if (![401, 403].includes(response.status)) {
        mismatches.push({
          method: 'GET',
          path: contractPath,
          expected: '401 or 403',
          actual: response.status
        })
      }
    }

    assertNoContractMismatches('Billing/payment auth boundary mismatches', mismatches)
  })

  it('returns contract-aligned responses for root-authenticated billing/payment smoke calls', async () => {
    const mismatches = []

    for (const contractPath of contractPaths) {
      const response = await suite.api.get(`/api/v1${contractPath}`, rootSession.accessToken)
      const allowedStatuses = allowedRootStatuses(contractPath)
      if (!allowedStatuses.includes(response.status)) {
        mismatches.push({
          method: 'GET',
          path: contractPath,
          expected: allowedStatuses.join(' or '),
          actual: response.status
        })
        continue
      }

      if (response.status === 200 && response.body?.success !== true) {
        mismatches.push({
          method: 'GET',
          path: contractPath,
          expected: 'response.body.success=true',
          actual: `response.body.success=${response.body?.success}`
        })
      }
    }

    assertNoContractMismatches('Billing/payment contract mismatches', mismatches)
  })
})

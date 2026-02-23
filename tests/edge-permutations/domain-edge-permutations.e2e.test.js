const { randomSuffix } = require('../../src/utils/dataFactory')
const { AbstractApiTest } = require('../../src/core/abstractApiTest')
const { createUnit } = require('../../src/utils/onboarding')
const {
  ensureExpectedStatus,
  resolveAdminSession,
  skipIfSetupBlocked,
  createRoleSessions
} = require('../../src/utils/flowHarness')

const UNKNOWN_UUID = '11111111-1111-1111-1111-111111111111'

describe('Cross-domain negative and edge permutations', () => {
  const suite = new AbstractApiTest()
  const context = {
    setupBlockedReason: null
  }

  beforeAll(async () => {
    await suite.setup()
    await resolveAdminSession(suite, context, 'SG-0013 edge permutations')
    if (context.setupBlockedReason) {
      return
    }

    context.unit = await createUnit(suite.api, context.adminSession.accessToken, {
      block: 'EDG',
      unitNumber: `EG-${randomSuffix().slice(-4)}`
    })

    const roleBootstrap = await createRoleSessions(suite, context.adminSession.accessToken, context.unit.id)
    context.sessions = {
      ADMIN: context.adminSession,
      ...roleBootstrap.sessions
    }
    context.users = roleBootstrap.users

    const suffix = randomSuffix().replace(/[^0-9]/g, '')
    const currentYear = new Date().getUTCFullYear()

    const categoryResponse = await suite.api.post(
      '/api/v1/marketplace-categories',
      {
        categoryName: `Edge Category ${suffix}`,
        description: 'Edge tests category'
      },
      context.adminSession.accessToken
    )
    ensureExpectedStatus(categoryResponse, [200], 'POST', '/api/v1/marketplace-categories')
    context.marketplaceCategoryId = categoryResponse.body.data.id

    const ownerListingResponse = await suite.api.post(
      '/api/v1/marketplace-listings',
      {
        categoryId: context.marketplaceCategoryId,
        listingType: 'SELL',
        title: `Owner Listing ${suffix}`,
        description: 'Listing for ownership validation',
        price: 1200,
        negotiable: true,
        images: 'https://img.shieldguard.test/owner-listing.jpg',
        unitId: context.unit.id
      },
      context.sessions.OWNER.accessToken
    )
    ensureExpectedStatus(ownerListingResponse, [200], 'POST', '/api/v1/marketplace-listings')
    context.ownerListingId = ownerListingResponse.body.data.id

    const documentCategoryResponse = await suite.api.post(
      '/api/v1/document-categories',
      {
        categoryName: `Edge Docs ${suffix}`,
        description: 'Edge test docs category',
        parentCategoryId: null
      },
      context.adminSession.accessToken
    )
    ensureExpectedStatus(documentCategoryResponse, [200], 'POST', '/api/v1/document-categories')
    context.documentCategoryId = documentCategoryResponse.body.data.id

    const seededStaffResponse = await suite.api.post(
      '/api/v1/staff',
      {
        employeeId: `EDG-${suffix.slice(-4)}`,
        firstName: 'Edge',
        lastName: 'Staff',
        phone: '+919933224411',
        email: `edge.staff.${suffix}@shieldguard.test`,
        designation: 'SECURITY_GUARD',
        dateOfJoining: `${currentYear}-01-10`,
        employmentType: 'FULL_TIME',
        basicSalary: 17000,
        active: true
      },
      context.adminSession.accessToken
    )
    ensureExpectedStatus(seededStaffResponse, [200], 'POST', '/api/v1/staff')
    context.seededStaffId = seededStaffResponse.body.data.id
  })

  afterAll(async () => {
    await suite.teardown()
  })

  it('covers validation failures, forbidden paths, and missing-resource permutations', async () => {
    if (skipIfSetupBlocked(context)) {
      return
    }

    const currentYear = new Date().getUTCFullYear()
    const longConfigKey = `key-${'x'.repeat(130)}`
    const suffix = randomSuffix().replace(/[^0-9]/g, '')

    const cases = [
      {
        name: 'Accounting: blank account head name rejected',
        exec: () =>
          suite.api.post(
            '/api/v1/account-heads',
            { headName: '', headType: 'EXPENSE' },
            context.sessions.ADMIN.accessToken
          ),
        expected: [400]
      },
      {
        name: 'Accounting: malformed UUID rejected on account head lookup',
        exec: () => suite.api.get('/api/v1/account-heads/not-a-uuid', context.sessions.ADMIN.accessToken),
        expected: [400]
      },
      {
        name: 'Staff: negative salary rejected',
        exec: () =>
          suite.api.post(
            '/api/v1/staff',
            {
              employeeId: `NEG-${suffix.slice(-4)}`,
              firstName: 'Neg',
              lastName: 'Salary',
              phone: '+919900111222',
              email: `neg.salary.${suffix}@shieldguard.test`,
              designation: 'MANAGER',
              dateOfJoining: `${currentYear}-01-01`,
              employmentType: 'FULL_TIME',
              basicSalary: -1,
              active: true
            },
            context.sessions.ADMIN.accessToken
          ),
        expected: [400]
      },
      {
        name: 'Payroll: invalid month rejected',
        exec: () =>
          suite.api.post(
            '/api/v1/payroll/generate',
            {
              staffId: context.seededStaffId,
              month: 13,
              year: currentYear,
              workingDays: 26,
              totalDeductions: 0
            },
            context.sessions.ADMIN.accessToken
          ),
        expected: [400]
      },
      {
        name: 'Payroll: unknown staff rejected',
        exec: () =>
          suite.api.post(
            '/api/v1/payroll/generate',
            {
              staffId: UNKNOWN_UUID,
              month: 8,
              year: currentYear,
              workingDays: 26,
              totalDeductions: 0
            },
            context.sessions.ADMIN.accessToken
          ),
        expected: [404]
      },
      {
        name: 'Utility: negative tank capacity rejected',
        exec: () =>
          suite.api.post(
            '/api/v1/water-tanks',
            {
              tankName: `Bad Tank ${suffix}`,
              tankType: 'OVERHEAD',
              capacity: -10,
              location: 'Edge block'
            },
            context.sessions.ADMIN.accessToken
          ),
        expected: [400]
      },
      {
        name: 'Utility: unknown tank water log rejected',
        exec: () =>
          suite.api.post(
            '/api/v1/water-level-logs',
            {
              tankId: UNKNOWN_UUID,
              levelPercentage: 55.5,
              volume: 1000
            },
            context.sessions.ADMIN.accessToken
          ),
        expected: [404]
      },
      {
        name: 'Marketplace: blank title rejected',
        exec: () =>
          suite.api.post(
            '/api/v1/marketplace-listings',
            {
              categoryId: context.marketplaceCategoryId,
              listingType: 'SELL',
              title: '',
              description: 'Invalid listing',
              price: 1000,
              negotiable: true,
              images: 'https://img.shieldguard.test/x.jpg',
              unitId: context.unit.id
            },
            context.sessions.OWNER.accessToken
          ),
        expected: [400]
      },
      {
        name: 'Marketplace: non-owner cannot mark listing sold',
        exec: () =>
          suite.api.post(
            `/api/v1/marketplace-listings/${context.ownerListingId}/mark-sold`,
            {},
            context.sessions.TENANT.accessToken
          ),
        expected: [401, 403]
      },
      {
        name: 'Documents: blank file URL rejected',
        exec: () =>
          suite.api.post(
            '/api/v1/documents',
            {
              documentName: `BadDoc-${suffix}.pdf`,
              categoryId: context.documentCategoryId,
              documentType: 'PDF',
              fileUrl: '',
              fileSize: 512,
              description: 'Missing URL',
              versionLabel: 'v1',
              publicAccess: false,
              expiryDate: null,
              tags: 'bad'
            },
            context.sessions.ADMIN.accessToken
          ),
        expected: [400]
      },
      {
        name: 'Documents: unknown document returns not found',
        exec: () => suite.api.get(`/api/v1/documents/${UNKNOWN_UUID}`, context.sessions.ADMIN.accessToken),
        expected: [404]
      },
      {
        name: 'Files: invalid presigned URL expiry rejected',
        exec: () =>
          suite.api.post(
            '/api/v1/files/generate-presigned-url',
            {
              fileName: `bad-expiry-${suffix}.txt`,
              contentType: 'text/plain',
              expiresInMinutes: 0
            },
            context.sessions.ADMIN.accessToken
          ),
        expected: [400]
      },
      {
        name: 'Notifications: invalid email recipient rejected',
        exec: () =>
          suite.api.post(
            '/api/v1/notifications/send',
            {
              recipients: ['not-an-email'],
              subject: 'Invalid notification',
              body: 'Invalid email should fail'
            },
            context.sessions.ADMIN.accessToken
          ),
        expected: [400]
      },
      {
        name: 'Notifications: unknown notification mark-read not found',
        exec: () =>
          suite.api.post(
            `/api/v1/notifications/${UNKNOWN_UUID}/mark-read`,
            {},
            context.sessions.ADMIN.accessToken
          ),
        expected: [404]
      },
      {
        name: 'Config: oversized key rejected',
        exec: () =>
          suite.api.put(
            `/api/v1/config/${longConfigKey}`,
            {
              value: '1',
              category: 'edge'
            },
            context.sessions.ADMIN.accessToken
          ),
        expected: [400]
      },
      {
        name: 'Settings: committee cannot toggle modules',
        exec: () =>
          suite.api.put(
            '/api/v1/settings/modules/marketplace/toggle',
            { enabled: false },
            context.sessions.COMMITTEE.accessToken
          ),
        expected: [403]
      },
      {
        name: 'Analytics: blank report type rejected',
        exec: () =>
          suite.api.post(
            '/api/v1/report-templates',
            {
              templateName: `BadTemplate-${suffix}`,
              reportType: '',
              description: 'Should fail',
              queryTemplate: '',
              parametersJson: '{}',
              systemTemplate: false
            },
            context.sessions.ADMIN.accessToken
          ),
        expected: [400]
      },
      {
        name: 'Analytics: execute unknown template not found',
        exec: () =>
          suite.api.post(
            `/api/v1/report-templates/${UNKNOWN_UUID}/execute`,
            {},
            context.sessions.ADMIN.accessToken
          ),
        expected: [404]
      },
      {
        name: 'Analytics: unauthenticated metrics endpoint blocked',
        exec: () => suite.api.get('/api/v1/analytics/collection-efficiency'),
        expected: [401, 403]
      }
    ]

    for (const testCase of cases) {
      const response = await testCase.exec()
      ensureExpectedStatus(response, testCase.expected, 'EDGE', testCase.name)
    }
  })
})

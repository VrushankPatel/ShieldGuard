const { randomSuffix } = require('../../src/utils/dataFactory')
const { AbstractApiTest } = require('../../src/core/abstractApiTest')
const { createUnit } = require('../../src/utils/onboarding')
const {
  ensureExpectedStatus,
  resolveAdminSession,
  skipIfSetupBlocked,
  createRoleSessions
} = require('../../src/utils/flowHarness')

const ROLES = ['ADMIN', 'COMMITTEE', 'SECURITY', 'OWNER', 'TENANT']

function callEndpoint(api, method, path, body, accessToken) {
  if (method === 'GET') {
    return api.get(path, accessToken)
  }
  if (method === 'POST') {
    return api.post(path, body || {}, accessToken)
  }
  if (method === 'PUT') {
    return api.put(path, body || {}, accessToken)
  }
  throw new Error(`Unsupported method ${method}`)
}

describe('Role-permission matrix across core business domains', () => {
  const suite = new AbstractApiTest()
  const context = {
    setupBlockedReason: null,
    sessions: {},
    users: {},
    seeds: {}
  }

  beforeAll(async () => {
    await suite.setup()
    await resolveAdminSession(suite, context, 'SG-0013 role matrix')
    if (context.setupBlockedReason) {
      return
    }

    context.sessions.ADMIN = context.adminSession

    context.unit = await createUnit(suite.api, context.adminSession.accessToken, {
      block: 'RLM',
      unitNumber: `RM-${randomSuffix().slice(-4)}`
    })

    const roleBootstrap = await createRoleSessions(suite, context.adminSession.accessToken, context.unit.id)
    for (const [role, session] of Object.entries(roleBootstrap.sessions)) {
      context.sessions[role] = session
    }
    for (const [role, user] of Object.entries(roleBootstrap.users)) {
      context.users[role] = user
    }

    const suffix = randomSuffix().replace(/[^0-9]/g, '')
    const currentYear = new Date().getUTCFullYear()

    const seedStaffResponse = await suite.api.post(
      '/api/v1/staff',
      {
        employeeId: `RM-ST-${suffix.slice(-4)}`,
        firstName: 'Matrix',
        lastName: 'Staff',
        phone: '+919999111122',
        email: `matrix.staff.${suffix}@shieldguard.test`,
        designation: 'MANAGER',
        dateOfJoining: `${currentYear}-01-01`,
        employmentType: 'FULL_TIME',
        basicSalary: 25000,
        active: true
      },
      context.adminSession.accessToken
    )
    ensureExpectedStatus(seedStaffResponse, [200], 'POST', '/api/v1/staff')
    context.seeds.staffId = seedStaffResponse.body.data.id

    const seedDocumentCategoryResponse = await suite.api.post(
      '/api/v1/document-categories',
      {
        categoryName: `Role Matrix Docs ${suffix}`,
        description: 'Role matrix seeded document category',
        parentCategoryId: null
      },
      context.adminSession.accessToken
    )
    ensureExpectedStatus(seedDocumentCategoryResponse, [200], 'POST', '/api/v1/document-categories')
    context.seeds.documentCategoryId = seedDocumentCategoryResponse.body.data.id
    context.seeds.suffix = suffix
  })

  afterAll(async () => {
    await suite.teardown()
  })

  it('enforces expected permissions for each role and unauthenticated callers', async () => {
    if (skipIfSetupBlocked(context)) {
      return
    }

    const currentYear = new Date().getUTCFullYear()

    const entries = [
      {
        key: 'accountHeadCreate',
        domain: 'Accounting/Treasury',
        method: 'POST',
        path: '/api/v1/account-heads',
        allowedRoles: ['ADMIN', 'COMMITTEE'],
        body: (role) => ({
          headName: `RM Account Head ${context.seeds.suffix}-${role}`,
          headType: 'EXPENSE'
        })
      },
      {
        key: 'accountHeadList',
        domain: 'Accounting/Treasury',
        method: 'GET',
        path: '/api/v1/account-heads?page=0&size=5',
        allowedRoles: ['ADMIN', 'COMMITTEE', 'SECURITY', 'OWNER', 'TENANT']
      },
      {
        key: 'staffCreate',
        domain: 'Staff/Payroll',
        method: 'POST',
        path: '/api/v1/staff',
        allowedRoles: ['ADMIN', 'COMMITTEE'],
        body: (role) => ({
          employeeId: `RM-${role}-${context.seeds.suffix.slice(-4)}`,
          firstName: 'Role',
          lastName: `Staff${role}`,
          phone: `+9188${context.seeds.suffix.slice(-8)}`,
          email: `rm.staff.${role.toLowerCase()}.${context.seeds.suffix}@shieldguard.test`,
          designation: 'SECURITY_GUARD',
          dateOfJoining: `${currentYear}-01-01`,
          employmentType: 'FULL_TIME',
          basicSalary: 18000,
          active: true
        })
      },
      {
        key: 'payrollGenerate',
        domain: 'Staff/Payroll',
        method: 'POST',
        path: '/api/v1/payroll/generate',
        allowedRoles: ['ADMIN', 'COMMITTEE'],
        body: (role) => ({
          staffId: context.seeds.staffId,
          month: role === 'ADMIN' ? 6 : 7,
          year: currentYear,
          workingDays: 26,
          totalDeductions: 0
        })
      },
      {
        key: 'waterTankCreate',
        domain: 'Utility Monitoring',
        method: 'POST',
        path: '/api/v1/water-tanks',
        allowedRoles: ['ADMIN', 'COMMITTEE'],
        body: (role) => ({
          tankName: `RM Tank ${context.seeds.suffix}-${role}`,
          tankType: 'OVERHEAD',
          capacity: 50000,
          location: 'Role Matrix Block'
        })
      },
      {
        key: 'waterTankList',
        domain: 'Utility Monitoring',
        method: 'GET',
        path: '/api/v1/water-tanks?page=0&size=5',
        allowedRoles: ['ADMIN', 'COMMITTEE', 'SECURITY', 'OWNER', 'TENANT']
      },
      {
        key: 'marketplaceCategoryCreate',
        domain: 'Marketplace',
        method: 'POST',
        path: '/api/v1/marketplace-categories',
        allowedRoles: ['ADMIN', 'COMMITTEE'],
        body: (role) => ({
          categoryName: `RM Category ${context.seeds.suffix}-${role}`,
          description: 'Role matrix marketplace category'
        })
      },
      {
        key: 'marketplaceListingCreate',
        domain: 'Marketplace',
        method: 'POST',
        path: '/api/v1/marketplace-listings',
        allowedRoles: ['ADMIN', 'COMMITTEE', 'SECURITY', 'OWNER', 'TENANT'],
        body: (role) => ({
          categoryId: null,
          listingType: 'SELL',
          title: `RM Listing ${context.seeds.suffix}-${role}`,
          description: 'Role matrix listing',
          price: 1000,
          negotiable: true,
          images: 'https://img.shieldguard.test/rm.jpg',
          unitId: context.unit.id
        })
      },
      {
        key: 'documentCategoryCreate',
        domain: 'Documents/Files',
        method: 'POST',
        path: '/api/v1/document-categories',
        allowedRoles: ['ADMIN', 'COMMITTEE'],
        body: (role) => ({
          categoryName: `RM DocCat ${context.seeds.suffix}-${role}`,
          description: 'Role matrix document category',
          parentCategoryId: null
        })
      },
      {
        key: 'documentCreate',
        domain: 'Documents/Files',
        method: 'POST',
        path: '/api/v1/documents',
        allowedRoles: ['ADMIN', 'COMMITTEE'],
        body: (role) => ({
          documentName: `RM-Doc-${context.seeds.suffix}-${role}.pdf`,
          categoryId: context.seeds.documentCategoryId,
          documentType: 'PDF',
          fileUrl: `https://files.shieldguard.test/rm-doc-${context.seeds.suffix}-${role}.pdf`,
          fileSize: 1024,
          description: 'Role matrix document',
          versionLabel: 'v1',
          publicAccess: false,
          expiryDate: null,
          tags: 'role,matrix'
        })
      },
      {
        key: 'filePresignedUrlGenerate',
        domain: 'Documents/Files',
        method: 'POST',
        path: '/api/v1/files/generate-presigned-url',
        allowedRoles: ['ADMIN', 'COMMITTEE', 'SECURITY'],
        body: (role) => ({
          fileName: `rm-${context.seeds.suffix}-${role}.txt`,
          contentType: 'text/plain',
          expiresInMinutes: 10
        })
      },
      {
        key: 'notificationSend',
        domain: 'Notifications',
        method: 'POST',
        path: '/api/v1/notifications/send',
        allowedRoles: ['ADMIN', 'COMMITTEE'],
        body: () => ({
          recipients: [context.users.OWNER.email],
          subject: 'Role matrix notification',
          body: 'Permission matrix probe'
        })
      },
      {
        key: 'notificationList',
        domain: 'Notifications',
        method: 'GET',
        path: '/api/v1/notifications?page=0&size=5',
        allowedRoles: ['ADMIN', 'COMMITTEE', 'SECURITY', 'OWNER', 'TENANT']
      },
      {
        key: 'tenantConfigList',
        domain: 'Config/Settings',
        method: 'GET',
        path: '/api/v1/config?page=0&size=5',
        allowedRoles: ['ADMIN', 'COMMITTEE']
      },
      {
        key: 'settingsModuleToggle',
        domain: 'Config/Settings',
        method: 'PUT',
        path: '/api/v1/settings/modules/marketplace/toggle',
        allowedRoles: ['ADMIN'],
        body: () => ({
          enabled: true
        })
      },
      {
        key: 'reportTemplateCreate',
        domain: 'Analytics/Reports',
        method: 'POST',
        path: '/api/v1/report-templates',
        allowedRoles: ['ADMIN', 'COMMITTEE'],
        body: (role) => ({
          templateName: `RM Template ${context.seeds.suffix}-${role}`,
          reportType: 'COLLECTION_EFFICIENCY',
          description: 'Role matrix template',
          queryTemplate: '',
          parametersJson: '{}',
          systemTemplate: false
        })
      },
      {
        key: 'analyticsCollectionEfficiency',
        domain: 'Analytics/Reports',
        method: 'GET',
        path: '/api/v1/analytics/collection-efficiency',
        allowedRoles: ['ADMIN', 'COMMITTEE']
      }
    ]

    for (const entry of entries) {
      for (const role of ROLES) {
        const token = context.sessions[role]?.accessToken
        const body = entry.body ? entry.body(role) : undefined
        const response = await callEndpoint(suite.api, entry.method, entry.path, body, token)

        if (entry.allowedRoles.includes(role)) {
          ensureExpectedStatus(response, [200], `${entry.method} ${entry.key}`, `${entry.domain} (${role})`)
          if (response.status === 200) {
            expect(response.body.success).toBe(true)
          }
        } else {
          ensureExpectedStatus(response, [401, 403], `${entry.method} ${entry.key}`, `${entry.domain} (${role})`)
        }
      }

      const unauthBody = entry.body ? entry.body('UNAUTH') : undefined
      const unauthResponse = await callEndpoint(suite.api, entry.method, entry.path, unauthBody)
      ensureExpectedStatus(unauthResponse, [401, 403], `${entry.method} ${entry.key}`, `${entry.domain} (UNAUTH)`)
    }
  })
})

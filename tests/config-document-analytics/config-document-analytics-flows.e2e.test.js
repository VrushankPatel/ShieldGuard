const { randomSuffix } = require('../../src/utils/dataFactory')
const { AbstractApiTest } = require('../../src/core/abstractApiTest')
const { createUnit } = require('../../src/utils/onboarding')
const {
  ensureExpectedStatus,
  resolveAdminSession,
  skipIfSetupBlocked
} = require('../../src/utils/flowHarness')

describe('Config, document, and analytics real-world flow scenarios', () => {
  const suite = new AbstractApiTest()
  const context = {
    setupBlockedReason: null
  }

  beforeAll(async () => {
    await suite.setup()
    await resolveAdminSession(suite, context, 'SG-0012 config-document-analytics flow')

    if (context.setupBlockedReason) {
      return
    }

    context.unit = await createUnit(suite.api, context.adminSession.accessToken, {
      block: 'CFG',
      unitNumber: `CF-${randomSuffix().slice(-4)}`
    })
  })

  afterAll(async () => {
    await suite.teardown()
  })

  it('drives tenant config, module settings, and document repository lifecycle', async () => {
    if (skipIfSetupBlocked(context)) {
      return
    }

    const suffix = randomSuffix().replace(/[^0-9]/g, '')
    const configKey = `visitor.daily.limit.${suffix}`

    const upsertConfigResponse = await suite.api.put(
      `/api/v1/config/${configKey}`,
      {
        value: '15',
        category: 'security'
      },
      context.adminSession.accessToken
    )
    ensureExpectedStatus(upsertConfigResponse, [200], 'PUT', '/api/v1/config/{key}')
    expect(upsertConfigResponse.body.data.key).toBe(configKey)

    const getConfigResponse = await suite.api.get(`/api/v1/config/${configKey}`, context.adminSession.accessToken)
    ensureExpectedStatus(getConfigResponse, [200], 'GET', '/api/v1/config/{key}')
    expect(getConfigResponse.body.data.value).toBe('15')

    const bulkConfigResponse = await suite.api.post(
      '/api/v1/config/bulk-update',
      {
        entries: [
          {
            key: `amenity.max.bookings.${suffix}`,
            value: '3',
            category: 'amenities'
          },
          {
            key: `parking.visitor.allowed.${suffix}`,
            value: 'true',
            category: 'security'
          }
        ]
      },
      context.adminSession.accessToken
    )
    ensureExpectedStatus(bulkConfigResponse, [200], 'POST', '/api/v1/config/bulk-update')
    expect((bulkConfigResponse.body.data || []).length).toBe(2)

    const configByCategoryResponse = await suite.api.get(
      '/api/v1/config/category/security?page=0&size=20',
      context.adminSession.accessToken
    )
    ensureExpectedStatus(configByCategoryResponse, [200], 'GET', '/api/v1/config/category/{category}')
    expect((configByCategoryResponse.body.data?.content || []).length).toBeGreaterThanOrEqual(2)

    const moduleToggleOffResponse = await suite.api.put(
      '/api/v1/settings/modules/marketplace/toggle',
      {
        enabled: false
      },
      context.adminSession.accessToken
    )
    ensureExpectedStatus(moduleToggleOffResponse, [200], 'PUT', '/api/v1/settings/modules/{module}/toggle')
    expect(moduleToggleOffResponse.body.data.enabled).toBe(false)

    const listModulesResponse = await suite.api.get('/api/v1/settings/modules', context.adminSession.accessToken)
    ensureExpectedStatus(listModulesResponse, [200], 'GET', '/api/v1/settings/modules')
    expect((listModulesResponse.body.data || []).length).toBeGreaterThan(0)

    const updateBillingFormulaResponse = await suite.api.put(
      '/api/v1/settings/billing-formula',
      {
        value: {
          method: 'HYBRID',
          fixedShare: 0.4
        }
      },
      context.adminSession.accessToken
    )
    ensureExpectedStatus(updateBillingFormulaResponse, [200], 'PUT', '/api/v1/settings/billing-formula')
    expect(updateBillingFormulaResponse.body.data.value.method).toBe('HYBRID')

    const getBillingFormulaResponse = await suite.api.get('/api/v1/settings/billing-formula', context.adminSession.accessToken)
    ensureExpectedStatus(getBillingFormulaResponse, [200], 'GET', '/api/v1/settings/billing-formula')
    expect(getBillingFormulaResponse.body.data.value.method).toBe('HYBRID')

    const documentCategoryResponse = await suite.api.post(
      '/api/v1/document-categories',
      {
        categoryName: `Bylaws ${suffix}`,
        description: 'Society bylaws and policy docs',
        parentCategoryId: null
      },
      context.adminSession.accessToken
    )
    ensureExpectedStatus(documentCategoryResponse, [200], 'POST', '/api/v1/document-categories')
    const categoryId = documentCategoryResponse.body.data.id

    const documentResponse = await suite.api.post(
      '/api/v1/documents',
      {
        documentName: `Bylaws-${suffix}.pdf`,
        categoryId,
        documentType: 'PDF',
        fileUrl: `https://files.shieldguard.test/docs/bylaws-${suffix}.pdf`,
        fileSize: 102400,
        description: 'Society bylaws document',
        versionLabel: 'v1',
        publicAccess: true,
        expiryDate: null,
        tags: 'bylaws,policy'
      },
      context.adminSession.accessToken
    )
    ensureExpectedStatus(documentResponse, [200], 'POST', '/api/v1/documents')
    const documentId = documentResponse.body.data.id

    const getDocumentResponse = await suite.api.get(`/api/v1/documents/${documentId}`, context.adminSession.accessToken)
    ensureExpectedStatus(getDocumentResponse, [200], 'GET', '/api/v1/documents/{id}')
    expect(getDocumentResponse.body.data.id).toBe(documentId)

    const downloadDocumentResponse = await suite.api.get(
      `/api/v1/documents/${documentId}/download`,
      context.adminSession.accessToken
    )
    ensureExpectedStatus(downloadDocumentResponse, [200], 'GET', '/api/v1/documents/{id}/download')
    expect(downloadDocumentResponse.body.data.downloadUrl).toContain('/api/v1/files/')

    const documentByCategoryResponse = await suite.api.get(
      `/api/v1/documents/category/${categoryId}?page=0&size=10`,
      context.adminSession.accessToken
    )
    ensureExpectedStatus(documentByCategoryResponse, [200], 'GET', '/api/v1/documents/category/{categoryId}')
    const documentIds = (documentByCategoryResponse.body.data?.content || []).map((entry) => entry.id)
    expect(documentIds).toContain(documentId)

    const documentSearchResponse = await suite.api.get(
      `/api/v1/documents/search?q=${encodeURIComponent('Bylaws')}&page=0&size=10`,
      context.adminSession.accessToken
    )
    ensureExpectedStatus(documentSearchResponse, [200], 'GET', '/api/v1/documents/search')

    const documentTagsResponse = await suite.api.get(
      '/api/v1/documents/tags/bylaws?page=0&size=10',
      context.adminSession.accessToken
    )
    ensureExpectedStatus(documentTagsResponse, [200], 'GET', '/api/v1/documents/tags/{tag}')

    const documentAccessLogsResponse = await suite.api.get(
      `/api/v1/documents/${documentId}/access-logs?page=0&size=10`,
      context.adminSession.accessToken
    )
    ensureExpectedStatus(documentAccessLogsResponse, [200], 'GET', '/api/v1/documents/{id}/access-logs')
    expect((documentAccessLogsResponse.body.data?.content || []).length).toBeGreaterThanOrEqual(1)

    const unauthConfigResponse = await suite.api.get('/api/v1/config')
    ensureExpectedStatus(unauthConfigResponse, [401, 403], 'GET', '/api/v1/config')
  })

  it('drives report templates, scheduled reports, dashboards, and analytics endpoints', async () => {
    if (skipIfSetupBlocked(context)) {
      return
    }

    const suffix = randomSuffix().replace(/[^0-9]/g, '')
    const currentYear = new Date().getUTCFullYear()

    const billResponse = await suite.api.post(
      '/api/v1/billing/generate',
      {
        unitId: context.unit.id,
        month: 2,
        year: currentYear,
        amount: 1000,
        dueDate: `${currentYear}-02-28`,
        lateFee: 50
      },
      context.adminSession.accessToken
    )
    ensureExpectedStatus(billResponse, [200], 'POST', '/api/v1/billing/generate')
    const billId = billResponse.body.data.id

    const paymentResponse = await suite.api.post(
      '/api/v1/payments',
      {
        billId,
        amount: 700,
        mode: 'UPI',
        transactionRef: `TXN-${suffix}`
      },
      context.adminSession.accessToken
    )
    ensureExpectedStatus(paymentResponse, [200], 'POST', '/api/v1/payments')

    const ledgerExpenseResponse = await suite.api.post(
      '/api/v1/ledger',
      {
        type: 'EXPENSE',
        category: 'MAINTENANCE',
        amount: 300,
        reference: `LED-${suffix}`,
        description: 'Pipe replacement',
        entryDate: `${currentYear}-02-17`
      },
      context.adminSession.accessToken
    )
    ensureExpectedStatus(ledgerExpenseResponse, [200], 'POST', '/api/v1/ledger')

    const visitorPassResponse = await suite.api.post(
      '/api/v1/visitors/pass',
      {
        unitId: context.unit.id,
        visitorName: `Courier ${suffix}`,
        vehicleNumber: `MH01AB${suffix.slice(-4)}`,
        validFrom: `${currentYear}-02-17T09:00:00Z`,
        validTo: `${currentYear}-02-17T12:00:00Z`
      },
      context.adminSession.accessToken
    )
    ensureExpectedStatus(visitorPassResponse, [200], 'POST', '/api/v1/visitors/pass')

    const staffResponse = await suite.api.post(
      '/api/v1/staff',
      {
        employeeId: `AN-${suffix.slice(-5)}`,
        firstName: 'Rohit',
        lastName: 'Guard',
        phone: `+9177${suffix.slice(-8)}`,
        email: `analytics.staff.${suffix}@shieldguard.test`,
        designation: 'SECURITY_GUARD',
        dateOfJoining: `${currentYear}-01-01`,
        employmentType: 'FULL_TIME',
        basicSalary: 18000,
        active: true
      },
      context.adminSession.accessToken
    )
    ensureExpectedStatus(staffResponse, [200], 'POST', '/api/v1/staff')
    const staffId = staffResponse.body.data.id

    const attendanceCheckInResponse = await suite.api.post(
      '/api/v1/staff-attendance/check-in',
      {
        staffId,
        attendanceDate: `${currentYear}-02-17`
      },
      context.adminSession.accessToken
    )
    ensureExpectedStatus(attendanceCheckInResponse, [200], 'POST', '/api/v1/staff-attendance/check-in')

    const reportTemplateResponse = await suite.api.post(
      '/api/v1/report-templates',
      {
        templateName: `Collection KPI ${suffix}`,
        reportType: 'COLLECTION_EFFICIENCY',
        description: 'Tracks billed versus collected amount',
        queryTemplate: '',
        parametersJson: '{}',
        systemTemplate: false
      },
      context.adminSession.accessToken
    )
    ensureExpectedStatus(reportTemplateResponse, [200], 'POST', '/api/v1/report-templates')
    const templateId = reportTemplateResponse.body.data.id

    const executeTemplateResponse = await suite.api.post(
      `/api/v1/report-templates/${templateId}/execute`,
      {},
      context.adminSession.accessToken
    )
    ensureExpectedStatus(executeTemplateResponse, [200], 'POST', '/api/v1/report-templates/{id}/execute')
    expect(executeTemplateResponse.body.data.reportType).toBe('COLLECTION_EFFICIENCY')

    const scheduledReportResponse = await suite.api.post(
      '/api/v1/scheduled-reports',
      {
        templateId,
        reportName: `Nightly KPI ${suffix}`,
        frequency: 'DAILY',
        recipients: 'committee@shieldguard.test',
        active: true
      },
      context.adminSession.accessToken
    )
    ensureExpectedStatus(scheduledReportResponse, [200], 'POST', '/api/v1/scheduled-reports')
    const scheduledReportId = scheduledReportResponse.body.data.id

    const sendNowResponse = await suite.api.post(
      `/api/v1/scheduled-reports/${scheduledReportId}/send-now`,
      {},
      context.adminSession.accessToken
    )
    ensureExpectedStatus(sendNowResponse, [200], 'POST', '/api/v1/scheduled-reports/{id}/send-now')
    expect(sendNowResponse.body.data.lastGeneratedAt).toBeTruthy()

    const dashboardResponse = await suite.api.post(
      '/api/v1/analytics-dashboards',
      {
        dashboardName: `Committee Dashboard ${suffix}`,
        dashboardType: 'COMMITTEE',
        widgetsJson: '{"widgets":["collection","expenses"]}',
        defaultDashboard: true
      },
      context.adminSession.accessToken
    )
    ensureExpectedStatus(dashboardResponse, [200], 'POST', '/api/v1/analytics-dashboards')
    const dashboardId = dashboardResponse.body.data.id

    const setDefaultResponse = await suite.api.post(
      `/api/v1/analytics-dashboards/${dashboardId}/set-default`,
      {},
      context.adminSession.accessToken
    )
    ensureExpectedStatus(setDefaultResponse, [200], 'POST', '/api/v1/analytics-dashboards/{id}/set-default')
    expect(setDefaultResponse.body.data.defaultDashboard).toBe(true)

    const collectionEfficiencyResponse = await suite.api.get(
      '/api/v1/analytics/collection-efficiency',
      context.adminSession.accessToken
    )
    ensureExpectedStatus(collectionEfficiencyResponse, [200], 'GET', '/api/v1/analytics/collection-efficiency')
    expect(collectionEfficiencyResponse.body.data.billedAmount).toBeGreaterThanOrEqual(1000)

    const expenseDistributionResponse = await suite.api.get(
      '/api/v1/analytics/expense-distribution',
      context.adminSession.accessToken
    )
    ensureExpectedStatus(expenseDistributionResponse, [200], 'GET', '/api/v1/analytics/expense-distribution')
    expect((expenseDistributionResponse.body.data || []).length).toBeGreaterThanOrEqual(1)

    const staffSummaryResponse = await suite.api.get(
      '/api/v1/analytics/staff-attendance-summary',
      context.adminSession.accessToken
    )
    ensureExpectedStatus(staffSummaryResponse, [200], 'GET', '/api/v1/analytics/staff-attendance-summary')
    expect(staffSummaryResponse.body.data.totalStaff).toBeGreaterThanOrEqual(1)

    const visitorTrendsResponse = await suite.api.get('/api/v1/analytics/visitor-trends', context.adminSession.accessToken)
    ensureExpectedStatus(visitorTrendsResponse, [200], 'GET', '/api/v1/analytics/visitor-trends')
    expect((visitorTrendsResponse.body.data || []).length).toBeGreaterThanOrEqual(1)

    const unauthTemplateCreateResponse = await suite.api.post('/api/v1/report-templates', {
      templateName: `Unauthorized ${suffix}`,
      reportType: 'COLLECTION_EFFICIENCY',
      description: 'Should fail without auth',
      queryTemplate: '',
      parametersJson: '{}',
      systemTemplate: false
    })
    ensureExpectedStatus(unauthTemplateCreateResponse, [401, 403], 'POST', '/api/v1/report-templates')
  })
})

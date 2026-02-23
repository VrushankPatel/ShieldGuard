const { randomSuffix } = require('../../src/utils/dataFactory')
const { AbstractApiTest } = require('../../src/core/abstractApiTest')
const {
  ensureExpectedStatus,
  resolveAdminSession,
  skipIfSetupBlocked
} = require('../../src/utils/flowHarness')

describe('Accounting and treasury real-world flow scenarios', () => {
  const suite = new AbstractApiTest()
  const context = {
    setupBlockedReason: null
  }

  beforeAll(async () => {
    await suite.setup()
    await resolveAdminSession(suite, context, 'SG-0012 accounting flow')
  })

  afterAll(async () => {
    await suite.teardown()
  })

  it('drives account heads, funds, ledgers, expenses, and vendor payments lifecycle', async () => {
    if (skipIfSetupBlocked(context)) {
      return
    }

    const suffix = randomSuffix().replace(/[^0-9]/g, '')
    const currentYear = new Date().getUTCFullYear()
    const financialYear = `${currentYear}-${currentYear + 1}`

    const accountHeadExpenseResponse = await suite.api.post(
      '/api/v1/account-heads',
      {
        headName: `Maintenance Expense ${suffix}`,
        headType: 'EXPENSE'
      },
      context.adminSession.accessToken
    )
    ensureExpectedStatus(accountHeadExpenseResponse, [200], 'POST', '/api/v1/account-heads')
    const expenseHeadId = accountHeadExpenseResponse.body.data.id

    const accountHeadIncomeResponse = await suite.api.post(
      '/api/v1/account-heads',
      {
        headName: `Maintenance Income ${suffix}`,
        headType: 'INCOME'
      },
      context.adminSession.accessToken
    )
    ensureExpectedStatus(accountHeadIncomeResponse, [200], 'POST', '/api/v1/account-heads')
    const incomeHeadId = accountHeadIncomeResponse.body.data.id

    const hierarchyResponse = await suite.api.get('/api/v1/account-heads/hierarchy', context.adminSession.accessToken)
    ensureExpectedStatus(hierarchyResponse, [200], 'GET', '/api/v1/account-heads/hierarchy')
    expect((hierarchyResponse.body.data || []).length).toBeGreaterThanOrEqual(2)

    const fundCategoryResponse = await suite.api.post(
      '/api/v1/fund-categories',
      {
        categoryName: `Reserve Fund ${suffix}`,
        description: 'Emergency reserve corpus',
        currentBalance: 50000
      },
      context.adminSession.accessToken
    )
    ensureExpectedStatus(fundCategoryResponse, [200], 'POST', '/api/v1/fund-categories')
    const fundCategoryId = fundCategoryResponse.body.data.id

    const vendorResponse = await suite.api.post(
      '/api/v1/vendors',
      {
        vendorName: `Vendor ${suffix}`,
        contactPerson: 'Raj Vendor',
        phone: '+919988776655',
        email: `vendor.${suffix}@shieldguard.test`,
        vendorType: 'ELECTRICAL'
      },
      context.adminSession.accessToken
    )
    ensureExpectedStatus(vendorResponse, [200], 'POST', '/api/v1/vendors')
    const vendorId = vendorResponse.body.data.id

    const budgetResponse = await suite.api.post(
      '/api/v1/budgets',
      {
        financialYear,
        accountHeadId: expenseHeadId,
        budgetedAmount: 200000
      },
      context.adminSession.accessToken
    )
    ensureExpectedStatus(budgetResponse, [200], 'POST', '/api/v1/budgets')
    expect(budgetResponse.body.data.financialYear).toBe(financialYear)

    const ledgerEntryResponse = await suite.api.post(
      '/api/v1/ledger-entries',
      {
        entryDate: `${currentYear}-02-17`,
        accountHeadId: incomeHeadId,
        fundCategoryId,
        transactionType: 'CREDIT',
        amount: 100000,
        description: 'Monthly maintenance collections',
        referenceType: 'INVOICE'
      },
      context.adminSession.accessToken
    )
    ensureExpectedStatus(ledgerEntryResponse, [200], 'POST', '/api/v1/ledger-entries')
    expect(ledgerEntryResponse.body.data.accountHeadId).toBe(incomeHeadId)

    const ledgerByAccountResponse = await suite.api.get(
      `/api/v1/ledger-entries/account/${incomeHeadId}`,
      context.adminSession.accessToken
    )
    ensureExpectedStatus(ledgerByAccountResponse, [200], 'GET', '/api/v1/ledger-entries/account/{accountHeadId}')
    expect((ledgerByAccountResponse.body.data?.content || []).length).toBeGreaterThanOrEqual(1)

    const legacyLedgerIncomeResponse = await suite.api.post(
      '/api/v1/ledger',
      {
        type: 'INCOME',
        category: 'MAINTENANCE',
        amount: 3000,
        reference: `INC-${suffix}`,
        description: 'Legacy ledger income',
        entryDate: `${currentYear}-02-20`
      },
      context.adminSession.accessToken
    )
    ensureExpectedStatus(legacyLedgerIncomeResponse, [200], 'POST', '/api/v1/ledger')

    const legacyLedgerExpenseResponse = await suite.api.post(
      '/api/v1/ledger',
      {
        type: 'EXPENSE',
        category: 'REPAIR',
        amount: 1200,
        reference: `EXP-${suffix}`,
        description: 'Legacy ledger expense',
        entryDate: `${currentYear}-02-20`
      },
      context.adminSession.accessToken
    )
    ensureExpectedStatus(legacyLedgerExpenseResponse, [200], 'POST', '/api/v1/ledger')

    const legacySummaryResponse = await suite.api.get('/api/v1/ledger/summary', context.adminSession.accessToken)
    ensureExpectedStatus(legacySummaryResponse, [200], 'GET', '/api/v1/ledger/summary')
    expect(legacySummaryResponse.body.data.totalIncome).toBeGreaterThanOrEqual(3000)
    expect(legacySummaryResponse.body.data.totalExpense).toBeGreaterThanOrEqual(1200)

    const expenseResponse = await suite.api.post(
      '/api/v1/expenses',
      {
        accountHeadId: expenseHeadId,
        fundCategoryId,
        vendorId,
        expenseDate: `${currentYear}-02-17`,
        amount: 12000,
        description: 'Lift repair and maintenance'
      },
      context.adminSession.accessToken
    )
    ensureExpectedStatus(expenseResponse, [200], 'POST', '/api/v1/expenses')
    const expenseId = expenseResponse.body.data.id
    expect(expenseResponse.body.data.paymentStatus).toBe('PENDING')

    const pendingExpensesResponse = await suite.api.get('/api/v1/expenses/pending-approval', context.adminSession.accessToken)
    ensureExpectedStatus(pendingExpensesResponse, [200], 'GET', '/api/v1/expenses/pending-approval')
    const pendingExpenseIds = (pendingExpensesResponse.body.data?.content || []).map((entry) => entry.id)
    expect(pendingExpenseIds).toContain(expenseId)

    const approveExpenseResponse = await suite.api.post(
      `/api/v1/expenses/${expenseId}/approve`,
      {},
      context.adminSession.accessToken
    )
    ensureExpectedStatus(approveExpenseResponse, [200], 'POST', '/api/v1/expenses/{id}/approve')
    expect(approveExpenseResponse.body.data.paymentStatus).toBe('PAID')

    const vendorPaymentCompletedResponse = await suite.api.post(
      '/api/v1/vendor-payments',
      {
        vendorId,
        expenseId,
        paymentDate: `${currentYear}-02-18`,
        amount: 12000,
        paymentMethod: 'NEFT',
        transactionReference: `NEFT-${suffix}`,
        status: 'COMPLETED'
      },
      context.adminSession.accessToken
    )
    ensureExpectedStatus(vendorPaymentCompletedResponse, [200], 'POST', '/api/v1/vendor-payments')
    expect(vendorPaymentCompletedResponse.body.data.status).toBe('COMPLETED')

    const vendorPaymentPendingResponse = await suite.api.post(
      '/api/v1/vendor-payments',
      {
        vendorId,
        paymentDate: `${currentYear}-02-19`,
        amount: 2000,
        paymentMethod: 'CHEQUE',
        status: 'PENDING'
      },
      context.adminSession.accessToken
    )
    ensureExpectedStatus(vendorPaymentPendingResponse, [200], 'POST', '/api/v1/vendor-payments')
    expect(vendorPaymentPendingResponse.body.data.status).toBe('PENDING')

    const pendingVendorPaymentsResponse = await suite.api.get('/api/v1/vendor-payments/pending', context.adminSession.accessToken)
    ensureExpectedStatus(pendingVendorPaymentsResponse, [200], 'GET', '/api/v1/vendor-payments/pending')
    const pendingVendorPaymentIds = (pendingVendorPaymentsResponse.body.data?.content || []).map((entry) => entry.id)
    expect(pendingVendorPaymentIds).toContain(vendorPaymentPendingResponse.body.data.id)

    const budgetVsActualResponse = await suite.api.get(
      `/api/v1/budgets/vs-actual?financialYear=${encodeURIComponent(financialYear)}`,
      context.adminSession.accessToken
    )
    ensureExpectedStatus(budgetVsActualResponse, [200], 'GET', '/api/v1/budgets/vs-actual')
    expect((budgetVsActualResponse.body.data || []).length).toBeGreaterThanOrEqual(1)

    const incomeStatementResponse = await suite.api.get('/api/v1/reports/income-statement', context.adminSession.accessToken)
    ensureExpectedStatus(incomeStatementResponse, [200], 'GET', '/api/v1/reports/income-statement')

    const balanceSheetResponse = await suite.api.get('/api/v1/reports/balance-sheet', context.adminSession.accessToken)
    ensureExpectedStatus(balanceSheetResponse, [200], 'GET', '/api/v1/reports/balance-sheet')

    const cashFlowResponse = await suite.api.get('/api/v1/reports/cash-flow', context.adminSession.accessToken)
    ensureExpectedStatus(cashFlowResponse, [200], 'GET', '/api/v1/reports/cash-flow')

    const trialBalanceResponse = await suite.api.get(
      `/api/v1/reports/trial-balance?financialYear=${encodeURIComponent(financialYear)}`,
      context.adminSession.accessToken
    )
    ensureExpectedStatus(trialBalanceResponse, [200], 'GET', '/api/v1/reports/trial-balance')

    const fundSummaryResponse = await suite.api.get('/api/v1/reports/fund-summary', context.adminSession.accessToken)
    ensureExpectedStatus(fundSummaryResponse, [200], 'GET', '/api/v1/reports/fund-summary')

    const caExportResponse = await suite.api.get(
      `/api/v1/reports/export/ca-format?financialYear=${encodeURIComponent(financialYear)}`,
      context.adminSession.accessToken
    )
    ensureExpectedStatus(caExportResponse, [200], 'GET', '/api/v1/reports/export/ca-format')
    expect(caExportResponse.body.data).toBeTruthy()
  })

  it('rejects unauthenticated accounting writes and invalid resource lookups', async () => {
    if (skipIfSetupBlocked(context)) {
      return
    }

    const suffix = randomSuffix().replace(/[^0-9]/g, '')
    const unauthCreateResponse = await suite.api.post('/api/v1/account-heads', {
      headName: `Unauthorized Head ${suffix}`,
      headType: 'EXPENSE'
    })
    ensureExpectedStatus(unauthCreateResponse, [401, 403], 'POST', '/api/v1/account-heads')

    const missingResourceId = '11111111-1111-1111-1111-111111111111'
    const missingVendorResponse = await suite.api.get(`/api/v1/vendors/${missingResourceId}`, context.adminSession.accessToken)
    ensureExpectedStatus(missingVendorResponse, [404], 'GET', '/api/v1/vendors/{id}')
  })
})

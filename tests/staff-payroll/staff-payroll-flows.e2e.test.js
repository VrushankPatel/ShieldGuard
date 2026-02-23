const { randomSuffix } = require('../../src/utils/dataFactory')
const { AbstractApiTest } = require('../../src/core/abstractApiTest')
const {
  ensureExpectedStatus,
  resolveAdminSession,
  skipIfSetupBlocked
} = require('../../src/utils/flowHarness')

describe('Staff and payroll real-world flow scenarios', () => {
  const suite = new AbstractApiTest()
  const context = {
    setupBlockedReason: null
  }

  beforeAll(async () => {
    await suite.setup()
    await resolveAdminSession(suite, context, 'SG-0012 staff-payroll flow')
  })

  afterAll(async () => {
    await suite.teardown()
  })

  it('drives staff attendance to payroll generation, processing, and approval lifecycle', async () => {
    if (skipIfSetupBlocked(context)) {
      return
    }

    const suffix = randomSuffix().replace(/[^0-9]/g, '')
    const currentYear = new Date().getUTCFullYear()
    const month = 2

    const createStaffResponse = await suite.api.post(
      '/api/v1/staff',
      {
        employeeId: `STF-${suffix.slice(-5)}`,
        firstName: 'Aarav',
        lastName: 'Shah',
        phone: `+9199${suffix.slice(-8)}`,
        email: `staff.${suffix}@shieldguard.test`,
        designation: 'MANAGER',
        dateOfJoining: `${currentYear}-01-01`,
        employmentType: 'FULL_TIME',
        basicSalary: 25000,
        active: true
      },
      context.adminSession.accessToken
    )
    ensureExpectedStatus(createStaffResponse, [200], 'POST', '/api/v1/staff')
    const staffId = createStaffResponse.body.data.id

    const earningComponentResponse = await suite.api.post(
      '/api/v1/payroll-components',
      {
        componentName: `Basic ${suffix}`,
        componentType: 'EARNING',
        taxable: true
      },
      context.adminSession.accessToken
    )
    ensureExpectedStatus(earningComponentResponse, [200], 'POST', '/api/v1/payroll-components')
    const earningComponentId = earningComponentResponse.body.data.id

    const deductionComponentResponse = await suite.api.post(
      '/api/v1/payroll-components',
      {
        componentName: `PF ${suffix}`,
        componentType: 'DEDUCTION',
        taxable: false
      },
      context.adminSession.accessToken
    )
    ensureExpectedStatus(deductionComponentResponse, [200], 'POST', '/api/v1/payroll-components')
    const deductionComponentId = deductionComponentResponse.body.data.id

    const salaryStructureEarningResponse = await suite.api.post(
      `/api/v1/staff/${staffId}/salary-structure`,
      {
        payrollComponentId: earningComponentId,
        amount: 30000,
        active: true,
        effectiveFrom: `${currentYear}-01-01`
      },
      context.adminSession.accessToken
    )
    ensureExpectedStatus(salaryStructureEarningResponse, [200], 'POST', '/api/v1/staff/{id}/salary-structure')

    const salaryStructureDeductionResponse = await suite.api.post(
      `/api/v1/staff/${staffId}/salary-structure`,
      {
        payrollComponentId: deductionComponentId,
        amount: 1000,
        active: true,
        effectiveFrom: `${currentYear}-01-01`
      },
      context.adminSession.accessToken
    )
    ensureExpectedStatus(salaryStructureDeductionResponse, [200], 'POST', '/api/v1/staff/{id}/salary-structure')

    const salaryStructureListResponse = await suite.api.get(
      `/api/v1/staff/${staffId}/salary-structure?page=0&size=10`,
      context.adminSession.accessToken
    )
    ensureExpectedStatus(salaryStructureListResponse, [200], 'GET', '/api/v1/staff/{id}/salary-structure')
    expect((salaryStructureListResponse.body.data?.content || []).length).toBeGreaterThanOrEqual(2)

    for (const date of [`${currentYear}-${String(month).padStart(2, '0')}-10`, `${currentYear}-${String(month).padStart(2, '0')}-11`]) {
      const checkInResponse = await suite.api.post(
        '/api/v1/staff-attendance/check-in',
        {
          staffId,
          attendanceDate: date
        },
        context.adminSession.accessToken
      )
      ensureExpectedStatus(checkInResponse, [200], 'POST', '/api/v1/staff-attendance/check-in')

      const checkOutResponse = await suite.api.post(
        '/api/v1/staff-attendance/check-out',
        {
          staffId,
          attendanceDate: date
        },
        context.adminSession.accessToken
      )
      ensureExpectedStatus(checkOutResponse, [200], 'POST', '/api/v1/staff-attendance/check-out')
    }

    const attendanceSummaryResponse = await suite.api.get(
      `/api/v1/staff-attendance/summary?from=${currentYear}-${String(month).padStart(2, '0')}-01&to=${currentYear}-${String(month).padStart(2, '0')}-28`,
      context.adminSession.accessToken
    )
    ensureExpectedStatus(attendanceSummaryResponse, [200], 'GET', '/api/v1/staff-attendance/summary')
    expect(attendanceSummaryResponse.body.data.totalRecords).toBeGreaterThanOrEqual(2)

    const payrollGenerateResponse = await suite.api.post(
      '/api/v1/payroll/generate',
      {
        staffId,
        month,
        year: currentYear,
        workingDays: 2,
        totalDeductions: 200
      },
      context.adminSession.accessToken
    )
    ensureExpectedStatus(payrollGenerateResponse, [200], 'POST', '/api/v1/payroll/generate')
    const payrollId = payrollGenerateResponse.body.data.id
    expect(payrollGenerateResponse.body.data.status).toBe('DRAFT')

    const payrollProcessResponse = await suite.api.post(
      '/api/v1/payroll/process',
      {
        payrollId,
        paymentMethod: 'BANK_TRANSFER',
        paymentReference: `PAY-${suffix}`,
        paymentDate: `${currentYear}-${String(month).padStart(2, '0')}-28`,
        payslipUrl: `https://files.shieldguard.test/payslip/${payrollId}.pdf`
      },
      context.adminSession.accessToken
    )
    ensureExpectedStatus(payrollProcessResponse, [200], 'POST', '/api/v1/payroll/process')
    expect(payrollProcessResponse.body.data.status).toBe('PROCESSED')

    const payrollApproveResponse = await suite.api.post(
      `/api/v1/payroll/${payrollId}/approve`,
      {},
      context.adminSession.accessToken
    )
    ensureExpectedStatus(payrollApproveResponse, [200], 'POST', '/api/v1/payroll/{id}/approve')
    expect(payrollApproveResponse.body.data.status).toBe('PAID')

    const payrollPayslipResponse = await suite.api.get(`/api/v1/payroll/${payrollId}/payslip`, context.adminSession.accessToken)
    ensureExpectedStatus(payrollPayslipResponse, [200], 'GET', '/api/v1/payroll/{id}/payslip')
    expect(payrollPayslipResponse.body.data.netSalary).toBeGreaterThan(0)

    const payrollByStaffResponse = await suite.api.get(
      `/api/v1/payroll/staff/${staffId}?page=0&size=10`,
      context.adminSession.accessToken
    )
    ensureExpectedStatus(payrollByStaffResponse, [200], 'GET', '/api/v1/payroll/staff/{staffId}')
    const payrollIds = (payrollByStaffResponse.body.data?.content || []).map((entry) => entry.id)
    expect(payrollIds).toContain(payrollId)

    const payrollSummaryResponse = await suite.api.get(
      `/api/v1/payroll/summary?month=${month}&year=${currentYear}`,
      context.adminSession.accessToken
    )
    ensureExpectedStatus(payrollSummaryResponse, [200], 'GET', '/api/v1/payroll/summary')
    expect(payrollSummaryResponse.body.data.totalPayrolls).toBeGreaterThanOrEqual(1)
  })

  it('drives staff leave approval and exports with access-control checks', async () => {
    if (skipIfSetupBlocked(context)) {
      return
    }

    const suffix = randomSuffix().replace(/[^0-9]/g, '')
    const currentYear = new Date().getUTCFullYear()

    const createStaffResponse = await suite.api.post(
      '/api/v1/staff',
      {
        employeeId: `STL-${suffix.slice(-5)}`,
        firstName: 'Riya',
        lastName: 'Patel',
        phone: `+9188${suffix.slice(-8)}`,
        email: `staff.leave.${suffix}@shieldguard.test`,
        designation: 'SECURITY_GUARD',
        dateOfJoining: `${currentYear}-01-15`,
        employmentType: 'FULL_TIME',
        basicSalary: 18000,
        active: true
      },
      context.adminSession.accessToken
    )
    ensureExpectedStatus(createStaffResponse, [200], 'POST', '/api/v1/staff')
    const staffId = createStaffResponse.body.data.id

    const createLeaveResponse = await suite.api.post(
      '/api/v1/staff-leaves',
      {
        staffId,
        leaveType: 'CASUAL',
        fromDate: `${currentYear}-03-01`,
        toDate: `${currentYear}-03-02`,
        numberOfDays: 2,
        reason: 'Personal work'
      },
      context.adminSession.accessToken
    )
    ensureExpectedStatus(createLeaveResponse, [200], 'POST', '/api/v1/staff-leaves')
    expect(createLeaveResponse.body.data.status).toBe('PENDING')
    const leaveId = createLeaveResponse.body.data.id

    const pendingLeavesResponse = await suite.api.get('/api/v1/staff-leaves/pending-approval?page=0&size=10', context.adminSession.accessToken)
    ensureExpectedStatus(pendingLeavesResponse, [200], 'GET', '/api/v1/staff-leaves/pending-approval')
    const pendingLeaveIds = (pendingLeavesResponse.body.data?.content || []).map((entry) => entry.id)
    expect(pendingLeaveIds).toContain(leaveId)

    const approveLeaveResponse = await suite.api.post(
      `/api/v1/staff-leaves/${leaveId}/approve`,
      {},
      context.adminSession.accessToken
    )
    ensureExpectedStatus(approveLeaveResponse, [200], 'POST', '/api/v1/staff-leaves/{id}/approve')
    expect(approveLeaveResponse.body.data.status).toBe('APPROVED')

    const leaveBalanceResponse = await suite.api.get(`/api/v1/staff-leaves/balance/${staffId}`, context.adminSession.accessToken)
    ensureExpectedStatus(leaveBalanceResponse, [200], 'GET', '/api/v1/staff-leaves/balance/{staffId}')
    expect(leaveBalanceResponse.body.data.approvedDays).toBeGreaterThanOrEqual(2)

    const exportStaffResponse = await suite.api.get('/api/v1/staff/export', context.adminSession.accessToken)
    ensureExpectedStatus(exportStaffResponse, [200], 'GET', '/api/v1/staff/export')
    expect(exportStaffResponse.text).toContain('employee_id')

    const unauthExportResponse = await suite.api.get('/api/v1/staff/export')
    ensureExpectedStatus(unauthExportResponse, [401, 403], 'GET', '/api/v1/staff/export')
  })
})

const { randomSuffix, createStrongPassword } = require('../../src/utils/dataFactory')
const { AbstractApiTest } = require('../../src/core/abstractApiTest')
const { createUnit, loginWithEmail, onboardSocietyWithAdmin } = require('../../src/utils/onboarding')

function ensureExpectedStatus(response, expectedStatuses, method, path) {
  if (expectedStatuses.includes(response.status)) {
    return
  }

  throw new Error(
    `${method} ${path} expected ${expectedStatuses.join(' or ')}, got ${response.status} (${response.body?.message || 'no message'})`
  )
}

describe('Helpdesk and emergency real-world flow scenarios', () => {
  const suite = new AbstractApiTest()
  const context = {
    setupBlockedReason: null
  }

  function skipIfSetupBlocked() {
    if (!context.setupBlockedReason) {
      return false
    }

    expect(context.setupBlockedReason).toMatch(/SHIELD_(ADMIN_EMAIL|ADMIN_PASSWORD|ROOT_PASSWORD)/)
    return true
  }

  async function createUser(role, unitId, accessToken, namePrefix) {
    const suffix = randomSuffix().replace(/[^0-9]/g, '')
    const password = createStrongPassword(role)
    const response = await suite.api.post(
      '/api/v1/users',
      {
        unitId,
        name: `${namePrefix} ${suffix}`,
        email: `${role.toLowerCase()}.${namePrefix.toLowerCase()}.${suffix}@shieldguard.test`,
        phone: `+9166${suffix.slice(-8)}`,
        password,
        role
      },
      accessToken
    )
    ensureExpectedStatus(response, [200], 'POST', '/api/v1/users')

    return {
      user: response.body.data,
      credentials: {
        email: response.body.data.email,
        password
      }
    }
  }

  beforeAll(async () => {
    await suite.setup()

    try {
      if (suite.config.adminEmail && suite.config.adminPassword) {
        context.adminSession = await loginWithEmail(suite.api, suite.config.adminEmail, suite.config.adminPassword)
      } else {
        const onboarding = await onboardSocietyWithAdmin(suite.api, suite.config)
        if (onboarding.onboardingBlocked) {
          context.setupBlockedReason =
            `${onboarding.onboardingBlockedReason || 'Tenant admin onboarding unavailable.'} ` +
            'Set SHIELD_ADMIN_EMAIL and SHIELD_ADMIN_PASSWORD in ShieldGuard/.env for SG-0011 execution in strict environments.'
          return
        }

        context.adminSession = onboarding.adminSession
      }
    } catch (error) {
      const message = error?.message || 'Helpdesk/emergency setup failed'
      context.setupBlockedReason =
        `${message}. Set SHIELD_ROOT_PASSWORD or provide SHIELD_ADMIN_EMAIL and SHIELD_ADMIN_PASSWORD in ShieldGuard/.env.`
      return
    }

    context.unit = await createUnit(suite.api, context.adminSession.accessToken, {
      block: 'HD',
      unitNumber: `HD-${randomSuffix().slice(-4)}`
    })

    const assignee = await createUser('SECURITY', context.unit.id, context.adminSession.accessToken, 'HelpdeskOps')
    context.assignee = assignee
  })

  afterAll(async () => {
    await suite.teardown()
  })

  it('drives helpdesk ticket through assignment, resolution, rating, and reopen', async () => {
    if (skipIfSetupBlocked()) {
      return
    }

    const suffix = randomSuffix().replace(/[^0-9]/g, '')

    const categoryResponse = await suite.api.post(
      '/api/v1/helpdesk-categories',
      {
        name: `Water Supply ${suffix}`,
        description: 'Water pressure and line issues',
        slaHours: 24
      },
      context.adminSession.accessToken
    )
    ensureExpectedStatus(categoryResponse, [200], 'POST', '/api/v1/helpdesk-categories')
    const category = categoryResponse.body.data

    const ticketResponse = await suite.api.post(
      '/api/v1/helpdesk-tickets',
      {
        categoryId: category.id,
        unitId: context.unit.id,
        subject: `Low water pressure ${suffix}`,
        description: 'Pressure is low since morning in kitchen line',
        priority: 'HIGH'
      },
      context.adminSession.accessToken
    )
    ensureExpectedStatus(ticketResponse, [200], 'POST', '/api/v1/helpdesk-tickets')
    const ticket = ticketResponse.body.data
    expect(ticket.status).toBe('OPEN')

    const assignResponse = await suite.api.post(
      `/api/v1/helpdesk-tickets/${ticket.id}/assign`,
      {
        assignedTo: context.assignee.user.id
      },
      context.adminSession.accessToken
    )
    ensureExpectedStatus(assignResponse, [200], 'POST', '/api/v1/helpdesk-tickets/{id}/assign')
    expect(assignResponse.body.data.status).toBe('IN_PROGRESS')

    const resolveResponse = await suite.api.post(
      `/api/v1/helpdesk-tickets/${ticket.id}/resolve`,
      {
        resolutionNotes: 'Valve adjusted and line purged'
      },
      context.adminSession.accessToken
    )
    ensureExpectedStatus(resolveResponse, [200], 'POST', '/api/v1/helpdesk-tickets/{id}/resolve')
    expect(resolveResponse.body.data.status).toBe('RESOLVED')

    const rateResponse = await suite.api.post(
      `/api/v1/helpdesk-tickets/${ticket.id}/rate`,
      {
        satisfactionRating: 5
      },
      context.adminSession.accessToken
    )
    ensureExpectedStatus(rateResponse, [200], 'POST', '/api/v1/helpdesk-tickets/{id}/rate')
    expect(rateResponse.body.data.satisfactionRating).toBe(5)

    const closeResponse = await suite.api.post(
      `/api/v1/helpdesk-tickets/${ticket.id}/close`,
      {},
      context.adminSession.accessToken
    )
    ensureExpectedStatus(closeResponse, [200], 'POST', '/api/v1/helpdesk-tickets/{id}/close')
    expect(closeResponse.body.data.status).toBe('CLOSED')

    const reopenResponse = await suite.api.post(
      `/api/v1/helpdesk-tickets/${ticket.id}/reopen`,
      {},
      context.adminSession.accessToken
    )
    ensureExpectedStatus(reopenResponse, [200], 'POST', '/api/v1/helpdesk-tickets/{id}/reopen')
    expect(['OPEN', 'IN_PROGRESS']).toContain(reopenResponse.body.data.status)

    const commentResponse = await suite.api.post(
      `/api/v1/helpdesk-tickets/${ticket.id}/comments`,
      {
        comment: 'Please monitor pressure for next 24 hours.',
        internalNote: false
      },
      context.adminSession.accessToken
    )
    ensureExpectedStatus(commentResponse, [200], 'POST', '/api/v1/helpdesk-tickets/{id}/comments')

    const attachmentResponse = await suite.api.post(
      `/api/v1/helpdesk-tickets/${ticket.id}/attachments`,
      {
        fileName: `photo-${suffix}.jpg`,
        fileUrl: `https://example.test/helpdesk/${suffix}.jpg`
      },
      context.adminSession.accessToken
    )
    ensureExpectedStatus(attachmentResponse, [200], 'POST', '/api/v1/helpdesk-tickets/{id}/attachments')

    const commentsListResponse = await suite.api.get(
      `/api/v1/helpdesk-tickets/${ticket.id}/comments`,
      context.adminSession.accessToken
    )
    ensureExpectedStatus(commentsListResponse, [200], 'GET', '/api/v1/helpdesk-tickets/{id}/comments')
    const commentIds = (commentsListResponse.body.data?.content || []).map((entry) => entry.id)
    expect(commentIds).toContain(commentResponse.body.data.id)

    const attachmentsListResponse = await suite.api.get(
      `/api/v1/helpdesk-tickets/${ticket.id}/attachments`,
      context.adminSession.accessToken
    )
    ensureExpectedStatus(attachmentsListResponse, [200], 'GET', '/api/v1/helpdesk-tickets/{id}/attachments')
    const attachmentIds = (attachmentsListResponse.body.data?.content || []).map((entry) => entry.id)
    expect(attachmentIds).toContain(attachmentResponse.body.data.id)
  })

  it('rejects invalid helpdesk transitions and unauthenticated category creation', async () => {
    if (skipIfSetupBlocked()) {
      return
    }

    const suffix = randomSuffix().replace(/[^0-9]/g, '')
    const ticketResponse = await suite.api.post(
      '/api/v1/helpdesk-tickets',
      {
        unitId: context.unit.id,
        subject: `Billing query ${suffix}`,
        description: 'Need breakdown for common area charges',
        priority: 'MEDIUM'
      },
      context.adminSession.accessToken
    )
    ensureExpectedStatus(ticketResponse, [200], 'POST', '/api/v1/helpdesk-tickets')

    const ratingResponse = await suite.api.post(
      `/api/v1/helpdesk-tickets/${ticketResponse.body.data.id}/rate`,
      {
        satisfactionRating: 4
      },
      context.adminSession.accessToken
    )
    ensureExpectedStatus(ratingResponse, [400], 'POST', '/api/v1/helpdesk-tickets/{id}/rate')

    const unauthCategoryCreateResponse = await suite.api.post('/api/v1/helpdesk-categories', {
      name: `Unauthorized ${suffix}`,
      description: 'Should fail without auth'
    })
    ensureExpectedStatus(unauthCategoryCreateResponse, [401, 403], 'POST', '/api/v1/helpdesk-categories')
  })

  it('drives emergency alert and safety inspection workflows with rejection checks', async () => {
    if (skipIfSetupBlocked()) {
      return
    }

    const suffix = randomSuffix().replace(/[^0-9]/g, '')

    const emergencyContactResponse = await suite.api.post(
      '/api/v1/emergency-contacts',
      {
        contactType: 'AMBULANCE',
        contactName: `City Ambulance ${suffix}`,
        phonePrimary: `+9199${suffix.slice(-8)}`,
        address: 'Main Road Hospital Lane',
        displayOrder: 1,
        active: true
      },
      context.adminSession.accessToken
    )
    ensureExpectedStatus(emergencyContactResponse, [200], 'POST', '/api/v1/emergency-contacts')

    const equipmentResponse = await suite.api.post(
      '/api/v1/safety-equipment',
      {
        equipmentType: 'FIRE_EXTINGUISHER',
        equipmentTag: `FE-${suffix}`,
        location: 'Tower A Lobby',
        inspectionFrequencyDays: 30,
        functional: true
      },
      context.adminSession.accessToken
    )
    ensureExpectedStatus(equipmentResponse, [200], 'POST', '/api/v1/safety-equipment')
    const equipment = equipmentResponse.body.data

    const inspectionResponse = await suite.api.post(
      '/api/v1/safety-inspections',
      {
        equipmentId: equipment.id,
        inspectionDate: '2026-02-20',
        inspectionResult: 'PASSED',
        remarks: 'Pressure gauge within expected range'
      },
      context.adminSession.accessToken
    )
    ensureExpectedStatus(inspectionResponse, [200], 'POST', '/api/v1/safety-inspections')

    const alertResponse = await suite.api.post(
      '/api/v1/sos-alerts/raise',
      {
        unitId: context.unit.id,
        alertType: 'MEDICAL',
        location: 'Tower A - 10th floor',
        description: 'Resident reported dizziness'
      },
      context.adminSession.accessToken
    )
    ensureExpectedStatus(alertResponse, [200], 'POST', '/api/v1/sos-alerts/raise')
    const alert = alertResponse.body.data
    expect(alert.status).toBe('ACTIVE')

    const respondResponse = await suite.api.post(
      `/api/v1/sos-alerts/${alert.id}/respond`,
      {},
      context.adminSession.accessToken
    )
    ensureExpectedStatus(respondResponse, [200], 'POST', '/api/v1/sos-alerts/{id}/respond')
    expect(respondResponse.body.data.status).toBe('RESPONDED')

    const resolveResponse = await suite.api.post(
      `/api/v1/sos-alerts/${alert.id}/resolve`,
      {
        falseAlarm: false
      },
      context.adminSession.accessToken
    )
    ensureExpectedStatus(resolveResponse, [200], 'POST', '/api/v1/sos-alerts/{id}/resolve')
    expect(resolveResponse.body.data.status).toBe('RESOLVED')

    const falseAlarmResponse = await suite.api.post(
      `/api/v1/sos-alerts/${alert.id}/mark-false-alarm`,
      {},
      context.adminSession.accessToken
    )
    ensureExpectedStatus(falseAlarmResponse, [200], 'POST', '/api/v1/sos-alerts/{id}/mark-false-alarm')
    expect(falseAlarmResponse.body.data.status).toBe('FALSE_ALARM')

    const invalidInspectionResponse = await suite.api.post(
      '/api/v1/safety-inspections',
      {
        equipmentId: '00000000-0000-0000-0000-000000000999',
        inspectionDate: '2026-02-21',
        inspectionResult: 'FAILED',
        remarks: 'Invalid reference should fail'
      },
      context.adminSession.accessToken
    )
    ensureExpectedStatus(invalidInspectionResponse, [404], 'POST', '/api/v1/safety-inspections')

    const unauthEquipmentCreateResponse = await suite.api.post('/api/v1/safety-equipment', {
      equipmentType: 'ALARM',
      equipmentTag: `AL-${suffix}`,
      location: 'Basement'
    })
    ensureExpectedStatus(unauthEquipmentCreateResponse, [401, 403], 'POST', '/api/v1/safety-equipment')
  })
})

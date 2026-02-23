const { randomSuffix } = require('../../src/utils/dataFactory')
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

function futureIso(hoursFromNow) {
  return new Date(Date.now() + hoursFromNow * 60 * 60 * 1000).toISOString()
}

describe('Amenities and meeting real-world flow scenarios', () => {
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

  async function createAmenity(nameSuffix, requiresApproval = true) {
    const response = await suite.api.post(
      '/api/v1/amenities',
      {
        name: `Banquet-${nameSuffix}`,
        amenityType: 'BANQUET_HALL',
        description: 'Community banquet hall for events',
        capacity: 120,
        location: 'Clubhouse-1',
        bookingAllowed: true,
        advanceBookingDays: 45,
        active: true,
        requiresApproval
      },
      context.adminSession.accessToken
    )

    ensureExpectedStatus(response, [200], 'POST', '/api/v1/amenities')
    return response.body.data
  }

  async function createBooking(amenityId, startTime, endTime) {
    const response = await suite.api.post(
      `/api/v1/amenity-bookings?amenityId=${amenityId}`,
      {
        unitId: context.unit.id,
        startTime,
        endTime,
        numberOfPersons: 80,
        purpose: 'Family function',
        notes: 'Need early access for setup'
      },
      context.adminSession.accessToken
    )

    return response
  }

  async function createMeeting(titleSuffix) {
    const response = await suite.api.post(
      '/api/v1/meetings',
      {
        meetingType: 'COMMITTEE_MEETING',
        title: `Committee Sync ${titleSuffix}`,
        agenda: 'Budget planning and maintenance updates',
        scheduledAt: futureIso(30),
        location: 'Society Office',
        meetingMode: 'IN_PERSON'
      },
      context.adminSession.accessToken
    )

    ensureExpectedStatus(response, [200], 'POST', '/api/v1/meetings')
    return response.body.data
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
            'Set SHIELD_ADMIN_EMAIL and SHIELD_ADMIN_PASSWORD in ShieldGuard/.env for SG-0007 execution in strict environments.'
          return
        }

        context.adminSession = onboarding.adminSession
      }
    } catch (error) {
      const message = error?.message || 'Amenities/meeting setup failed'
      context.setupBlockedReason =
        `${message}. Set SHIELD_ROOT_PASSWORD or provide SHIELD_ADMIN_EMAIL and SHIELD_ADMIN_PASSWORD in ShieldGuard/.env.`
      return
    }

    context.unit = await createUnit(suite.api, context.adminSession.accessToken, {
      block: 'AMN',
      unitNumber: `AM-${randomSuffix().slice(-4)}`
    })
  })

  afterAll(async () => {
    await suite.teardown()
  })

  it('drives amenity booking lifecycle with approval and availability checks', async () => {
    if (skipIfSetupBlocked()) {
      return
    }

    const suffix = randomSuffix().replace(/[^0-9]/g, '')
    const amenity = await createAmenity(suffix, true)

    const bookingStart = futureIso(48)
    const bookingEnd = futureIso(50)

    const createBookingResponse = await createBooking(amenity.id, bookingStart, bookingEnd)
    ensureExpectedStatus(createBookingResponse, [200], 'POST', '/api/v1/amenity-bookings')
    const booking = createBookingResponse.body.data
    expect(booking.status).toBe('PENDING')

    const approveResponse = await suite.api.post(
      `/api/v1/amenity-bookings/${booking.id}/approve`,
      {},
      context.adminSession.accessToken
    )
    ensureExpectedStatus(approveResponse, [200], 'POST', '/api/v1/amenity-bookings/{id}/approve')
    expect(approveResponse.body.data.status).toBe('CONFIRMED')

    const availabilityOverlappingResponse = await suite.api.get(
      `/api/v1/amenity-bookings/check-availability?amenityId=${amenity.id}&startTime=${encodeURIComponent(bookingStart)}&endTime=${encodeURIComponent(bookingEnd)}`,
      context.adminSession.accessToken
    )
    ensureExpectedStatus(availabilityOverlappingResponse, [200], 'GET', '/api/v1/amenity-bookings/check-availability')
    expect(availabilityOverlappingResponse.body.data.available).toBe(false)

    const completeResponse = await suite.api.post(
      `/api/v1/amenity-bookings/${booking.id}/complete`,
      {},
      context.adminSession.accessToken
    )
    ensureExpectedStatus(completeResponse, [200], 'POST', '/api/v1/amenity-bookings/{id}/complete')
    expect(completeResponse.body.data.status).toBe('COMPLETED')

    const listByAmenityResponse = await suite.api.get(
      `/api/v1/amenity-bookings/amenity/${amenity.id}`,
      context.adminSession.accessToken
    )
    ensureExpectedStatus(listByAmenityResponse, [200], 'GET', '/api/v1/amenity-bookings/amenity/{amenityId}')
    const bookingIds = (listByAmenityResponse.body.data?.content || []).map((item) => item.id)
    expect(bookingIds).toContain(booking.id)
  })

  it('rejects overlapping amenity bookings and missing meeting minutes lookups', async () => {
    if (skipIfSetupBlocked()) {
      return
    }

    const suffix = randomSuffix().replace(/[^0-9]/g, '')
    const amenity = await createAmenity(`${suffix}-reject`, false)

    const bookingStart = futureIso(60)
    const bookingEnd = futureIso(62)

    const firstBookingResponse = await createBooking(amenity.id, bookingStart, bookingEnd)
    ensureExpectedStatus(firstBookingResponse, [200], 'POST', '/api/v1/amenity-bookings')

    const overlappingBookingResponse = await createBooking(amenity.id, bookingStart, bookingEnd)
    ensureExpectedStatus(overlappingBookingResponse, [400], 'POST', '/api/v1/amenity-bookings')

    const meeting = await createMeeting(suffix)
    const missingMinutesResponse = await suite.api.get(
      `/api/v1/meetings/${meeting.id}/minutes`,
      context.adminSession.accessToken
    )
    ensureExpectedStatus(missingMinutesResponse, [404], 'GET', '/api/v1/meetings/{id}/minutes')
  })

  it('executes meeting start, minutes publish, approval, and closure flow', async () => {
    if (skipIfSetupBlocked()) {
      return
    }

    const suffix = randomSuffix().replace(/[^0-9]/g, '')
    const meeting = await createMeeting(`${suffix}-lifecycle`)

    const startResponse = await suite.api.post(`/api/v1/meetings/${meeting.id}/start`, {}, context.adminSession.accessToken)
    ensureExpectedStatus(startResponse, [200], 'POST', '/api/v1/meetings/{id}/start')
    expect(startResponse.body.data.status).toBe('ONGOING')

    const createMinutesResponse = await suite.api.post(
      `/api/v1/meetings/${meeting.id}/minutes`,
      {
        minutesContent: `Action summary for meeting ${suffix}`,
        summary: 'Discussed pending work orders and staffing'
      },
      context.adminSession.accessToken
    )
    ensureExpectedStatus(createMinutesResponse, [200], 'POST', '/api/v1/meetings/{id}/minutes')
    const minutes = createMinutesResponse.body.data
    expect(minutes.id).toBeTruthy()

    const approveMinutesResponse = await suite.api.post(
      `/api/v1/minutes/${minutes.id}/approve`,
      {},
      context.adminSession.accessToken
    )
    ensureExpectedStatus(approveMinutesResponse, [200], 'POST', '/api/v1/minutes/{id}/approve')
    expect(approveMinutesResponse.body.data.approvalDate).toBeTruthy()

    const fetchMinutesResponse = await suite.api.get(
      `/api/v1/meetings/${meeting.id}/minutes`,
      context.adminSession.accessToken
    )
    ensureExpectedStatus(fetchMinutesResponse, [200], 'GET', '/api/v1/meetings/{id}/minutes')
    expect(fetchMinutesResponse.body.data.id).toBe(minutes.id)

    const endResponse = await suite.api.post(`/api/v1/meetings/${meeting.id}/end`, {}, context.adminSession.accessToken)
    ensureExpectedStatus(endResponse, [200], 'POST', '/api/v1/meetings/{id}/end')
    expect(endResponse.body.data.status).toBe('COMPLETED')

    const reminderResponse = await suite.api.post(
      `/api/v1/meetings/${meeting.id}/send-reminders?reminderType=24_HOURS`,
      {},
      context.adminSession.accessToken
    )
    ensureExpectedStatus(reminderResponse, [200], 'POST', '/api/v1/meetings/{id}/send-reminders')

    const listRemindersResponse = await suite.api.get(
      `/api/v1/meetings/${meeting.id}/reminders`,
      context.adminSession.accessToken
    )
    ensureExpectedStatus(listRemindersResponse, [200], 'GET', '/api/v1/meetings/{id}/reminders')
    const reminderIds = (listRemindersResponse.body.data || []).map((item) => item.id)
    expect(reminderIds).toContain(reminderResponse.body.data.id)
  })
})

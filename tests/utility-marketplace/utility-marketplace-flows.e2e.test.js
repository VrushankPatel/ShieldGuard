const { randomSuffix } = require('../../src/utils/dataFactory')
const { AbstractApiTest } = require('../../src/core/abstractApiTest')
const { createUnit, loginWithEmail } = require('../../src/utils/onboarding')
const {
  ensureExpectedStatus,
  resolveAdminSession,
  skipIfSetupBlocked,
  createUser
} = require('../../src/utils/flowHarness')

describe('Utility and marketplace real-world flow scenarios', () => {
  const suite = new AbstractApiTest()
  const context = {
    setupBlockedReason: null
  }

  beforeAll(async () => {
    await suite.setup()
    await resolveAdminSession(suite, context, 'SG-0012 utility-marketplace flow')

    if (context.setupBlockedReason) {
      return
    }

    context.unit = await createUnit(suite.api, context.adminSession.accessToken, {
      block: 'UTL',
      unitNumber: `UT-${randomSuffix().slice(-4)}`
    })

    const seller = await createUser(
      suite,
      context.adminSession.accessToken,
      context.unit.id,
      'TENANT',
      'MarketplaceSeller'
    )
    const buyer = await createUser(
      suite,
      context.adminSession.accessToken,
      context.unit.id,
      'OWNER',
      'MarketplaceBuyer'
    )

    context.sellerSession = await loginWithEmail(suite.api, seller.credentials.email, seller.credentials.password)
    context.buyerSession = await loginWithEmail(suite.api, buyer.credentials.email, buyer.credentials.password)
  })

  afterAll(async () => {
    await suite.teardown()
  })

  it('tracks complete utility lifecycle across water, electricity, and generator logs', async () => {
    if (skipIfSetupBlocked(context)) {
      return
    }

    const suffix = randomSuffix().replace(/[^0-9]/g, '')
    const currentYear = new Date().getUTCFullYear()
    const month = '02'

    const waterTankResponse = await suite.api.post(
      '/api/v1/water-tanks',
      {
        tankName: `OH Tank ${suffix}`,
        tankType: 'OVERHEAD',
        capacity: 50000,
        location: 'Block A Terrace'
      },
      context.adminSession.accessToken
    )
    ensureExpectedStatus(waterTankResponse, [200], 'POST', '/api/v1/water-tanks')
    const tankId = waterTankResponse.body.data.id

    const waterLogResponse = await suite.api.post(
      '/api/v1/water-level-logs',
      {
        tankId,
        levelPercentage: 80.5,
        volume: 40250,
        readingTime: `${currentYear}-${month}-17T10:00:00Z`
      },
      context.adminSession.accessToken
    )
    ensureExpectedStatus(waterLogResponse, [200], 'POST', '/api/v1/water-level-logs')
    expect(waterLogResponse.body.data.tankId).toBe(tankId)

    const waterLogsByTankResponse = await suite.api.get(
      `/api/v1/water-level-logs/tank/${tankId}?page=0&size=10`,
      context.adminSession.accessToken
    )
    ensureExpectedStatus(waterLogsByTankResponse, [200], 'GET', '/api/v1/water-level-logs/tank/{tankId}')
    expect((waterLogsByTankResponse.body.data?.content || []).length).toBeGreaterThanOrEqual(1)

    const currentWaterLogResponse = await suite.api.get(
      `/api/v1/water-level-logs/current?tankId=${tankId}`,
      context.adminSession.accessToken
    )
    ensureExpectedStatus(currentWaterLogResponse, [200], 'GET', '/api/v1/water-level-logs/current')
    expect(currentWaterLogResponse.body.data.tankId).toBe(tankId)

    const waterChartResponse = await suite.api.get(
      `/api/v1/water-level-logs/chart-data?from=${encodeURIComponent(`${currentYear}-${month}-17T09:00:00Z`)}&to=${encodeURIComponent(`${currentYear}-${month}-17T12:00:00Z`)}&tankId=${tankId}&maxPoints=20`,
      context.adminSession.accessToken
    )
    ensureExpectedStatus(waterChartResponse, [200], 'GET', '/api/v1/water-level-logs/chart-data')

    const electricityMeterResponse = await suite.api.post(
      '/api/v1/electricity-meters',
      {
        meterNumber: `MTR-${suffix}`,
        meterType: 'MAIN',
        location: 'Transformer Room',
        unitId: context.unit.id
      },
      context.adminSession.accessToken
    )
    ensureExpectedStatus(electricityMeterResponse, [200], 'POST', '/api/v1/electricity-meters')
    const meterId = electricityMeterResponse.body.data.id

    const electricityReadingResponse = await suite.api.post(
      '/api/v1/electricity-readings',
      {
        meterId,
        readingDate: `${currentYear}-${month}-17`,
        readingValue: 10500,
        unitsConsumed: 220,
        cost: 1760
      },
      context.adminSession.accessToken
    )
    ensureExpectedStatus(electricityReadingResponse, [200], 'POST', '/api/v1/electricity-readings')
    expect(electricityReadingResponse.body.data.meterId).toBe(meterId)

    const electricityReadingsByMeterResponse = await suite.api.get(
      `/api/v1/electricity-readings/meter/${meterId}?page=0&size=10`,
      context.adminSession.accessToken
    )
    ensureExpectedStatus(electricityReadingsByMeterResponse, [200], 'GET', '/api/v1/electricity-readings/meter/{meterId}')
    expect((electricityReadingsByMeterResponse.body.data?.content || []).length).toBeGreaterThanOrEqual(1)

    const electricityReportResponse = await suite.api.get(
      `/api/v1/electricity-readings/consumption-report?from=${currentYear}-${month}-01&to=${currentYear}-${month}-28&meterId=${meterId}`,
      context.adminSession.accessToken
    )
    ensureExpectedStatus(electricityReportResponse, [200], 'GET', '/api/v1/electricity-readings/consumption-report')
    expect(electricityReportResponse.body.data.totalReadings).toBeGreaterThanOrEqual(1)

    const generatorResponse = await suite.api.post(
      '/api/v1/diesel-generators',
      {
        generatorName: `DG-${suffix}`,
        capacityKva: 125.5,
        location: 'Generator Room'
      },
      context.adminSession.accessToken
    )
    ensureExpectedStatus(generatorResponse, [200], 'POST', '/api/v1/diesel-generators')
    const generatorId = generatorResponse.body.data.id

    const generatorLogResponse = await suite.api.post(
      '/api/v1/generator-logs',
      {
        generatorId,
        logDate: `${currentYear}-${month}-17`,
        startTime: `${currentYear}-${month}-17T09:30:00Z`,
        stopTime: `${currentYear}-${month}-17T10:30:00Z`,
        runtimeHours: 1.0,
        dieselConsumed: 3.5,
        dieselCost: 350,
        meterReadingBefore: 12000,
        meterReadingAfter: 12025,
        unitsGenerated: 40
      },
      context.adminSession.accessToken
    )
    ensureExpectedStatus(generatorLogResponse, [200], 'POST', '/api/v1/generator-logs')
    expect(generatorLogResponse.body.data.generatorId).toBe(generatorId)

    const generatorSummaryResponse = await suite.api.get(
      `/api/v1/generator-logs/summary?from=${currentYear}-${month}-01&to=${currentYear}-${month}-28&generatorId=${generatorId}`,
      context.adminSession.accessToken
    )
    ensureExpectedStatus(generatorSummaryResponse, [200], 'GET', '/api/v1/generator-logs/summary')
    expect(generatorSummaryResponse.body.data.totalLogs).toBeGreaterThanOrEqual(1)
  })

  it('drives marketplace listing, inquiry, and carpool flow with ownership checks', async () => {
    if (skipIfSetupBlocked(context)) {
      return
    }

    const suffix = randomSuffix().replace(/[^0-9]/g, '')

    const categoryResponse = await suite.api.post(
      '/api/v1/marketplace-categories',
      {
        categoryName: `Furniture ${suffix}`,
        description: 'Home furniture items'
      },
      context.adminSession.accessToken
    )
    ensureExpectedStatus(categoryResponse, [200], 'POST', '/api/v1/marketplace-categories')
    const categoryId = categoryResponse.body.data.id

    const listingResponse = await suite.api.post(
      '/api/v1/marketplace-listings',
      {
        categoryId,
        listingType: 'SELL',
        title: `Dining Table ${suffix}`,
        description: 'Six seater dining table in good condition',
        price: 15000,
        negotiable: true,
        images: 'https://img.shieldguard.test/table.jpg',
        unitId: context.unit.id
      },
      context.sellerSession.accessToken
    )
    ensureExpectedStatus(listingResponse, [200], 'POST', '/api/v1/marketplace-listings')
    const listingId = listingResponse.body.data.id
    expect(listingResponse.body.data.status).toBe('ACTIVE')

    const listingByTypeResponse = await suite.api.get(
      '/api/v1/marketplace-listings/type/SELL?page=0&size=10',
      context.buyerSession.accessToken
    )
    ensureExpectedStatus(listingByTypeResponse, [200], 'GET', '/api/v1/marketplace-listings/type/{type}')
    const listingIds = (listingByTypeResponse.body.data?.content || []).map((entry) => entry.id)
    expect(listingIds).toContain(listingId)

    const listingSearchResponse = await suite.api.get(
      `/api/v1/marketplace-listings/search?q=${encodeURIComponent('Dining')}&page=0&size=10`,
      context.buyerSession.accessToken
    )
    ensureExpectedStatus(listingSearchResponse, [200], 'GET', '/api/v1/marketplace-listings/search')

    const inquiryResponse = await suite.api.post(
      `/api/v1/marketplace-listings/${listingId}/inquiries`,
      {
        message: 'Is it available for pickup this weekend?'
      },
      context.buyerSession.accessToken
    )
    ensureExpectedStatus(inquiryResponse, [200], 'POST', '/api/v1/marketplace-listings/{id}/inquiries')
    expect(inquiryResponse.body.data.listingId).toBe(listingId)

    const unauthSoldResponse = await suite.api.post(
      `/api/v1/marketplace-listings/${listingId}/mark-sold`,
      {},
      context.buyerSession.accessToken
    )
    ensureExpectedStatus(unauthSoldResponse, [401, 403], 'POST', '/api/v1/marketplace-listings/{id}/mark-sold')

    const markSoldResponse = await suite.api.post(
      `/api/v1/marketplace-listings/${listingId}/mark-sold`,
      {},
      context.sellerSession.accessToken
    )
    ensureExpectedStatus(markSoldResponse, [200], 'POST', '/api/v1/marketplace-listings/{id}/mark-sold')
    expect(markSoldResponse.body.data.status).toBe('SOLD')

    const incrementViewsResponse = await suite.api.post(
      `/api/v1/marketplace-listings/${listingId}/increment-views`,
      {},
      context.buyerSession.accessToken
    )
    ensureExpectedStatus(incrementViewsResponse, [200], 'POST', '/api/v1/marketplace-listings/{id}/increment-views')
    expect(incrementViewsResponse.body.data.viewsCount).toBeGreaterThanOrEqual(1)

    const inquiriesForBuyerResponse = await suite.api.get(
      '/api/v1/marketplace-inquiries/my-inquiries?page=0&size=10',
      context.buyerSession.accessToken
    )
    ensureExpectedStatus(inquiriesForBuyerResponse, [200], 'GET', '/api/v1/marketplace-inquiries/my-inquiries')
    expect((inquiriesForBuyerResponse.body.data?.content || []).length).toBeGreaterThanOrEqual(1)

    const carpoolResponse = await suite.api.post(
      '/api/v1/carpool-listings',
      {
        routeFrom: 'Borivali',
        routeTo: 'BKC',
        departureTime: '08:30:00',
        availableSeats: 3,
        daysOfWeek: 'Mon,Tue,Wed',
        vehicleType: 'CAR',
        contactPreference: 'PHONE',
        active: true
      },
      context.sellerSession.accessToken
    )
    ensureExpectedStatus(carpoolResponse, [200], 'POST', '/api/v1/carpool-listings')
    const carpoolId = carpoolResponse.body.data.id

    const carpoolRouteResponse = await suite.api.get(
      '/api/v1/carpool-listings/route?from=Borivali&to=BKC&page=0&size=10',
      context.buyerSession.accessToken
    )
    ensureExpectedStatus(carpoolRouteResponse, [200], 'GET', '/api/v1/carpool-listings/route')
    const carpoolIds = (carpoolRouteResponse.body.data?.content || []).map((entry) => entry.id)
    expect(carpoolIds).toContain(carpoolId)

    const unauthCreateCategoryResponse = await suite.api.post('/api/v1/marketplace-categories', {
      categoryName: `Unauthorized Category ${suffix}`,
      description: 'Should fail without auth'
    })
    ensureExpectedStatus(unauthCreateCategoryResponse, [401, 403], 'POST', '/api/v1/marketplace-categories')
  })
})

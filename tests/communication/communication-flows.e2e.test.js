const { randomSuffix } = require('../../src/utils/dataFactory')
const { AbstractApiTest } = require('../../src/core/abstractApiTest')
const { createUnit, loginWithEmail } = require('../../src/utils/onboarding')
const {
  ensureExpectedStatus,
  resolveAdminSession,
  skipIfSetupBlocked,
  createUser
} = require('../../src/utils/flowHarness')

function futureIso(daysAhead) {
  return new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000).toISOString()
}

describe('Communication real-world flow scenarios', () => {
  const suite = new AbstractApiTest()
  const context = {
    setupBlockedReason: null
  }

  beforeAll(async () => {
    await suite.setup()
    await resolveAdminSession(suite, context, 'SG-0012 communication flow')

    if (context.setupBlockedReason) {
      return
    }

    context.unit = await createUnit(suite.api, context.adminSession.accessToken, {
      block: 'COM',
      unitNumber: `CM-${randomSuffix().slice(-4)}`
    })

    const resident = await createUser(
      suite,
      context.adminSession.accessToken,
      context.unit.id,
      'TENANT',
      'CommunicationResident'
    )
    context.residentSession = await loginWithEmail(suite.api, resident.credentials.email, resident.credentials.password)
    context.residentUser = resident.user
  })

  afterAll(async () => {
    await suite.teardown()
  })

  it('drives announcement lifecycle with attachment, publish, read receipt, and statistics', async () => {
    if (skipIfSetupBlocked(context)) {
      return
    }

    const suffix = randomSuffix().replace(/[^0-9]/g, '')

    const announcementResponse = await suite.api.post(
      '/api/v1/announcements',
      {
        title: `Community Notice ${suffix}`,
        content: 'Water line maintenance on Saturday morning.',
        category: 'MAINTENANCE',
        priority: 'HIGH',
        emergency: false,
        expiresAt: futureIso(7),
        targetAudience: 'ALL'
      },
      context.adminSession.accessToken
    )
    ensureExpectedStatus(announcementResponse, [200], 'POST', '/api/v1/announcements')
    const announcementId = announcementResponse.body.data.id

    const attachmentResponse = await suite.api.post(
      `/api/v1/announcements/${announcementId}/attachments`,
      {
        fileName: `notice-${suffix}.pdf`,
        fileUrl: `https://files.shieldguard.test/notice-${suffix}.pdf`,
        fileSize: 1024,
        contentType: 'application/pdf'
      },
      context.adminSession.accessToken
    )
    ensureExpectedStatus(attachmentResponse, [200], 'POST', '/api/v1/announcements/{id}/attachments')
    const attachmentId = attachmentResponse.body.data.id

    const attachmentsListResponse = await suite.api.get(
      `/api/v1/announcements/${announcementId}/attachments`,
      context.residentSession.accessToken
    )
    ensureExpectedStatus(attachmentsListResponse, [200], 'GET', '/api/v1/announcements/{id}/attachments')
    expect((attachmentsListResponse.body.data || []).map((entry) => entry.id)).toContain(attachmentId)

    const publishResponse = await suite.api.post(
      `/api/v1/announcements/${announcementId}/publish`,
      {},
      context.adminSession.accessToken
    )
    ensureExpectedStatus(publishResponse, [200], 'POST', '/api/v1/announcements/{id}/publish')
    expect(publishResponse.body.data.announcement.status).toBe('PUBLISHED')

    const activeAnnouncementsResponse = await suite.api.get(
      '/api/v1/announcements/active?page=0&size=10',
      context.residentSession.accessToken
    )
    ensureExpectedStatus(activeAnnouncementsResponse, [200], 'GET', '/api/v1/announcements/active')
    const activeAnnouncementIds = (activeAnnouncementsResponse.body.data?.content || []).map((entry) => entry.id)
    expect(activeAnnouncementIds).toContain(announcementId)

    const markReadResponse = await suite.api.post(
      `/api/v1/announcements/${announcementId}/mark-read`,
      {},
      context.residentSession.accessToken
    )
    ensureExpectedStatus(markReadResponse, [200], 'POST', '/api/v1/announcements/{id}/mark-read')

    const readReceiptsResponse = await suite.api.get(
      `/api/v1/announcements/${announcementId}/read-receipts?page=0&size=10`,
      context.adminSession.accessToken
    )
    ensureExpectedStatus(readReceiptsResponse, [200], 'GET', '/api/v1/announcements/{id}/read-receipts')
    expect((readReceiptsResponse.body.data?.content || []).length).toBeGreaterThanOrEqual(1)

    const statsResponse = await suite.api.get(
      `/api/v1/announcements/${announcementId}/statistics`,
      context.adminSession.accessToken
    )
    ensureExpectedStatus(statsResponse, [200], 'GET', '/api/v1/announcements/{id}/statistics')
    expect(statsResponse.body.data.totalReads).toBeGreaterThanOrEqual(1)

    const deleteAttachmentResponse = await suite.api.delete(
      `/api/v1/announcements/attachments/${attachmentId}`,
      context.adminSession.accessToken
    )
    ensureExpectedStatus(deleteAttachmentResponse, [200], 'DELETE', '/api/v1/announcements/attachments/{attachmentId}')
  })

  it('drives polls, newsletters, notifications, and preference updates lifecycle', async () => {
    if (skipIfSetupBlocked(context)) {
      return
    }

    const suffix = randomSuffix().replace(/[^0-9]/g, '')
    const currentYear = new Date().getUTCFullYear()

    const pollResponse = await suite.api.post(
      '/api/v1/polls',
      {
        title: `Sunday Event ${suffix}`,
        description: 'Should we host a residents event this weekend?',
        multipleChoice: false,
        expiresAt: futureIso(5),
        options: ['Yes', 'No']
      },
      context.adminSession.accessToken
    )
    ensureExpectedStatus(pollResponse, [200], 'POST', '/api/v1/polls')
    const pollId = pollResponse.body.data.id

    const activatePollResponse = await suite.api.post(`/api/v1/polls/${pollId}/activate`, {}, context.adminSession.accessToken)
    ensureExpectedStatus(activatePollResponse, [200], 'POST', '/api/v1/polls/{id}/activate')
    expect(activatePollResponse.body.data.status).toBe('ACTIVE')

    const pollDetailsResponse = await suite.api.get(`/api/v1/polls/${pollId}`, context.residentSession.accessToken)
    ensureExpectedStatus(pollDetailsResponse, [200], 'GET', '/api/v1/polls/{id}')
    const firstOptionId = pollDetailsResponse.body.data.options[0].id

    const voteResponse = await suite.api.post(
      `/api/v1/polls/${pollId}/vote`,
      { optionId: firstOptionId },
      context.residentSession.accessToken
    )
    ensureExpectedStatus(voteResponse, [200], 'POST', '/api/v1/polls/{id}/vote')

    const pollResultsResponse = await suite.api.get(`/api/v1/polls/${pollId}/results`, context.residentSession.accessToken)
    ensureExpectedStatus(pollResultsResponse, [200], 'GET', '/api/v1/polls/{id}/results')
    expect(pollResultsResponse.body.data.totalVotes).toBeGreaterThanOrEqual(1)

    const newsletterResponse = await suite.api.post(
      '/api/v1/newsletters',
      {
        title: `Monthly Digest ${suffix}`,
        content: 'Highlights of this month.',
        summary: 'Month in review',
        fileUrl: `https://files.shieldguard.test/newsletter-${suffix}.pdf`,
        year: currentYear,
        month: 2
      },
      context.adminSession.accessToken
    )
    ensureExpectedStatus(newsletterResponse, [200], 'POST', '/api/v1/newsletters')
    const newsletterId = newsletterResponse.body.data.id

    const publishNewsletterResponse = await suite.api.post(
      `/api/v1/newsletters/${newsletterId}/publish`,
      {},
      context.adminSession.accessToken
    )
    ensureExpectedStatus(publishNewsletterResponse, [200], 'POST', '/api/v1/newsletters/{id}/publish')
    expect(publishNewsletterResponse.body.data.status).toBe('PUBLISHED')

    const newslettersByYearResponse = await suite.api.get(
      `/api/v1/newsletters/year/${currentYear}?page=0&size=10`,
      context.residentSession.accessToken
    )
    ensureExpectedStatus(newslettersByYearResponse, [200], 'GET', '/api/v1/newsletters/year/{year}')
    expect((newslettersByYearResponse.body.data?.content || []).length).toBeGreaterThanOrEqual(1)

    const sendNotificationResponse = await suite.api.post(
      '/api/v1/notifications/send',
      {
        recipients: [context.residentUser.email],
        subject: `Reminder ${suffix}`,
        body: 'Please check your monthly notice board.'
      },
      context.adminSession.accessToken
    )
    ensureExpectedStatus(sendNotificationResponse, [200], 'POST', '/api/v1/notifications/send')

    const notificationsListResponse = await suite.api.get('/api/v1/notifications?page=0&size=20', context.residentSession.accessToken)
    ensureExpectedStatus(notificationsListResponse, [200], 'GET', '/api/v1/notifications')
    expect((notificationsListResponse.body.data?.content || []).length).toBeGreaterThanOrEqual(1)
    const notificationId = notificationsListResponse.body.data.content[0].id

    const unreadBeforeResponse = await suite.api.get('/api/v1/notifications/unread-count', context.residentSession.accessToken)
    ensureExpectedStatus(unreadBeforeResponse, [200], 'GET', '/api/v1/notifications/unread-count')
    expect(unreadBeforeResponse.body.data).toBeGreaterThanOrEqual(1)

    const markReadResponse = await suite.api.post(
      `/api/v1/notifications/${notificationId}/mark-read`,
      {},
      context.residentSession.accessToken
    )
    ensureExpectedStatus(markReadResponse, [200], 'POST', '/api/v1/notifications/{id}/mark-read')

    const markAllReadResponse = await suite.api.post('/api/v1/notifications/mark-all-read', {}, context.residentSession.accessToken)
    ensureExpectedStatus(markAllReadResponse, [200], 'POST', '/api/v1/notifications/mark-all-read')

    const unreadAfterResponse = await suite.api.get('/api/v1/notifications/unread-count', context.residentSession.accessToken)
    ensureExpectedStatus(unreadAfterResponse, [200], 'GET', '/api/v1/notifications/unread-count')
    expect(unreadAfterResponse.body.data).toBe(0)

    const preferenceResponse = await suite.api.put(
      '/api/v1/notification-preferences',
      { emailEnabled: true },
      context.residentSession.accessToken
    )
    ensureExpectedStatus(preferenceResponse, [200], 'PUT', '/api/v1/notification-preferences')

    const unauthAnnouncementCreateResponse = await suite.api.post('/api/v1/announcements', {
      title: `Unauthorized ${suffix}`,
      content: 'No auth must fail',
      category: 'GENERAL',
      priority: 'LOW',
      emergency: false,
      targetAudience: 'ALL'
    })
    ensureExpectedStatus(unauthAnnouncementCreateResponse, [401, 403], 'POST', '/api/v1/announcements')
  })
})

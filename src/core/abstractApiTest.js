const { ShieldApiClient } = require('../clients/shieldApiClient');
const { loadConfig } = require('../config/env');
const { ensureRuntimeReady, releaseRuntime } = require('./shieldRuntimeManager');

// Base harness that keeps each suite focused on business flow assertions.
class AbstractApiTest {
  constructor() {
    this.config = loadConfig();
    this.api = new ShieldApiClient(this.config.baseUrl);
  }

  async setup() {
    await ensureRuntimeReady(this.config);
  }

  async teardown() {
    await releaseRuntime(this.config);
  }

  expectApiSuccess(response, statusCode = 200) {
    expect(response.status).toBe(statusCode);
    expect(response.body).toBeDefined();
    expect(response.body.success).toBe(true);
  }

  expectApiSuccessWithData(response, statusCode = 200) {
    this.expectApiSuccess(response, statusCode);
    expect(response.body.data).toBeDefined();
  }

  expectApiFailure(response, statusCode) {
    expect(response.status).toBe(statusCode);
    expect(response.body).toBeDefined();
    expect(response.body.success).toBe(false);
  }

  expectAuthRejected(response) {
    expect([401, 403]).toContain(response.status);
  }

  extractData(response) {
    return response.body?.data;
  }
}

module.exports = {
  AbstractApiTest
};

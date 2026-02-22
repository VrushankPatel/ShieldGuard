const supertest = require('supertest');

class ShieldApiClient {
  constructor(baseUrl) {
    this.client = supertest(baseUrl);
  }

  get(path, accessToken) {
    let request = this.client.get(path).set('Accept', 'application/json');
    if (accessToken) {
      request = request.set('Authorization', `Bearer ${accessToken}`);
    }
    return request;
  }

  post(path, body, accessToken) {
    let request = this.client
      .post(path)
      .set('Accept', 'application/json')
      .set('Content-Type', 'application/json');

    if (accessToken) {
      request = request.set('Authorization', `Bearer ${accessToken}`);
    }

    return request.send(body || {});
  }

  put(path, body, accessToken) {
    let request = this.client
      .put(path)
      .set('Accept', 'application/json')
      .set('Content-Type', 'application/json');

    if (accessToken) {
      request = request.set('Authorization', `Bearer ${accessToken}`);
    }

    return request.send(body || {});
  }
}

module.exports = {
  ShieldApiClient
};

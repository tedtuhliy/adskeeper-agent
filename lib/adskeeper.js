'use strict';
const fetch = require('node-fetch');
const BASE = 'https://api.adskeeper.com/v1';

class AdskeeperApi {
  constructor(token, clientId) {
    this.token = token || process.env.ADSKEEPER_API_TOKEN;
    this.clientId = clientId || process.env.ADSKEEPER_CLIENT_ID;
    if (!this.token) throw new Error('ADSKEEPER_API_TOKEN missing');
    if (!this.clientId) throw new Error('ADSKEEPER_CLIENT_ID missing');
  }

  async _req(method, path, data, isJson = false) {
    const url = `${BASE}/${path.replace(/^\//, '')}`;
    const headers = {
      'Authorization': `Bearer ${this.token}`,
      'Accept': 'application/json',
    };
    let body;
    if (data) {
      if (isJson) {
        headers['Content-Type'] = 'application/json';
        body = JSON.stringify(data);
      } else {
        headers['Content-Type'] = 'application/x-www-form-urlencoded';
        body = new URLSearchParams(data).toString();
      }
    }
    const res = await fetch(url, { method, headers, body });
    const text = await res.text();
    let json;
    try { json = JSON.parse(text); } catch { json = { _raw: text.slice(0, 300) }; }
    if (res.status >= 400) {
      const msg = Array.isArray(json?.errors) ? json.errors.join(', ') : (json?.message || json?.error || `HTTP ${res.status}`);
      throw Object.assign(new Error(msg), { status: res.status, body: json });
    }
    return json;
  }

  getClientInfo() {
    return this._req('GET', `clients/${this.clientId}`);
  }

  getCampaigns(campaignId) {
    const ep = campaignId
      ? `goodhits/clients/${this.clientId}/campaigns/${campaignId}`
      : `goodhits/clients/${this.clientId}/campaigns`;
    return this._req('GET', ep);
  }

  async getAllCampaigns() {
    const limit = 100;
    let offset = 0, all = [];
    while (true) {
      const r = await this._req('GET', `goodhits/clients/${this.clientId}/campaigns?limit=${limit}&offset=${offset}`);
      const items = r?.items || r?.data || (Array.isArray(r) ? r : []);
      all = all.concat(items);
      if (items.length < limit) break;
      offset += limit;
    }
    return all;
  }

  createCampaign(data) {
    return this._req('POST', `goodhits/clients/${this.clientId}/campaigns`, data, false);
  }

  patchCampaign(campaignId, data) {
    return this._req('PATCH', `goodhits/clients/${this.clientId}/campaigns/${campaignId}`, data, true);
  }

  pauseCampaign(campaignId) {
    return this._req('PATCH', `goodhits/clients/${this.clientId}/campaigns/${campaignId}`, { whetherToBlockByClient: 1 }, true);
  }

  resumeCampaign(campaignId) {
    return this._req('PATCH', `goodhits/clients/${this.clientId}/campaigns/${campaignId}`, { whetherToBlockByClient: 0 }, true);
  }

  setOsTargeting(campaignId, targets = ['windowsos', 'macos', 'linuxos']) {
    return this._req('PUT', `goodhits/campaigns/${campaignId}/targetings/operatingsystems`,
      { enabledFlag: 1, targets: `include,${targets.join(',')}` }, false);
  }

  setConversions(campaignId, targetId, cpa = 5.0) {
    return this._req('POST', `goodhits/campaigns/${campaignId}/conversions`,
      { stages: { buy: { id: targetId, cpa, unique: true } } }, true);
  }

  getTeasers(campaignId) {
    const ep = campaignId
      ? `goodhits/clients/${this.clientId}/teasers?campaignId=${campaignId}`
      : `goodhits/clients/${this.clientId}/teasers`;
    return this._req('GET', ep);
  }

  createTeaser(data) {
    return this._req('POST', `goodhits/clients/${this.clientId}/teasers`, data, false);
  }

  patchTeaser(teaserId, data) {
    return this._req('PATCH', `goodhits/clients/${this.clientId}/teasers/${teaserId}`, data, true);
  }

  deleteTeaser(teaserId) {
    return this._req('DELETE', `goodhits/clients/${this.clientId}/teasers/${teaserId}`);
  }

  blockWidgets(campaignId, widgetIds) {
    const filter = {};
    widgetIds.forEach(id => { filter[id] = []; });
    return this._req('PATCH', `goodhits/campaigns/${campaignId}`,
      { widgetsFilterUid: JSON.stringify(filter) }, true);
  }

  boostWidget(campaignId, widgetId, coef) {
    return this._req('PATCH', `goodhits/campaigns/${campaignId}`,
      { widgetQualityFactor: JSON.stringify({ [widgetId]: coef }) }, true);
  }

  getModerationCount() {
    return this._req('GET', `goodhits/clients/${this.clientId}/teasers?status=moderation&limit=1`);
  }

  getStatistics(campaignId, dateFrom, dateTo) {
    return this._req('GET', `goodhits/campaigns/${campaignId}/statistics?dateFrom=${dateFrom}&dateTo=${dateTo}`);
  }
}

module.exports = AdskeeperApi;

'use strict';
const fetch = require('node-fetch');

const BASE = 'https://api.luckyfeed.pro/v5';
const SOURCE_ADSKEEPER = 44;
const SOURCE_MGID = 19;

class LuckyFeedApi {
  constructor(key) {
    this.key = key || process.env.LUCKY_KEY;
  }

  async _req(params, retries = 3) {
    const qs = new URLSearchParams(params).toString();
    const url = `${BASE}/stats/full?${qs}`;
    for (let i = 0; i < retries; i++) {
      const r = await fetch(url, { headers: { 'Authorization': `Bearer ${this.key}` } });
      if (r.status === 429) { await new Promise(x => setTimeout(x, 35000)); continue; }
      const data = await r.json();
      return data?.data || [];
    }
    return [];
  }

  async fetchBySource(sourceId, country, dateFrom, dateTo) {
    const all = [];
    let page = 1;
    while (true) {
      const params = {
        'groups[]': 'subid2',
        'filters[traffic_source_id]': sourceId,
        'filters[wallet_currency]': 'USD',
        'filters[date_from]': dateFrom,
        'filters[date_to]': dateTo,
        count: 200, page,
      };
      if (country) params['filters[country_code]'] = country;
      const rows = await this._req(params);
      if (!rows.length) break;
      all.push(...rows);
      if (rows.length < 200) break;
      page++;
    }
    // Deduplicate: keep max ad_clicks per widget_id
    const map = {};
    for (const r of all) {
      const wid = r.subid2 || r.widget_id;
      if (!wid) continue;
      if (!map[wid] || (r.ad_clicks || 0) > (map[wid].ad_clicks || 0)) map[wid] = r;
    }
    return Object.values(map);
  }

  async fetchToday(sourceId, country) {
    const today = new Date().toISOString().slice(0, 10);
    return this.fetchBySource(sourceId, country, today, today);
  }

  async fetchRange(sourceId, country, dateFrom, dateTo) {
    return this.fetchBySource(sourceId, country, dateFrom, dateTo);
  }
}

module.exports = { LuckyFeedApi, SOURCE_ADSKEEPER, SOURCE_MGID };

'use strict';
const AdskeeperApi = require('./adskeeper');
const { floorInsert } = require('./db');
const { applyBlacklistToCampaign } = require('./blacklist');

const ACCOUNTS = {
  848676: { token: process.env.ADSKEEPER_TOKEN_848, targetId: 1273954 },
  849458: { token: process.env.ADSKEEPER_TOKEN_849, targetId: 1274133 },
};

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function runCreationPipeline(campaigns) {
  const results = [];
  for (const c of campaigns) {
    const { campaign_id, account_id, country, cpc_cents, name } = c;
    const acc = ACCOUNTS[account_id];
    if (!acc?.token) {
      results.push({ campaign_id, error: `No token for account ${account_id}` });
      continue;
    }
    const api = new AdskeeperApi(acc.token, account_id);
    const steps = {};

    // 1. Insert CPC floor into DB
    try {
      floorInsert(campaign_id, account_id, country, cpc_cents, name);
      steps.floor = 'ok';
    } catch (e) { steps.floor = `error: ${e.message}`; }

    // 2. OS Targeting (desktop only)
    try {
      await api.setOsTargeting(campaign_id);
      steps.os = 'ok';
      await sleep(200);
    } catch (e) { steps.os = `error: ${e.message}`; }

    // 3. Conversions/Postback
    try {
      await api.setConversions(campaign_id, acc.targetId, 5.0);
      steps.conversions = 'ok';
      await sleep(200);
    } catch (e) { steps.conversions = `error: ${e.message}`; }

    // 4. Apply blacklist (global + geo)
    try {
      const bl = await applyBlacklistToCampaign(api, campaign_id, country);
      steps.blacklist = `ok: ${bl.applied} widgets blocked`;
      await sleep(300);
    } catch (e) { steps.blacklist = `error: ${e.message}`; }

    results.push({ campaign_id, name, country, steps });
  }
  return results;
}

module.exports = { runCreationPipeline, ACCOUNTS };

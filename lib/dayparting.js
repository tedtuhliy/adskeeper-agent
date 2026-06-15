'use strict';
const AdskeeperApi = require('./adskeeper');
const { ACCOUNTS } = require('./pipeline');

// MSK = UTC+3
function getMskHour() {
  return (new Date().getUTCHours() + 3) % 24;
}

function isWorkingHours() {
  const h = getMskHour();
  return h >= 9 && h < 19;
}

function getScheduleStatus() {
  const h = getMskHour();
  const working = h >= 9 && h < 19;
  const nextEvent = working
    ? { action: 'stop',  msk: '19:00', hoursLeft: 19 - h }
    : { action: 'start', msk: '09:00', hoursLeft: h < 9 ? 9 - h : 24 - h + 9 };
  return { msk_hour: h, working, next: nextEvent };
}

async function pauseAllCampaigns() {
  const results = [];
  for (const [accId, acc] of Object.entries(ACCOUNTS)) {
    if (!acc.token) continue;
    const api = new AdskeeperApi(acc.token, accId);
    try {
      const camps = await api.getAllCampaigns();
      for (const c of camps) {
        // Skip already client-blocked (4) and platform-blocked
        if ([4, 14, 13, 15, 19].includes(c.status)) continue;
        await api.pauseCampaign(c.id);
        results.push({ id: c.id, account: accId, action: 'paused' });
        await new Promise(r => setTimeout(r, 150));
      }
    } catch (e) {
      results.push({ account: accId, error: e.message });
    }
  }
  return results;
}

async function resumeAllCampaigns() {
  const results = [];
  for (const [accId, acc] of Object.entries(ACCOUNTS)) {
    if (!acc.token) continue;
    const api = new AdskeeperApi(acc.token, accId);
    try {
      const camps = await api.getAllCampaigns();
      for (const c of camps) {
        // Resume only client-blocked ones (status 4)
        if (c.status !== 4) continue;
        await api.resumeCampaign(c.id);
        results.push({ id: c.id, account: accId, action: 'resumed' });
        await new Promise(r => setTimeout(r, 150));
      }
    } catch (e) {
      results.push({ account: accId, error: e.message });
    }
  }
  return results;
}

module.exports = { getMskHour, isWorkingHours, getScheduleStatus, pauseAllCampaigns, resumeAllCampaigns };

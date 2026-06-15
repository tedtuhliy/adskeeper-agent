'use strict';
const data = require('../data/blacklists.json');

/**
 * Returns the combined widget blacklist for a given geo.
 * Merges: global IDs + geo-specific IDs + exceptions (bad_geos match) + low CTR IDs
 */
function getBlacklist(country) {
  const cc = (country || '').toUpperCase();
  const ids = new Set();

  // Global
  (data.global || []).forEach(id => ids.add(String(id)));

  // Geo-specific
  (data.geo[cc] || []).forEach(id => ids.add(String(id)));

  // Exceptions: if this geo is in bad_geos for a widget
  (data.exceptions || []).forEach(ex => {
    if ((ex.bad_geos || []).includes(cc)) ids.add(String(ex.id));
  });

  return [...ids];
}

/**
 * Returns widget IDs with 0 CTR (low_ctr list) — use to pre-block on new campaigns
 */
function getLowCtrList() {
  return data.low_ctr || [];
}

/**
 * Returns geo-specific exceptions info for a widget
 */
function getWidgetExceptions(widgetId) {
  return (data.exceptions || []).find(e => String(e.id) === String(widgetId));
}

/**
 * Apply blacklist to a campaign via Adskeeper API
 * Blocks global + geo + exceptions combined
 */
async function applyBlacklistToCampaign(api, campaignId, country) {
  const ids = getBlacklist(country);
  if (!ids.length) return { applied: 0 };
  await api.blockWidgets(campaignId, ids);
  return { applied: ids.length, country };
}

module.exports = { getBlacklist, getLowCtrList, getWidgetExceptions, applyBlacklistToCampaign };

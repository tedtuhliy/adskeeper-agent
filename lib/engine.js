'use strict';

const SYSTEM_FLOORS = {
  GR: 1.5, PT: 1.5, BG: 1.5, SK: 1.5, RS: 1.0, SI: 1.5,
  TR: 1.0, HR: 1.0, DE: 2.0, AT: 2.0, CH: 2.0, FR: 2.0,
  BE: 2.0, RO: 1.5, ES: 2.0, IT: 1.5, LV: 1.5, BA: 1.5,
  GB: 4.5, CZ: 1.5, HU: 1.5, NL: 2.0,
};

const THRESHOLDS = {
  MIN_VISITS_PROBIV: 20,
  MIN_CLICKS_LEADS: 1000,
  MIN_VISITS_EPC: 1000,
  MIN_VISITS_BOOST: 100,
  PROBIV_MIN_PCT: 25.0,
};

function decide(stat, campaignBidCents, country) {
  const systemFloorCents = SYSTEM_FLOORS[country] || 1.5;
  const visits = Math.max(0, stat.visits || 0);
  const clicks = Math.max(0, stat.clicks || 0);
  const leads = Math.max(0, stat.leads || 0);
  const revenue = Math.max(0, stat.revenue_usd || 0);

  const rpv = visits > 0 ? revenue / visits : 0;
  const rpvCents = rpv * 100;
  const probiv = visits > 0 ? (clicks * 100.0 / visits) : 0;
  const sysFloor = systemFloorCents / 100;
  const campaignBid = campaignBidCents / 100;

  if (visits >= THRESHOLDS.MIN_VISITS_PROBIV && probiv < THRESHOLDS.PROBIV_MIN_PCT) {
    return { action: 'block', reason: `Пробив ${probiv.toFixed(1)}% < 25% при ${visits} визитах`, coef: null };
  }
  if (clicks >= THRESHOLDS.MIN_CLICKS_LEADS && leads === 0) {
    return { action: 'block', reason: `${clicks} кликов — 0 лидов`, coef: null };
  }
  if (visits >= THRESHOLDS.MIN_VISITS_EPC && rpv < sysFloor) {
    return { action: 'block', reason: `RpV ${rpvCents.toFixed(3)}¢ < sys.floor ${systemFloorCents}¢`, coef: null };
  }
  if (visits >= THRESHOLDS.MIN_VISITS_EPC && rpv >= sysFloor && rpv < campaignBid) {
    const coef = Math.max(sysFloor / campaignBid, Math.min(1.0, rpv / campaignBid));
    return { action: 'boost', reason: `RpV ${rpvCents.toFixed(3)}¢ → QF=${coef.toFixed(4)}`, coef: parseFloat(coef.toFixed(4)) };
  }
  if (visits >= THRESHOLDS.MIN_VISITS_BOOST && rpv >= campaignBid && leads > 0) {
    const targetBid = rpv / 2.0;
    const coef = Math.min(2.0, targetBid / campaignBid);
    return { action: 'boost', reason: `RpV ${rpvCents.toFixed(2)}¢ ≥ bid → коэф ${coef.toFixed(4)}`, coef: parseFloat(coef.toFixed(4)) };
  }
  return { action: 'ok', reason: 'Недостаточно данных', coef: null };
}

module.exports = { decide, SYSTEM_FLOORS };

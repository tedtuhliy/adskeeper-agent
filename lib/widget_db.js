'use strict';
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_DIR = process.env.DB_PATH || path.join(__dirname, '../db');
if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

let _wdb;
function wdb() {
  if (_wdb) return _wdb;
  _wdb = new Database(path.join(DB_DIR, 'widget_stats.db'));
  _wdb.pragma('journal_mode = WAL');
  _wdb.exec(`
    CREATE TABLE IF NOT EXISTS widget_stats(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      widget_id TEXT NOT NULL,
      country TEXT NOT NULL,
      source_id INTEGER NOT NULL DEFAULT 44,
      visits INTEGER DEFAULT 0,
      clicks INTEGER DEFAULT 0,
      leads INTEGER DEFAULT 0,
      revenue_usd REAL DEFAULT 0,
      date_from TEXT,
      date_to TEXT,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(widget_id, country, source_id));

    CREATE TABLE IF NOT EXISTS widget_stats_today(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      widget_id TEXT NOT NULL,
      country TEXT NOT NULL,
      source_id INTEGER NOT NULL DEFAULT 44,
      visits INTEGER DEFAULT 0,
      clicks INTEGER DEFAULT 0,
      leads INTEGER DEFAULT 0,
      revenue_usd REAL DEFAULT 0,
      synced_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(widget_id, country, source_id));

    CREATE TABLE IF NOT EXISTS widget_spend(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      widget_id TEXT NOT NULL,
      account_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      spend_usd REAL DEFAULT 0,
      clicks INTEGER DEFAULT 0,
      UNIQUE(widget_id, account_id, date));

    CREATE TABLE IF NOT EXISTS campaign_cpc_floors(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id INTEGER UNIQUE,
      account_id INTEGER,
      country TEXT,
      cpc_cents REAL,
      campaign_name TEXT,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP);

    CREATE TABLE IF NOT EXISTS widget_decisions(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      widget_id TEXT NOT NULL,
      country TEXT NOT NULL,
      action TEXT NOT NULL,
      coef REAL,
      reason TEXT,
      applied INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(widget_id, country));

    CREATE TABLE IF NOT EXISTS campaign_widget_decisions(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id INTEGER,
      widget_id TEXT,
      action TEXT,
      coef REAL,
      reason TEXT,
      applied INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(campaign_id, widget_id));

    CREATE TABLE IF NOT EXISTS applied_log(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      widget_id TEXT,
      campaign_id INTEGER,
      country TEXT,
      action TEXT,
      coef REAL,
      applied_at TEXT DEFAULT CURRENT_TIMESTAMP);

    CREATE VIEW IF NOT EXISTS widget_stats_v AS
      SELECT widget_id, country, source_id,
        SUM(visits) as visits, SUM(clicks) as clicks,
        SUM(leads) as leads, SUM(revenue_usd) as revenue_usd
      FROM (
        SELECT widget_id, country, source_id, visits, clicks, leads, revenue_usd FROM widget_stats
        UNION ALL
        SELECT widget_id, country, source_id, visits, clicks, leads, revenue_usd FROM widget_stats_today
      ) GROUP BY widget_id, country, source_id;
  `);
  return _wdb;
}

function upsertStats(rows, dateFrom, dateTo, sourceId = 44) {
  const stmt = wdb().prepare(`INSERT INTO widget_stats(widget_id,country,source_id,visits,clicks,leads,revenue_usd,date_from,date_to,updated_at)
    VALUES(@widget_id,@country,@source_id,@visits,@clicks,@leads,@revenue_usd,@date_from,@date_to,CURRENT_TIMESTAMP)
    ON CONFLICT(widget_id,country,source_id) DO UPDATE SET
      visits=MAX(visits,excluded.visits), clicks=MAX(clicks,excluded.clicks),
      leads=MAX(leads,excluded.leads), revenue_usd=MAX(revenue_usd,excluded.revenue_usd),
      date_from=excluded.date_from, date_to=excluded.date_to, updated_at=CURRENT_TIMESTAMP`);
  const insert = wdb().transaction(items => { for (const r of items) stmt.run(r); });
  insert(rows.map(r => ({
    widget_id: String(r.subid2 || r.widget_id || ''),
    country: r.country_code || r.country || '',
    source_id: sourceId,
    visits: parseInt(r.ad_shows || r.visits || 0),
    clicks: parseInt(r.ad_clicks || r.clicks || 0),
    leads: parseInt(r.leads || 0),
    revenue_usd: parseFloat(r.revenue || r.revenue_usd || 0),
    date_from: dateFrom,
    date_to: dateTo,
  })));
}

function upsertTodayStats(rows, sourceId = 44) {
  const stmt = wdb().prepare(`INSERT INTO widget_stats_today(widget_id,country,source_id,visits,clicks,leads,revenue_usd,synced_at)
    VALUES(@widget_id,@country,@source_id,@visits,@clicks,@leads,@revenue_usd,CURRENT_TIMESTAMP)
    ON CONFLICT(widget_id,country,source_id) DO UPDATE SET
      visits=excluded.visits, clicks=excluded.clicks, leads=excluded.leads,
      revenue_usd=excluded.revenue_usd, synced_at=CURRENT_TIMESTAMP`);
  const insert = wdb().transaction(items => { for (const r of items) stmt.run(r); });
  insert(rows.map(r => ({
    widget_id: String(r.subid2 || r.widget_id || ''),
    country: r.country_code || r.country || '',
    source_id: sourceId,
    visits: parseInt(r.ad_shows || r.visits || 0),
    clicks: parseInt(r.ad_clicks || r.clicks || 0),
    leads: parseInt(r.leads || 0),
    revenue_usd: parseFloat(r.revenue || r.revenue_usd || 0),
  })));
}

function getAnalytics(country, sourceId, dateMode) {
  // Returns aggregated widget stats for analytics
  const where = [];
  const params = {};
  if (country) { where.push("country=@country"); params.country = country; }
  if (sourceId) { where.push("source_id=@source_id"); params.source_id = sourceId; }
  const wh = where.length ? 'WHERE ' + where.join(' AND ') : '';
  
  return wdb().prepare(`
    SELECT widget_id, country, source_id,
      SUM(visits) as visits, SUM(clicks) as clicks,
      SUM(leads) as leads, SUM(revenue_usd) as revenue_usd
    FROM widget_stats_v ${wh}
    GROUP BY widget_id, country
    ORDER BY revenue_usd DESC
  `).all(params);
}

function getSpend(dateFrom, dateTo, accountId) {
  const where = ['date>=@df AND date<=@dt'];
  const params = { df: dateFrom, dt: dateTo };
  if (accountId) { where.push('account_id=@account_id'); params.account_id = accountId; }
  return wdb().prepare(`SELECT widget_id, SUM(spend_usd) as spend_usd, SUM(clicks) as clicks
    FROM widget_spend WHERE ${where.join(' AND ')} GROUP BY widget_id`).all(params);
}

function upsertSpend(widgetId, accountId, date, spendUsd, clicks) {
  wdb().prepare(`INSERT INTO widget_spend(widget_id,account_id,date,spend_usd,clicks)
    VALUES(?,?,?,?,?) ON CONFLICT(widget_id,account_id,date) DO UPDATE SET
    spend_usd=spend_usd+excluded.spend_usd, clicks=clicks+excluded.clicks`)
    .run(widgetId, accountId, date, spendUsd, clicks);
}

function saveDecision(widgetId, country, action, coef, reason) {
  wdb().prepare(`INSERT INTO widget_decisions(widget_id,country,action,coef,reason,applied,created_at)
    VALUES(?,?,?,?,?,0,CURRENT_TIMESTAMP) ON CONFLICT(widget_id,country) DO UPDATE SET
    action=excluded.action, coef=excluded.coef, reason=excluded.reason, applied=0, created_at=CURRENT_TIMESTAMP`)
    .run(widgetId, country, action, coef, reason);
}

function getPendingDecisions(country) {
  const where = country ? 'WHERE country=? AND applied=0' : 'WHERE applied=0';
  const params = country ? [country] : [];
  return wdb().prepare(`SELECT * FROM widget_decisions ${where} ORDER BY country, action`).all(...params);
}

function markApplied(widgetId, country) {
  wdb().prepare("UPDATE widget_decisions SET applied=1 WHERE widget_id=? AND country=?").run(widgetId, country);
}

function getDbStats() {
  const d = wdb();
  return {
    widget_stats: d.prepare("SELECT COUNT(*) as c FROM widget_stats").get().c,
    widget_stats_today: d.prepare("SELECT COUNT(*) as c FROM widget_stats_today").get().c,
    widget_spend: d.prepare("SELECT COUNT(*) as c FROM widget_spend").get().c,
    pending_decisions: d.prepare("SELECT COUNT(*) as c FROM widget_decisions WHERE applied=0").get().c,
  };
}

module.exports = { wdb, upsertStats, upsertTodayStats, getAnalytics, getSpend, upsertSpend, saveDecision, getPendingDecisions, markApplied, getDbStats };

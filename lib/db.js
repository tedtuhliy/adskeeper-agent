'use strict';
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_DIR = process.env.DB_PATH || path.join(__dirname, '../db');
if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

let _db;
function db() {
  if (_db) return _db;
  _db = new Database(path.join(DB_DIR, 'agent.db'));
  _db.pragma('journal_mode = WAL');
  _db.exec(`
    CREATE TABLE IF NOT EXISTS sessions(
      id TEXT PRIMARY KEY,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP);

    CREATE TABLE IF NOT EXISTS messages(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE INDEX IF NOT EXISTS idx_msg_sess ON messages(session_id, id);

    CREATE TABLE IF NOT EXISTS drafts(
      session_id TEXT PRIMARY KEY,
      geo TEXT, pool TEXT, article_id INTEGER, theme TEXT,
      url TEXT, titles_json TEXT, status TEXT DEFAULT 'collecting',
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP);

    CREATE TABLE IF NOT EXISTS created_campaigns(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT, geo TEXT, campaign_id INTEGER,
      name TEXT, teaser_ids_json TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP);

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
      campaign_id INTEGER,
      widget_id TEXT,
      action TEXT,
      coef REAL,
      reason TEXT,
      applied INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE INDEX IF NOT EXISTS idx_wd ON widget_decisions(campaign_id, widget_id);
  `);
  return _db;
}

// ── Sessions ─────────────────────────────────────────────────────────────────
function sessionTouch(sid) {
  db().prepare("INSERT OR IGNORE INTO sessions(id) VALUES(?)").run(sid);
  db().prepare("UPDATE sessions SET updated_at=CURRENT_TIMESTAMP WHERE id=?").run(sid);
}

// ── Messages ──────────────────────────────────────────────────────────────────
function msgAdd(sid, role, content) {
  sessionTouch(sid);
  db().prepare("INSERT INTO messages(session_id,role,content) VALUES(?,?,?)").run(sid, role, content);
}

function msgHistory(sid, limit = 20) {
  return db().prepare("SELECT role,content FROM messages WHERE session_id=? ORDER BY id DESC LIMIT ?")
    .all(sid, limit).reverse();
}

// ── Drafts ────────────────────────────────────────────────────────────────────
function draftGet(sid) {
  const row = db().prepare("SELECT * FROM drafts WHERE session_id=?").get(sid) || {};
  row.titles = row.titles_json ? JSON.parse(row.titles_json) : [];
  return row;
}

function draftSave(sid, patch) {
  sessionTouch(sid);
  const cur = draftGet(sid);
  const merged = { ...cur, ...patch };
  if (patch.titles) merged.titles_json = JSON.stringify(patch.titles);
  const fields = ['geo', 'pool', 'article_id', 'theme', 'url', 'titles_json', 'status'];
  const exists = db().prepare("SELECT 1 FROM drafts WHERE session_id=?").get(sid);
  if (exists) {
    const set = fields.map(f => `${f}=@${f}`).join(',');
    db().prepare(`UPDATE drafts SET ${set},updated_at=CURRENT_TIMESTAMP WHERE session_id=@session_id`)
      .run({ ...merged, session_id: sid });
  } else {
    const cols = ['session_id', ...fields].join(',');
    const phs = ['@session_id', ...fields.map(f => `@${f}`)].join(',');
    db().prepare(`INSERT INTO drafts(${cols}) VALUES(${phs})`)
      .run({ ...merged, session_id: sid });
  }
}

function draftClear(sid) {
  db().prepare("DELETE FROM drafts WHERE session_id=?").run(sid);
}

// ── Campaigns ─────────────────────────────────────────────────────────────────
function campaignRecord(sid, geo, campId, name, teaserIds) {
  db().prepare("INSERT INTO created_campaigns(session_id,geo,campaign_id,name,teaser_ids_json) VALUES(?,?,?,?,?)")
    .run(sid, geo, campId, name, JSON.stringify(teaserIds));
}

function recentCampaigns(sid, limit = 10) {
  return db().prepare("SELECT geo,campaign_id,name,teaser_ids_json,created_at FROM created_campaigns WHERE session_id=? ORDER BY id DESC LIMIT ?")
    .all(sid, limit);
}

// ── CPC Floors ────────────────────────────────────────────────────────────────
function floorInsert(campaignId, accountId, country, cpcCents, name) {
  db().prepare(`INSERT OR REPLACE INTO campaign_cpc_floors(campaign_id,account_id,country,cpc_cents,campaign_name,updated_at)
    VALUES(?,?,?,?,?,CURRENT_TIMESTAMP)`).run(campaignId, accountId, country, cpcCents, name);
}

module.exports = { db, sessionTouch, msgAdd, msgHistory, draftGet, draftSave, draftClear, campaignRecord, recentCampaigns, floorInsert };

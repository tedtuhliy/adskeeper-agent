'use strict';
const express = require('express');
const path    = require('path');
const fetch   = require('node-fetch');
const AdskeeperApi = require('./lib/adskeeper');
const { msgAdd, msgHistory, draftGet, draftSave, draftClear, campaignRecord, recentCampaigns } = require('./lib/db');
const { runCreationPipeline, ACCOUNTS } = require('./lib/pipeline');

const streams   = require('./data/streams.json');
const geoOffers = require('./data/geo_offers.json');

const PORT = process.env.PORT || 8080;

const GEO_CONFIG = {
  SK: { lang: 27, adv: 'ZdraveTypy',          cpc: 1.5, account: 848676 },
  CZ: { lang: 24, adv: 'ZdraviPriroda',        cpc: 1.5, account: 848676 },
  HU: { lang: 15, adv: 'EgeszsegesElet',        cpc: 1.5, account: 848676 },
  SI: { lang: 30, adv: 'ZdravaSlove',           cpc: 1.5, account: 848676 },
  RO: { lang: 17, adv: 'SanatateNaturala',      cpc: 1.5, account: 848676 },
  BG: { lang: 29, adv: 'ZdraveSaveti',          cpc: 1.5, account: 848676 },
  GR: { lang: 10, adv: 'YgeiaTips',             cpc: 1.5, account: 848676 },
  RS: { lang: 35, adv: 'ZdravstveniSaveti',     cpc: 1.0, account: 848676 },
  HR: { lang: 28, adv: 'ZdravljeSavjeti',       cpc: 1.5, account: 848676 },
  DE: { lang: 4,  adv: 'GesundheitTipps',       cpc: 3.0, account: 849458 },
  AT: { lang: 4,  adv: 'GesundheitTipps',       cpc: 3.0, account: 849458 },
  CH: { lang: 4,  adv: 'GesundheitTipps',       cpc: 3.0, account: 849458 },
  FR: { lang: 3,  adv: 'SanteNaturelle',        cpc: 2.0, account: 849458 },
  BE: { lang: 3,  adv: 'SanteNaturelle',        cpc: 2.0, account: 849458 },
  ES: { lang: 2,  adv: 'SaludNatural',          cpc: 2.0, account: 849458 },
  PT: { lang: 8,  adv: 'SaudeNatural',          cpc: 1.5, account: 849458 },
  NL: { lang: 16, adv: 'GezondheidTips',        cpc: 2.0, account: 849458 },
  IT: { lang: 7,  adv: 'SaluteNaturale',        cpc: 1.5, account: 849458 },
};

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/public', express.static(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname, 'public')));

function getApi(accountId) {
  const acc = ACCOUNTS[accountId] || ACCOUNTS[848676];
  if (!acc?.token) throw new Error(`No token for account ${accountId}`);
  return new AdskeeperApi(acc.token, accountId);
}

// ── Health ────────────────────────────────────────────────────────────────────
app.get('/health', (req, res) => res.json({ status: 'ok', service: 'adskeeper-agent' }));

// ── Adskeeper API proxy ───────────────────────────────────────────────────────
app.get('/api/campaigns', async (req, res) => {
  try {
    const accountId = parseInt(req.query.account || 848676);
    const api = getApi(accountId);
    const data = await api.getAllCampaigns();
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/campaigns/:id', async (req, res) => {
  try {
    const accountId = parseInt(req.query.account || 848676);
    const api = getApi(accountId);
    const data = await api.getCampaigns(req.params.id);
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/campaigns', async (req, res) => {
  try {
    const { account, ...data } = req.body;
    const accountId = parseInt(account || 848676);
    const api = getApi(accountId);
    const result = await api.createCampaign(data);
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.patch('/api/campaigns/:id', async (req, res) => {
  try {
    const accountId = parseInt(req.query.account || 848676);
    const api = getApi(accountId);
    const result = await api.patchCampaign(req.params.id, req.body);
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/teasers', async (req, res) => {
  try {
    const accountId = parseInt(req.query.account || 848676);
    const api = getApi(accountId);
    const data = await api.getTeasers(req.query.campaign_id);
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/teasers', async (req, res) => {
  try {
    const { account, ...data } = req.body;
    const accountId = parseInt(account || 848676);
    const api = getApi(accountId);
    const result = await api.createTeaser(data);
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/teasers/:id', async (req, res) => {
  try {
    const accountId = parseInt(req.query.account || 848676);
    const api = getApi(accountId);
    const result = await api.deleteTeaser(req.params.id);
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/status', async (req, res) => {
  try {
    const accountId = parseInt(req.query.account || 848676);
    const api = getApi(accountId);
    const r = await api.getModerationCount();
    const total = r?.total || 0;
    res.json({ moderation_full: total >= 100, count: total });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Streams catalog ───────────────────────────────────────────────────────────
app.get('/api/streams', (req, res) => {
  const { country, type } = req.query;
  let result = streams;
  if (country) result = result.filter(s => s.country === country.toUpperCase());
  if (type)    result = result.filter(s => s.type === type);
  res.json(result);
});

// ── Geo list ──────────────────────────────────────────────────────────────────
app.get('/api/geos', (req, res) => {
  const geos = Object.entries(GEO_CONFIG).map(([k, v]) => ({
    key: k, label: `${k} — ${v.adv} (${v.cpc}¢)`, account: v.account, cpc: v.cpc
  }));
  res.json(geos);
});

app.get('/api/geo-offers', (req, res) => {
  const { country } = req.query;
  if (country) return res.json(geoOffers[country.toUpperCase()] || null);
  res.json(geoOffers);
});

// ── Agent: chat + confirm ─────────────────────────────────────────────────────
app.post('/api/agent/chat', async (req, res) => {
  const { session_id, message, geo, pool } = req.body;
  if (!session_id) return res.status(400).json({ error: 'session_id required' });

  msgAdd(session_id, 'user', message);
  const draft = draftGet(session_id);

  // Determine account from geo
  const geoConf = geo ? GEO_CONFIG[geo.toUpperCase()] : null;
  const reply = await processAgentMessage({ session_id, message, geo, pool, draft, geoConf });

  if (reply.draftPatch) draftSave(session_id, { ...reply.draftPatch, geo: geo || draft.geo, pool: pool || draft.pool });
  msgAdd(session_id, 'assistant', reply.text);

  const updatedDraft = draftGet(session_id);
  res.json({ reply: reply.text, draft: updatedDraft, ready: updatedDraft.status === 'ready' });
});

app.post('/api/agent/confirm', async (req, res) => {
  const { session_id } = req.body;
  if (!session_id) return res.status(400).json({ error: 'session_id required' });

  const draft = draftGet(session_id);
  if (draft.status !== 'ready') return res.status(400).json({ error: 'Черновик не готов' });

  const geoConf = GEO_CONFIG[(draft.geo || '').toUpperCase()];
  if (!geoConf) return res.status(400).json({ error: `Неизвестный гео: ${draft.geo}` });

  const acc = ACCOUNTS[geoConf.account];
  if (!acc?.token) return res.status(500).json({ error: `Нет токена для аккаунта ${geoConf.account}` });

  try {
    const api = new AdskeeperApi(acc.token, geoConf.account);
    const campName = `${draft.geo} ${draft.theme || draft.article_id}_${Date.now().toString().slice(-6)}`;
    const geoJson = JSON.stringify({ method: 'set', cities: [], countries: [draft.geo.toUpperCase()] });

    const camp = await api.createCampaign({
      name: campName, advertiserName: geoConf.adv, language: geoConf.lang,
      campaignType: 'content', categoryId: 229,
      enabledGeoTargetingFlag: 1, geoTargets: geoJson,
      'languageTargeting[]': geoConf.lang, utm_custom: 'adclid={click_id}',
    });
    if (!camp?.id) return res.status(500).json({ error: 'Campaign creation failed', details: camp });

    const campId = camp.id;
    await new Promise(r => setTimeout(r, 300));

    const teaserIds = [];
    const imageUrl = draft.image_url || '';
    for (const title of (draft.titles || []).slice(0, 5)) {
      if (title.length > 65) continue;
      try {
        const t = await api.createTeaser({
          campaignId: campId, title, advertText: '', url: draft.url,
          imageLink: imageUrl, priceOfClick: geoConf.cpc.toFixed(2),
          whetherShowGoodPrice: '0',
        });
        if (t?.id) teaserIds.push(t.id);
        await new Promise(r => setTimeout(r, 250));
      } catch (e) { /* skip failed teasers */ }
    }

    // Pipeline
    await runCreationPipeline([{ campaign_id: campId, account_id: geoConf.account, country: draft.geo.toUpperCase(), cpc_cents: geoConf.cpc, name: campName }]);

    campaignRecord(session_id, draft.geo, campId, campName, teaserIds);
    draftClear(session_id);

    res.json({ ok: true, campaign_id: campId, teaser_ids: teaserIds, name: campName });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/agent/history', (req, res) => {
  const sid = req.query.session_id || '';
  if (!sid) return res.json({ messages: [], draft: {}, campaigns: [] });
  res.json({
    messages: msgHistory(sid),
    draft: draftGet(sid),
    campaigns: recentCampaigns(sid),
  });
});

app.post('/api/agent/reset', (req, res) => {
  const { session_id } = req.body;
  if (session_id) draftClear(session_id);
  res.json({ ok: true });
});

// ── Image generation via OpenRouter ──────────────────────────────────────────
app.post('/api/generate-image', async (req, res) => {
  const { prompt, session_id } = req.body;
  const key = process.env.OPENROUTER_KEY;
  if (!key) return res.status(500).json({ error: 'OPENROUTER_KEY not set' });

  try {
    const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash-preview-05-20',
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    const data = await r.json();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Agent message processor ───────────────────────────────────────────────────
async function processAgentMessage({ session_id, message, geo, pool, draft, geoConf }) {
  const lines = message.split('\n').map(l => l.trim()).filter(Boolean);

  // Extract URL from message
  const urlMatch = message.match(/https?:\/\/[^\s]+/);
  const url = urlMatch ? urlMatch[0] : draft.url;

  // Extract titles (lines that look like teaser titles, not URLs)
  const titleLines = lines.filter(l =>
    !l.startsWith('http') && !l.startsWith('тема:') && !l.startsWith('URL') &&
    l.length > 5 && l.length <= 65
  );

  // Extract theme
  const themeMatch = message.match(/тема[:：]\s*(\S+)/i);
  const theme = themeMatch ? themeMatch[1] : draft.theme;

  // Find stream info
  const aidMatch = url ? url.match(/\/full\/(\d+)/) : null;
  const articleId = aidMatch ? parseInt(aidMatch[1]) : draft.article_id;

  // Find matching stream for title suggestion
  let streamTitle = '';
  if (articleId) {
    const s = streams.find(s => s.aid === articleId);
    if (s) streamTitle = s.title;
  }

  const newTitles = titleLines.length > 0 ? titleLines : (draft.titles || []);
  const draftPatch = { url, article_id: articleId, theme, titles: newTitles };

  // Check readiness
  const isReady = url && newTitles.length >= 3 && newTitles.every(t => t.length <= 65);

  if (isReady) draftPatch.status = 'ready';
  else draftPatch.status = 'collecting';

  // Build reply
  let text = '';
  if (!url) {
    text = 'Укажи URL потока (https://pressreportzone.com/v1/full/...).';
  } else if (newTitles.length < 3) {
    text = `URL принят (aid=${articleId || '?'}).\n${streamTitle ? `Оригинальный заголовок: "${streamTitle}"\n` : ''}Нужно минимум 3 заголовка (сейчас: ${newTitles.length}). Пиши по одному на строке, максимум 65 символов.`;
  } else {
    const tooLong = newTitles.filter(t => t.length > 65);
    if (tooLong.length > 0) {
      text = `Некоторые заголовки слишком длинные (>65 симв):\n${tooLong.map(t => `"${t}" (${t.length})`).join('\n')}\nСократи их.`;
    } else {
      text = `Готово к созданию!\nГео: ${geo || draft.geo || '?'} · aid=${articleId} · ${newTitles.length} заголовков\nНажми "Создать кампанию" или пиши продолжение.`;
    }
  }

  return { text, draftPatch: isReady ? { ...draftPatch, status: 'ready' } : draftPatch };
}

// ── Blacklist API ───────────────────────────────────────────────────────────
const { getBlacklist, getLowCtrList } = require("./lib/blacklist");
app.get("/api/blacklist/:country", (req, res) => {
  res.json({ country: req.params.country.toUpperCase(), widget_ids: getBlacklist(req.params.country) });
});
app.get("/api/blacklist-low-ctr", (req, res) => {
  res.json({ count: getLowCtrList().length, widget_ids: getLowCtrList().slice(0, 100) });
});

// ── Root ──────────────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => console.log(`adskeeper-agent running on port ${PORT}`));

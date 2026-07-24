const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;

const WODIFY_API_KEY           = process.env.WODIFY_API_KEY;
const ANTHROPIC_API_KEY        = process.env.ANTHROPIC_API_KEY;
const SLACK_SIGNING_SECRET     = process.env.SLACK_SIGNING_SECRET;
const SLACK_BOT_TOKEN          = process.env.SLACK_BOT_TOKEN;
const GOOGLE_SA_JSON           = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
const NEW_ATHLETES_CHANNEL     = process.env.NEW_ATHLETES_CHANNEL;
const CURRENT_ATHLETES_CHANNEL = process.env.CURRENT_ATHLETES_CHANNEL;
const SHEET_ID                 = "1wC31nqMDhhNsXnkCxqihPVWFvRhqioDezFC9ifhXYf0";
const ROSTER_CACHE             = process.env.ROSTER_CACHE_FILE || "/tmp/roster_cache.json";

const API_BASE     = "https://api.wodify.com/v1";
const APP_BASE     = "https://app-api.wodify.com/v1";
const WODIFY_HEADERS = { "x-api-key": WODIFY_API_KEY, "Accept": "application/json" };

app.use(cors());
app.use("/slack/events", express.raw({ type: "application/json" }));
app.use(express.json({ limit: "50mb" }));

app.get("/", (req, res) => res.sendFile(path.join(__dirname, "index.html")));
app.get("/health", (req, res) => res.json({
  status: "ok",
  hasAnthropicKey: !!ANTHROPIC_API_KEY,
  hasGoogleKey: !!GOOGLE_SA_JSON,
  hasWodifyKey: !!WODIFY_API_KEY,
}));

// ══════════════════════════════════════════════════════════════════════════════
// WODIFY
// ══════════════════════════════════════════════════════════════════════════════

async function wodifyGet(base, endpoint) {
  const r = await fetch(`${base}${endpoint}`, { headers: WODIFY_HEADERS });
  return r.json();
}

const RECURRING_IDS = new Set([
  205659, 195631, 195633, 254489, 195634, 195635, 522818,
  293074, 429300, 342890, 358767, 407780, 272141, 559450, 561511
]);

// Known anchors — coverage June 22 2026 through November 12 2026
const KNOWN_ANCHORS = [
  { date: "2026-06-22", id: 174558953, recurring_id: 205659 },
  { date: "2026-06-23", id: 174636236, recurring_id: 205659 },
  { date: "2026-06-24", id: 174704892, recurring_id: 205659 },
  { date: "2026-06-25", id: 174778926, recurring_id: 205659 },
  { date: "2026-06-26", id: 174846876, recurring_id: 205659 },
  { date: "2026-06-27", id: 174894836, recurring_id: 254489 },
  { date: "2026-06-28", id: 174939169, recurring_id: 342890 },
  { date: "2026-06-29", id: 174975415, recurring_id: 205659 },
  { date: "2026-06-30", id: 175038980, recurring_id: 205659 },
  { date: "2026-07-01", id: 175128191, recurring_id: 205659 },
  { date: "2026-07-02", id: 175217390, recurring_id: 205659 },
  { date: "2026-07-03", id: 175418520, recurring_id: 205659 },
  { date: "2026-07-06", id: 175475864, recurring_id: 205659 },
  { date: "2026-07-07", id: 175536938, recurring_id: 205659 },
  { date: "2026-07-08", id: 175592791, recurring_id: 205659 },
  { date: "2026-07-09", id: 175634989, recurring_id: 205659 },
  { date: "2026-07-10", id: 175737267, recurring_id: 205659 },
  { date: "2026-07-13", id: 175791204, recurring_id: 205659 },
  { date: "2026-07-14", id: 175855716, recurring_id: 205659 },
  { date: "2026-07-15", id: 175911325, recurring_id: 205659 },
  { date: "2026-07-16", id: 175966451, recurring_id: 205659 },
  { date: "2026-07-17", id: 176070487, recurring_id: 205659 },
  { date: "2026-07-20", id: 176128404, recurring_id: 205659 },
  { date: "2026-07-21", id: 176183896, recurring_id: 205659 },
  { date: "2026-07-22", id: 176232112, recurring_id: 205659 },
  { date: "2026-07-23", id: 176289187, recurring_id: 205659 },
  { date: "2026-07-24", id: 176412352, recurring_id: 205659 },
  { date: "2026-07-27", id: 176464224, recurring_id: 205659 },
  { date: "2026-07-28", id: 176526360, recurring_id: 205659 },
  { date: "2026-07-29", id: 176587215, recurring_id: 205659 },
  { date: "2026-07-30", id: 176657452, recurring_id: 205659 },
  { date: "2026-07-31", id: 176786918, recurring_id: 205659 },
  { date: "2026-08-03", id: 176853518, recurring_id: 205659 },
  { date: "2026-08-04", id: 176925393, recurring_id: 205659 },
  { date: "2026-08-05", id: 176996435, recurring_id: 205659 },
  { date: "2026-08-06", id: 177061707, recurring_id: 205659 },
  { date: "2026-08-07", id: 177176745, recurring_id: 205659 },
  { date: "2026-08-10", id: 177230972, recurring_id: 205659 },
  { date: "2026-08-11", id: 177299195, recurring_id: 205659 },
  { date: "2026-08-12", id: 177360298, recurring_id: 205659 },
  { date: "2026-08-13", id: 177414410, recurring_id: 205659 },
  { date: "2026-08-14", id: 177541512, recurring_id: 205659 },
  { date: "2026-08-17", id: 177597435, recurring_id: 205659 },
  { date: "2026-08-18", id: 177664493, recurring_id: 205659 },
  { date: "2026-08-19", id: 177720335, recurring_id: 205659 },
  { date: "2026-08-20", id: 177781474, recurring_id: 205659 },
  { date: "2026-08-21", id: 177930048, recurring_id: 205659 },
  { date: "2026-08-24", id: 177998912, recurring_id: 205659 },
  { date: "2026-08-25", id: 178085992, recurring_id: 205659 },
  { date: "2026-08-26", id: 178147991, recurring_id: 205659 },
  { date: "2026-08-27", id: 178221971, recurring_id: 205659 },
  { date: "2026-08-28", id: 178390579, recurring_id: 205659 },
  { date: "2026-08-31", id: 178457687, recurring_id: 205659 },
  { date: "2026-09-01", id: 178520343, recurring_id: 205659 },
  { date: "2026-09-02", id: 178586038, recurring_id: 205659 },
  { date: "2026-09-03", id: 178645068, recurring_id: 205659 },
  { date: "2026-09-04", id: 178807085, recurring_id: 205659 },
  { date: "2026-09-07", id: 178878235, recurring_id: 205659 },
  { date: "2026-09-08", id: 178941053, recurring_id: 205659 },
  { date: "2026-09-09", id: 179003073, recurring_id: 205659 },
  { date: "2026-09-10", id: 179063501, recurring_id: 205659 },
  { date: "2026-09-11", id: 179178973, recurring_id: 205659 },
  { date: "2026-09-14", id: 179237481, recurring_id: 205659 },
  { date: "2026-09-15", id: 179299240, recurring_id: 205659 },
  { date: "2026-09-16", id: 179351215, recurring_id: 205659 },
  { date: "2026-09-17", id: 179396559, recurring_id: 205659 },
  { date: "2026-09-18", id: 179492294, recurring_id: 205659 },
  { date: "2026-09-21", id: 179544584, recurring_id: 205659 },
  { date: "2026-09-22", id: 179602226, recurring_id: 205659 },
  { date: "2026-09-23", id: 179657098, recurring_id: 205659 },
  { date: "2026-09-24", id: 179713751, recurring_id: 205659 },
  { date: "2026-09-25", id: 179843013, recurring_id: 205659 },
  { date: "2026-09-28", id: 179911385, recurring_id: 205659 },
  { date: "2026-09-29", id: 179980367, recurring_id: 205659 },
  { date: "2026-09-30", id: 180059048, recurring_id: 205659 },
  { date: "2026-10-01", id: 180126782, recurring_id: 205659 },
  { date: "2026-10-02", id: 180257688, recurring_id: 205659 },
  { date: "2026-10-05", id: 180317108, recurring_id: 205659 },
  { date: "2026-10-06", id: 180390922, recurring_id: 205659 },
  { date: "2026-10-07", id: 180453852, recurring_id: 205659 },
  { date: "2026-10-08", id: 180512031, recurring_id: 205659 },
  { date: "2026-10-09", id: 180602855, recurring_id: 205659 },
  { date: "2026-10-12", id: 180654498, recurring_id: 205659 },
  { date: "2026-10-13", id: 180708112, recurring_id: 205659 },
  { date: "2026-10-14", id: 180760790, recurring_id: 205659 },
  { date: "2026-10-15", id: 180818417, recurring_id: 205659 },
  { date: "2026-10-16", id: 180913951, recurring_id: 205659 },
  { date: "2026-10-19", id: 180968795, recurring_id: 205659 },
  { date: "2026-10-20", id: 181025236, recurring_id: 205659 },
  { date: "2026-10-21", id: 181085136, recurring_id: 205659 },
  { date: "2026-10-22", id: 181144148, recurring_id: 205659 },
  { date: "2026-10-23", id: 181243054, recurring_id: 205659 },
  { date: "2026-10-26", id: 181299259, recurring_id: 205659 },
  { date: "2026-10-27", id: 181360890, recurring_id: 205659 },
  { date: "2026-10-28", id: 181422659, recurring_id: 205659 },
  { date: "2026-10-29", id: 181479277, recurring_id: 205659 },
  { date: "2026-10-30", id: 181601343, recurring_id: 205659 },
  { date: "2026-11-02", id: 181674570, recurring_id: 205659 },
  { date: "2026-11-03", id: 181740477, recurring_id: 205659 },
  { date: "2026-11-04", id: 181790225, recurring_id: 205659 },
  { date: "2026-11-05", id: 181850632, recurring_id: 205659 },
  { date: "2026-11-06", id: 181947751, recurring_id: 205659 },
  { date: "2026-11-09", id: 181994000, recurring_id: 205659 },
  { date: "2026-11-10", id: 182053858, recurring_id: 205659 },
  { date: "2026-11-11", id: 182112814, recurring_id: 205659 },
  { date: "2026-11-12", id: 182166904, recurring_id: 205659 },
];

const anchorCache = {};
KNOWN_ANCHORS.forEach(a => { anchorCache[a.date] = a; });

// Fetch IDs in small batches to avoid Wodify rate limiting
async function fetchClassBatch(ids, today) {
  const BATCH_SIZE = 10;
  const DELAY_MS = 150;
  const found = [];
  for (let i = 0; i < ids.length; i += BATCH_SIZE) {
    const batch = ids.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(
      batch.map(id =>
        wodifyGet(API_BASE, `/classes/${id}`)
          .then(data => {
            if (data.start_date === today && !data.is_cancelled && RECURRING_IDS.has(data.recurring_class_id)) return data;
            return null;
          }).catch(() => null)
      )
    );
    found.push(...results.filter(Boolean));
    if (i + BATCH_SIZE < ids.length) await new Promise(r => setTimeout(r, DELAY_MS));
  }
  return found;
}

async function findTodaysClasses(today) {
  // Use exact anchor if available — scan ±30 IDs (classes cluster tightly)
  if (anchorCache[today]) {
    const anchor = anchorCache[today];
    const WINDOW = 30;
    const ids = Array.from({ length: WINDOW * 2 + 1 }, (_, i) => anchor.id - WINDOW + i);
    console.log(`Using exact anchor for ${today}: ${anchor.id} (scanning ${ids.length} IDs)`);
    const results = await fetchClassBatch(ids, today);
    return results
      .filter((c, i, arr) => arr.findIndex(x => x.recurring_class_id === c.recurring_class_id) === i)
      .sort((a, b) => a.start_time > b.start_time ? 1 : -1);
  }

  // Fallback: find closest anchor and estimate with wider window
  const sorted = KNOWN_ANCHORS.slice().sort((a, b) => a.date.localeCompare(b.date));
  let best = sorted[sorted.length - 1];
  for (const a of sorted) { if (a.date <= today) best = a; }
  const daysDiff = Math.round((new Date(today) - new Date(best.date)) / 86400000);
  const estimated = best.id + daysDiff * 75000;
  const WINDOW = 100;
  console.log(`Estimating for ${today}: ~${estimated} (${daysDiff} days from ${best.date})`);
  const ids = Array.from({ length: WINDOW * 2 + 1 }, (_, i) => estimated - WINDOW + i);
  const found = await fetchClassBatch(ids, today);
  const deduped = found
    .filter((c, i, arr) => arr.findIndex(x => x.recurring_class_id === c.recurring_class_id) === i)
    .sort((a, b) => a.start_time > b.start_time ? 1 : -1);
  if (deduped.length > 0 && !anchorCache[today]) {
    anchorCache[today] = { date: today, id: deduped[0].id, recurring_id: deduped[0].recurring_class_id };
  }
  return deduped;
}

// ══════════════════════════════════════════════════════════════════════════════
// GOOGLE SHEETS
// ══════════════════════════════════════════════════════════════════════════════

// Convert Excel serial date or various string formats to YYYY-MM-DD
function toDateStr(val) {
  if (!val && val !== 0) return '';
  // Excel serial number
  if (typeof val === 'number' || (typeof val === 'string' && /^\d{5}$/.test(val.trim()))) {
    const serial = parseInt(val);
    if (serial > 40000 && serial < 60000) {
      const d = new Date(Date.UTC(1899, 11, 30) + serial * 86400000);
      return d.toISOString().slice(0, 10);
    }
  }
  // Already a YYYY-MM-DD string
  if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}/.test(val.trim())) {
    return val.trim().slice(0, 10);
  }
  // MM/DD/YYYY or similar
  if (typeof val === 'string' && /\d{1,2}\/\d{1,2}\/\d{4}/.test(val)) {
    const d = new Date(val);
    if (!isNaN(d)) return d.toISOString().slice(0, 10);
  }
  // Not a recognizable date
  return '';
}

const COL = {
  athlete: 0, last_checkin: 1, next_checkin: 2, notes: 3, goals: 4,
  rx: 5, injuries: 6, dos: 7, donts: 8, upcoming: 9,
  coach_notes: 10, wodify_id: 11, last_updated: 12, ai_summary: 13
};
const FIELD_TO_COL = {
  athlete:"A", last_checkin:"B", next_checkin:"C", notes:"D", goals:"E",
  rx:"F", injuries:"G", dos:"H", donts:"I", upcoming:"J",
  coach_notes:"K", wodify_id:"L", last_updated:"M", ai_summary:"N"
};

async function getGoogleToken() {
  if (!GOOGLE_SA_JSON) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON not set");
  const sa = JSON.parse(GOOGLE_SA_JSON);
  const now = Math.floor(Date.now() / 1000);
  const header  = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({
    iss: sa.client_email, scope: "https://www.googleapis.com/auth/spreadsheets",
    aud: "https://oauth2.googleapis.com/token", exp: now + 3600, iat: now
  })).toString("base64url");
  const sign = require("crypto").createSign("RSA-SHA256");
  sign.update(`${header}.${payload}`);
  const sig = sign.sign(sa.private_key, "base64url");
  const jwt = `${header}.${payload}.${sig}`;
  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`
  });
  const data = await resp.json();
  if (!data.access_token) throw new Error(`Google auth failed: ${JSON.stringify(data)}`);
  return data.access_token;
}

async function sheetsGet(range) {
  const token = await getGoogleToken();
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(range)}?valueRenderOption=UNFORMATTED_VALUE`;
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  return resp.json();
}

async function sheetsBatchUpdate(data) {
  const token = await getGoogleToken();
  const resp = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values:batchUpdate`, {
    method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ valueInputOption: "USER_ENTERED", data })
  });
  return resp.json();
}

async function sheetsAppend(values) {
  const token = await getGoogleToken();
  const resp = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/Sheet1!A3:N:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`, {
    method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ values })
  });
  return resp.json();
}

function rowToAthlete(row, rowIndex) {
  row = [...row, ...Array(14).fill("")].slice(0, 14);
  const name = (row[COL.athlete] || "").toString().trim();
  if (!name) return null;
  return {
    row_number: rowIndex, athlete: name,
    last_checkin: toDateStr(row[COL.last_checkin]), next_checkin: toDateStr(row[COL.next_checkin]),
    notes: row[COL.notes], goals: row[COL.goals], rx: row[COL.rx],
    injuries: row[COL.injuries], dos: row[COL.dos], donts: row[COL.donts],
    upcoming: row[COL.upcoming], coach_notes: row[COL.coach_notes],
    wodify_id: (row[COL.wodify_id] || "").toString().trim(),
    last_updated: row[COL.last_updated], ai_summary: row[COL.ai_summary] || "",
  };
}

async function getAllAthletes() {
  const result = await sheetsGet("Sheet1!A3:N");
  return (result.values || []).map((row, i) => rowToAthlete(row, 3 + i)).filter(Boolean);
}

async function findAthlete(name, wodifyId) {
  const athletes = await getAllAthletes();
  for (const a of athletes) {
    if (wodifyId && a.wodify_id === String(wodifyId)) return a;
    if (name && a.athlete.toLowerCase() === name.toLowerCase()) return a;
  }
  return null;
}

async function findAthletesByFirstName(firstName) {
  const athletes = await getAllAthletes();
  const lower = firstName.toLowerCase().trim();
  return athletes.filter(a => {
    const parts = a.athlete.toLowerCase().split(' ');
    return parts[0] === lower;
  });
}

async function findAthleteByNameFuzzy(name) {
  // Try exact match first
  const exact = await findAthlete(name);
  if (exact) return { match: exact, ambiguous: false, candidates: [] };

  // Try first name only match
  const firstName = name.trim().split(' ')[0];
  const candidates = await findAthletesByFirstName(firstName);
  if (candidates.length === 1) return { match: candidates[0], ambiguous: false, candidates: [] };
  if (candidates.length > 1) return { match: null, ambiguous: true, candidates };
  return { match: null, ambiguous: false, candidates: [] };
}

async function updateAthlete(rowNumber, fields) {
  const now = new Date().toLocaleString("en-US", { timeZone: "America/Chicago" });
  fields.last_updated = now;
  const data = Object.entries(fields)
    .map(([key, value]) => ({ range: `Sheet1!${FIELD_TO_COL[key]}${rowNumber}`, values: [[value]] }))
    .filter(d => d.range && !d.range.includes("undefined"));
  if (data.length) await sheetsBatchUpdate(data);
}

async function addAthlete(fields) {
  const now = new Date().toLocaleString("en-US", { timeZone: "America/Chicago" });
  const row = Array(14).fill("");
  Object.entries(fields).forEach(([key, value]) => { if (COL[key] !== undefined) row[COL[key]] = value || ""; });
  row[COL.last_updated] = now;
  await sheetsAppend([row]);
}

// ══════════════════════════════════════════════════════════════════════════════
// CLAUDE
// ══════════════════════════════════════════════════════════════════════════════

function parseJSON(text) {
  try { return JSON.parse(text.replace(/```json|```/g, "").trim()); } catch { return null; }
}

async function callClaude(system, userMessage) {
  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "anthropic-version": "2023-06-01", "x-api-key": ANTHROPIC_API_KEY },
    body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 600, system, messages: [{ role: "user", content: userMessage }] })
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(data?.error?.message || `Claude error ${resp.status}`);
  return data.content?.map(b => b.text || "").join("").trim() || "";
}

async function generateAndCacheSummary(athlete) {
  const context = [
    athlete.goals     && `Goals: ${athlete.goals}`,
    athlete.rx        && `Prescription: ${athlete.rx}`,
    athlete.injuries  && `Injuries: ${athlete.injuries}`,
    athlete.dos       && `Dos: ${athlete.dos}`,
    athlete.donts     && `Donts: ${athlete.donts}`,
    athlete.upcoming  && `Upcoming: ${athlete.upcoming}`,
    athlete.notes     && `Notes: ${athlete.notes}`,
    athlete.coach_notes && `Coach Notes: ${athlete.coach_notes}`,
  ].filter(Boolean).join("\n");
  if (!context) return "";
  const system = `You create ultra-concise coach briefs for CrossFit athletes.
Return ONLY valid JSON, no markdown.
Format: {"dos":["max 3 short bullets"],"donts":["max 3 short bullets"],"injuries":"one line or empty","upcoming":"one line or empty","trip_start":"YYYY-MM-DD or empty","trip_end":"YYYY-MM-DD or empty","summary":"one sentence"}
Each bullet under 8 words. Be specific and actionable.
For trip_start/trip_end: only fill if specific dates are mentioned (e.g. "leaving June 30, back July 7"). Leave empty if dates are vague.`;
  const raw = await callClaude(system, `Athlete: ${athlete.athlete}\n\n${context}`);
  const parsed = parseJSON(raw);
  if (!parsed) return context.slice(0, 200);
  const summary = JSON.stringify(parsed);
  await sheetsBatchUpdate([{ range: `Sheet1!N${athlete.row_number}`, values: [[summary]] }]);
  console.log(`AI summary cached for ${athlete.athlete}`);
  return summary;
}

// ══════════════════════════════════════════════════════════════════════════════
// ROSTER BUILDER
// ══════════════════════════════════════════════════════════════════════════════

async function fetchTodaysReservations(dateStr) {
  const reservations = []; let page = 1;
  console.log(`[Roster] Fetching for ${dateStr}...`);
  while (true) {
    const data = await wodifyGet(API_BASE, `/client_class_reservations?page=${page}&page_size=200`);
    const rows = data.client_class_reservations || [];
    if (!rows.length) break;
    const todayRows = rows.filter(r => r.local_class_start_datetime?.startsWith(dateStr) && r.reservation_status_id !== 1);
    reservations.push(...todayRows);
    const lastDate = rows[rows.length - 1]?.local_class_start_datetime?.slice(0, 10) || "";
    if (lastDate > dateStr) break;
    if (!data.pagination?.has_more) break;
    page++;
  }
  console.log(`[Roster] Found ${reservations.length} reservations`);
  return reservations;
}

async function buildRosterCache() {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
  console.log(`[Roster] Building cache for ${today}`);
  try {
    const reservations = await fetchTodaysReservations(today);
    if (!reservations.length) { console.log("[Roster] No reservations"); return; }
    const classMap = {};
    for (const r of reservations) {
      const cid = String(r.class_id);
      if (!classMap[cid]) classMap[cid] = { class_id: cid, class_name: r.class || "", start_time: r.local_class_start_datetime || "", client_names: [], client_ids: [] };
      classMap[cid].client_names.push((r.client || "").toLowerCase());
      classMap[cid].client_ids.push(String(r.client_id || ""));
    }
    const athletes = await getAllAthletes();
    const byName = {}; const byWodifyId = {};
    athletes.forEach(a => { byName[a.athlete.toLowerCase()] = a; if (a.wodify_id) byWodifyId[a.wodify_id] = a; });
    const enriched = {};
    for (const [cid, cls] of Object.entries(classMap)) {
      const matchedAthletes = []; const seen = new Set();
      for (let i = 0; i < cls.client_names.length; i++) {
        const key = cls.client_ids[i] || cls.client_names[i];
        if (seen.has(key)) continue; seen.add(key);
        const sheetAthlete = byWodifyId[cls.client_ids[i]] || byName[cls.client_names[i]];
        if (sheetAthlete) {
          let summary = null;
          if (sheetAthlete.ai_summary) { try { summary = JSON.parse(sheetAthlete.ai_summary); } catch {} }
          matchedAthletes.push({ ...sheetAthlete, coaching_brief: summary, has_notes: true });
        } else {
          matchedAthletes.push({ athlete: cls.client_names[i], row_number: null, has_notes: false, coaching_brief: null });
        }
      }
      enriched[cid] = { ...cls, athletes: matchedAthletes };
      console.log(`[Roster] ${cls.class_name}: ${matchedAthletes.length} athletes`);
    }
    fs.writeFileSync(ROSTER_CACHE, JSON.stringify({ date: today, built_at: new Date().toISOString(), classes: enriched }));
    console.log(`[Roster] Cache written`);
  } catch (err) { console.error("[Roster] Failed:", err.message); }
}

const ROSTER_RUN_TIMES = new Set(["04:44","05:44","07:14","08:44","14:44","15:44","16:44","17:44"]);
let lastRosterMinute = null;

function startRosterCron() {
  setInterval(() => {
    const now = new Date().toLocaleString("en-US", { timeZone: "America/Chicago", hour: "2-digit", minute: "2-digit", hour12: false });
    const hhmm = now.replace(",","").trim().slice(0,5);
    if (ROSTER_RUN_TIMES.has(hhmm) && hhmm !== lastRosterMinute) { lastRosterMinute = hhmm; buildRosterCache(); }
  }, 30000);
  console.log("[Roster Cron] Started");
}

// ══════════════════════════════════════════════════════════════════════════════
// SLACK
// ══════════════════════════════════════════════════════════════════════════════

// In-memory store for pending disambiguations
// { [channelId_threadTs]: { athletes: [...], parsed: {...}, text: string, expiresAt: number } }
const pendingDisambiguations = {};

// Clean up expired disambiguations every 10 minutes
setInterval(() => {
  const now = Date.now();
  Object.keys(pendingDisambiguations).forEach(k => {
    if (pendingDisambiguations[k].expiresAt < now) delete pendingDisambiguations[k];
  });
}, 600000);

async function sendSlackMessage(channel, text, thread_ts) {
  const body = { channel, text };
  if (thread_ts) body.thread_ts = thread_ts;
  const resp = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${SLACK_BOT_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const data = await resp.json();
  if (!data.ok) console.error('[Slack] Failed to send message:', data.error);
  return data;
}

function verifySlackSignature(req) {
  if (!SLACK_SIGNING_SECRET) return true;
  const timestamp = req.headers["x-slack-request-timestamp"];
  if (Math.abs(Date.now() / 1000 - timestamp) > 300) return false;
  const body = req.body.toString();
  const sig = "v0=" + crypto.createHmac("sha256", SLACK_SIGNING_SECRET).update(`v0:${timestamp}:${body}`).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(req.headers["x-slack-signature"] || "v0="));
}

function looksLikeAthleteMessage(text) {
  if (text.length < 20) return false;
  return ![/^now done/i, /^testing/i, /^test$/i, /^👍/, /^✅/, /^https?:\/\//i].some(p => p.test(text.trim()));
}

async function handleNewAthlete(text) {
  const system = `Extract athlete data from CrossFit consultation notes. Return ONLY valid JSON, no markdown.
Format: {"athlete":"Full Name","goals":"...","injuries":"...","dos":"...","donts":"...","upcoming":"...","notes":"...","coach_notes":"one sentence"}
Use empty string for missing fields.
IMPORTANT: "upcoming" is ONLY for travel, trips, vacations, or planned absences from the gym. Do NOT put start dates, first class dates, membership dates, or join dates in "upcoming". Those are not absences.`;
  const raw = await callClaude(system, `Parse this new athlete note:\n\n${text}`);
  const parsed = parseJSON(raw);
  if (!parsed?.athlete) { console.log("Could not parse new athlete name"); return; }
  const existing = await findAthlete(parsed.athlete);
  if (existing) {
    const fields = Object.fromEntries(Object.entries(parsed).filter(([k,v]) => v && k !== "athlete"));
    await updateAthlete(existing.row_number, fields);
    await generateAndCacheSummary({ ...existing, ...fields });
  } else {
    await addAthlete(parsed);
    const newAthlete = await findAthlete(parsed.athlete);
    if (newAthlete) await generateAndCacheSummary({ ...newAthlete, ...parsed });
  }
  console.log(`Processed new athlete: ${parsed.athlete}`);
}

function detectCancellation(text) {
  return /cancel|cancell|leaving|left the gym|last day|ended their|dropping|quit|no longer a member/i.test(text);
}

async function handleBatchCancellation(text, channel, thread_ts) {
  // Ask Claude to extract a list of names from the cancellation post
  const system = `Extract a list of member names from a gym cancellation notice.
Return ONLY valid JSON, no markdown.
Format: {"names": ["Full Name", "Full Name"]}
Only include names of people who are cancelling/leaving. If no clear names found, return {"names": []}.`;
  const raw = await callClaude(system, `Extract cancelling member names from this post:\n\n${text}`);
  const parsed = parseJSON(raw);
  if (!parsed?.names?.length) {
    console.log('[Cancellation] No names found in batch post');
    return;
  }

  const athletes = await getAllAthletes();
  const tagged = [];
  const notFound = [];

  for (const name of parsed.names) {
    // Try exact then fuzzy
    let match = athletes.find(a => a.athlete.toLowerCase() === name.toLowerCase());
    if (!match) {
      const firstName = name.split(' ')[0].toLowerCase();
      const candidates = athletes.filter(a => a.athlete.toLowerCase().split(' ')[0] === firstName);
      if (candidates.length === 1) match = candidates[0];
    }
    if (match) {
      // Add [cancelled] tag to coach_notes
      const prev = match.coach_notes || '';
      if (!prev.includes('[cancelled]')) {
        const date = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
        const newNotes = prev ? `${prev}\n[cancelled:${date}]` : `[cancelled:${date}]`;
        await updateAthlete(match.row_number, { coach_notes: newNotes });
        tagged.push(match.athlete);
        console.log(`[Cancellation] Tagged: ${match.athlete}`);
      }
    } else {
      notFound.push(name);
    }
  }

  if (channel) {
    let reply = `✓ Marked ${tagged.length} member(s) as cancelled in the app:\n${tagged.map(n => `• ${n}`).join('\n')}`;
    if (notFound.length) reply += `\n\nCould not find: ${notFound.join(', ')} — check spelling or add last name.`;
    reply += '\n\nReview and remove from the Sheet using the app dashboard (PIN required).';
    await sendSlackMessage(channel, reply, thread_ts);
  }
}

function detectCheckin(text) {
  // Detect check-in mentions in coach messages
  return /check.?in|goal.?review|90.?day|30.?day/i.test(text);
}

function calcNextCheckinDate(lastDate, memberSince) {
  const last = new Date(lastDate);
  const joined = new Date(memberSince || lastDate);
  const now = new Date();
  const daysSinceJoin = Math.round((now - joined) / 86400000);
  const intervalDays = daysSinceJoin < 90 ? 30 : 90;
  const next = new Date(last);
  next.setDate(next.getDate() + intervalDays);
  return { nextCheckin: next.toISOString().slice(0, 10), intervalDays };
}

async function applyAthleteUpdate(existing, parsed) {
  const fields = {};
  ["injuries","upcoming","dos","donts"].forEach(k => { if (parsed[k]) fields[k] = parsed[k]; });
  if (parsed.coach_notes) {
    const date = new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
    const prev = existing.coach_notes || "";
    const cleanedPrev = prev.replace(/\[checkin_scheduled:[^\]]+\]/g, '').trim();
    fields.coach_notes = cleanedPrev ? `${cleanedPrev}\n[${date}] ${parsed.coach_notes}` : `[${date}] ${parsed.coach_notes}`;
  }
  if (parsed.checkin_scheduled) {
    const base = fields.coach_notes || existing.coach_notes || '';
    const cleaned = base.replace(/\[checkin_scheduled:[^\]]+\]/g, '').trim();
    fields.coach_notes = cleaned ? `${cleaned}\n[checkin_scheduled:${parsed.checkin_scheduled}]` : `[checkin_scheduled:${parsed.checkin_scheduled}]`;
    console.log(`[CheckIn Scheduled] ${existing.athlete}: ${parsed.checkin_scheduled}`);
  }
  if (detectCheckin(parsed.coach_notes || '')) {
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
    let memberSince = null;
    if (existing.wodify_id) {
      try { const cd = await wodifyGet(API_BASE, `/clients/${existing.wodify_id}`); memberSince = cd.member_since || null; } catch {}
    }
    const { nextCheckin, intervalDays } = calcNextCheckinDate(today, memberSince);
    fields.last_checkin = today;
    fields.next_checkin = nextCheckin;
    // Clear scheduled tag since check-in is now done
    if (fields.coach_notes) fields.coach_notes = fields.coach_notes.replace(/\[checkin_scheduled:[^\]]+\]/g, '').trim();
    console.log(`[CheckIn] ${existing.athlete}: ${today} → ${nextCheckin} (${intervalDays}-day)`);
  }
  if (Object.keys(fields).length) {
    await updateAthlete(existing.row_number, fields);
    await generateAndCacheSummary({ ...existing, ...fields });
  }
  console.log(`Updated athlete: ${existing.athlete}`);
}

async function handleAthleteUpdate(text, channel, thread_ts) {
  if (!looksLikeAthleteMessage(text)) { console.log(`[Slack] Skipping: "${text.slice(0,40)}"`); return; }

  // Check if this is a disambiguation reply (just a number)
  const numMatch = text.trim().match(/^([1-9])$/);
  if (numMatch && channel) {
    const key = `${channel}_${thread_ts}`;
    const pending = pendingDisambiguations[key];
    if (pending) {
      const idx = parseInt(numMatch[1]) - 1;
      if (idx >= 0 && idx < pending.candidates.length) {
        const chosen = pending.candidates[idx];
        delete pendingDisambiguations[key];
        await applyAthleteUpdate(chosen, pending.parsed);
        await sendSlackMessage(channel, `✓ Got it — updated ${chosen.athlete}.`, thread_ts);
      } else {
        await sendSlackMessage(channel, `Please reply with a number between 1 and ${pending.candidates.length}.`, thread_ts);
      }
      return;
    }
  }

  const system = `Extract athlete update from CrossFit coach notes. Athlete name is first.
Return ONLY valid JSON, no markdown.
Format: {"athlete":"Full Name","injuries":null,"upcoming":null,"dos":null,"donts":null,"checkin_scheduled":null,"coach_notes":"full summary"}
Use null for fields not mentioned.
IMPORTANT:
- "upcoming" is ONLY for travel, trips, vacations, or planned absences from the gym. Do NOT put start dates, first class dates, or check-in dates here.
- "checkin_scheduled" is ONLY for a scheduled check-in appointment date (e.g. "check-in scheduled for July 15" → "2026-07-15", "goal review next Tuesday" → date). Use YYYY-MM-DD format. Use null if no check-in is scheduled.`;
  const raw = await callClaude(system, `Parse this update:\n\n${text}`);
  const parsed = parseJSON(raw);
  if (!parsed?.athlete) { console.log("Could not parse athlete name"); return; }

  // Fuzzy match — handle ambiguous first names
  const { match, ambiguous, candidates } = await findAthleteByNameFuzzy(parsed.athlete);

  if (ambiguous && channel) {
    // Store pending disambiguation
    const key = `${channel}_${thread_ts || Date.now()}`;
    pendingDisambiguations[key] = { candidates, parsed, text, expiresAt: Date.now() + 3600000 };
    const list = candidates.map((a, i) => `${i+1}. ${a.athlete}`).join('\n');
    await sendSlackMessage(channel, `Which ${parsed.athlete.split(' ')[0]}? Reply with the number:\n${list}`, thread_ts);
    return;
  }

  if (!match) {
    await addAthlete({ athlete: parsed.athlete, coach_notes: parsed.coach_notes || text });
    const newAthlete = await findAthlete(parsed.athlete);
    if (newAthlete) await generateAndCacheSummary(newAthlete);
    console.log(`Added new athlete: ${parsed.athlete}`);
    return;
  }
  await applyAthleteUpdate(match, parsed);
}

// ══════════════════════════════════════════════════════════════════════════════
// ROUTES
// ══════════════════════════════════════════════════════════════════════════════

app.post("/slack/events", async (req, res) => {
  if (!verifySlackSignature(req)) return res.status(403).json({ error: "Invalid signature" });
  const body = JSON.parse(req.body.toString());
  if (body.type === "url_verification") return res.json({ challenge: body.challenge });
  res.json({ ok: true });
  const event = body.event || {};
  if (event.type !== "message" || event.bot_id || !event.text) return;
  try {
    if (event.channel === NEW_ATHLETES_CHANNEL && event.text.toLowerCase().includes("new athlete")) await handleNewAthlete(event.text.trim());
    else if (event.channel === CURRENT_ATHLETES_CHANNEL) {
      const txt = event.text.trim();
      const ts = event.thread_ts || event.ts;
      if (detectCancellation(txt) && txt.length > 40) {
        await handleBatchCancellation(txt, event.channel, ts);
      } else {
        await handleAthleteUpdate(txt, event.channel, ts);
      }
    }
  } catch (err) { console.error("Slack error:", err.message); }
});

app.get("/athletes", async (req, res) => {
  try { res.json({ athletes: await getAllAthletes() }); } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get("/athletes/search", async (req, res) => {
  try {
    const athlete = await findAthlete(req.query.name, req.query.wodify_id);
    if (!athlete) return res.status(404).json({ error: "Not found" });
    res.json(athlete);
  } catch (err) { res.status(500).json({ error: err.message }); }
});


app.post("/athletes/:rowNumber/checkin", async (req, res) => {
  try {
    const rowNumber = parseInt(req.params.rowNumber);
    if (isNaN(rowNumber) || rowNumber < 3) return res.status(400).json({ error: "Invalid row" });

    const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });

    // Get member_since from Wodify if we have wodify_id
    let memberSince = null;
    const { wodify_id } = req.body;
    if (wodify_id) {
      try {
        const clientData = await wodifyGet(API_BASE, `/clients/${wodify_id}`);
        memberSince = clientData.member_since || null;
      } catch {}
    }

    // Calculate next check-in — 30 days if within first 90 days, else 90 days
    const joined = new Date(memberSince || today);
    const now = new Date();
    const daysSinceJoin = Math.round((now - joined) / 86400000);
    const intervalDays = daysSinceJoin < 90 ? 30 : 90;
    const next = new Date(today);
    next.setDate(next.getDate() + intervalDays);
    const nextCheckin = next.toISOString().slice(0, 10);

    await updateAthlete(rowNumber, { last_checkin: today, next_checkin: nextCheckin });
    console.log(`[CheckIn] Row ${rowNumber}: ${today} → next ${nextCheckin} (${intervalDays}-day interval)`);

    res.json({ ok: true, last_checkin: today, next_checkin: nextCheckin, interval_days: intervalDays });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.patch("/athletes/:rowNumber", async (req, res) => {
  try {
    const rowNumber = parseInt(req.params.rowNumber);
    if (isNaN(rowNumber) || rowNumber < 3) return res.status(400).json({ error: "Invalid row" });
    const athletes = await getAllAthletes();
    const current = athletes.find(a => a.row_number === rowNumber);
    await updateAthlete(rowNumber, req.body);
    const notesFields = ["goals","rx","injuries","dos","donts","upcoming","notes","coach_notes"];
    if (notesFields.some(f => req.body[f] !== undefined) && current) {
      generateAndCacheSummary({ ...current, ...req.body, row_number: rowNumber }).catch(e => console.error("Summary error:", e.message));
    }
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post("/athletes", async (req, res) => {
  try { await addAthlete(req.body); res.json({ ok: true }); } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get("/admin/regenerate-summaries", async (req, res) => {
  const forceAll = req.query.force === 'true';
  res.json({ ok: true, message: `Regenerating summaries in background (force=${forceAll})...` });
  try {
    const athletes = await getAllAthletes();
    const toUpdate = forceAll
      ? athletes.filter(a => a.goals || a.injuries || a.dos || a.donts || a.coach_notes || a.upcoming)
      : athletes.filter(a => !a.ai_summary && (a.goals || a.injuries || a.dos || a.donts || a.coach_notes));
    console.log(`[Admin] Regenerating ${toUpdate.length} summaries (force=${forceAll})`);
    for (const a of toUpdate) {
      await generateAndCacheSummary(a);
      await new Promise(r => setTimeout(r, 500));
    }
    console.log("[Admin] Done");
  } catch (err) { console.error("[Admin] Error:", err.message); }
});

app.post("/admin/update-anchor", (req, res) => {
  try {
    const { date, id } = req.body;
    if (!date || !id) return res.status(400).json({ error: "Invalid date or id" });
    const classId = parseInt(id);
    if (isNaN(classId)) return res.status(400).json({ error: "Invalid class ID" });
    anchorCache[date] = { date, id: classId, recurring_id: null };
    KNOWN_ANCHORS.push({ date, id: classId, recurring_id: null });
    KNOWN_ANCHORS.sort((a, b) => a.date.localeCompare(b.date));
    console.log(`[Anchor] Updated: ${date} -> ${classId}`);
    res.json({ ok: true, date, id: classId });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get("/admin/build-roster", async (req, res) => {
  res.json({ ok: true, message: "Building roster..." });
  buildRosterCache();
});

app.get("/roster", (req, res) => {
  try {
    if (!fs.existsSync(ROSTER_CACHE)) return res.status(404).json({ error: "Roster not built yet" });
    const cache = JSON.parse(fs.readFileSync(ROSTER_CACHE, "utf8"));
    res.json({ date: cache.date, built_at: cache.built_at, classes: Object.entries(cache.classes || {}).map(([id, cls]) => ({ class_id: id, class_name: cls.class_name, start_time: cls.start_time, athlete_count: cls.athletes?.length || 0 })) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get("/roster/:classId", (req, res) => {
  try {
    if (!fs.existsSync(ROSTER_CACHE)) return res.status(404).json({ error: "Roster not built yet" });
    const cache = JSON.parse(fs.readFileSync(ROSTER_CACHE, "utf8"));
    const cls = cache.classes?.[req.params.classId];
    if (!cls) return res.status(404).json({ error: "Class not in cache", available: Object.keys(cache.classes || {}) });
    res.json({ ...cls, cache_built_at: cache.built_at, date: cache.date });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get("/today-classes", async (req, res) => {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
  try {
    const found = await findTodaysClasses(today);
    res.json({ classes: found, date: today });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get("/wodify/*", async (req, res) => {
  const suffix = `/${req.params[0]}${Object.keys(req.query).length ? "?" + new URLSearchParams(req.query).toString() : ""}`;
  for (const base of [API_BASE, APP_BASE]) {
    try {
      const r = await fetch(`${base}${suffix}`, { headers: WODIFY_HEADERS });
      const text = await r.text();
      if (r.status !== 403 && !text.includes("Missing Authentication")) {
        try { res.status(r.status).json(JSON.parse(text)); } catch { res.status(r.status).send(text); }
        return;
      }
    } catch (e) { console.log(`Error: ${e.message}`); }
  }
  res.status(500).json({ error: "Both endpoints failed" });
});


// ══════════════════════════════════════════════════════════════════════════════
// PLAYBOOK — GitHub-backed shared storage
// ══════════════════════════════════════════════════════════════════════════════

const GITHUB_TOKEN    = process.env.GITHUB_TOKEN;
const GITHUB_REPO     = "vegvisircrossfit-commits/coach-dashboard-api";
const PLAYBOOK_FILE   = "playbook.json";
const PLAYBOOK_PIN    = process.env.PLAYBOOK_PIN || "vegvisir2026";

async function getPlaybookFromGitHub() {
  const resp = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/contents/${PLAYBOOK_FILE}`, {
    headers: { Authorization: `Bearer ${GITHUB_TOKEN}`, Accept: "application/vnd.github+json" }
  });
  if (!resp.ok) throw new Error(`GitHub fetch failed: ${resp.status}`);
  const data = await resp.json();
  const content = Buffer.from(data.content, "base64").toString("utf8");
  return { playbook: JSON.parse(content), sha: data.sha };
}

async function savePlaybookToGitHub(playbook, sha) {
  const content = Buffer.from(JSON.stringify(playbook, null, 2)).toString("base64");
  const resp = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/contents/${PLAYBOOK_FILE}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${GITHUB_TOKEN}`, Accept: "application/vnd.github+json", "Content-Type": "application/json" },
    body: JSON.stringify({ message: "Update playbook", content, sha })
  });
  if (!resp.ok) { const e = await resp.json(); throw new Error(`GitHub save failed: ${e.message}`); }
  return resp.json();
}

app.get("/playbook/debug", async (req, res) => {
  try {
    const resp = await fetch(`https://raw.githubusercontent.com/${GITHUB_REPO}/main/${PLAYBOOK_FILE}`, {
      headers: { Authorization: `Bearer ${GITHUB_TOKEN}` }
    });
    res.json({ status: resp.status, ok: resp.ok, hasToken: !!GITHUB_TOKEN, repo: GITHUB_REPO, file: PLAYBOOK_FILE });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get("/playbook", async (req, res) => {
  try {
    const { playbook } = await getPlaybookFromGitHub();
    res.json(playbook);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post("/playbook/sop", async (req, res) => {
  const { pin, key, sop } = req.body;
  if (pin !== PLAYBOOK_PIN) return res.status(403).json({ error: "Invalid PIN" });
  if (!key || !sop) return res.status(400).json({ error: "Missing key or sop" });
  try {
    const { playbook, sha } = await getPlaybookFromGitHub();
    playbook.sops = playbook.sops || {};
    playbook.sops[key] = sop;
    playbook.lastUpdated = new Date().toISOString();
    await savePlaybookToGitHub(playbook, sha);
    res.json({ ok: true, key });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete("/playbook/sop/:key", async (req, res) => {
  const { pin } = req.body;
  if (pin !== PLAYBOOK_PIN) return res.status(403).json({ error: "Invalid PIN" });
  try {
    const { playbook, sha } = await getPlaybookFromGitHub();
    delete playbook.sops[req.params.key];
    playbook.lastUpdated = new Date().toISOString();
    await savePlaybookToGitHub(playbook, sha);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});


// ══════════════════════════════════════════════════════════════════════════════
// WOD LIBRARY — GitHub-backed shared storage
// ══════════════════════════════════════════════════════════════════════════════

const WODS_FILE = "wods.json";

// WODs: fetch from GitHub once, cache in memory for 24 hours
// Uses streaming JSON parse to handle large file reliably
let wodsCache = null;
let wodsCacheTime = 0;
const WODS_CACHE_TTL = 24 * 60 * 60 * 1000;
const WODS_DISK_CACHE = '/tmp/wods_cache.json';

async function getWodsFromGitHub() {
  const now = Date.now();

  // Memory cache hit
  if (wodsCache && (now - wodsCacheTime) < WODS_CACHE_TTL) {
    return wodsCache;
  }

  // Disk cache hit (survives memory resets)
  if (fs.existsSync(WODS_DISK_CACHE)) {
    try {
      const stat = fs.statSync(WODS_DISK_CACHE);
      if ((now - stat.mtimeMs) < WODS_CACHE_TTL) {
        console.log('[WODs] Loading from disk cache...');
        const raw = fs.readFileSync(WODS_DISK_CACHE, 'utf8');
        wodsCache = JSON.parse(raw);
        wodsCacheTime = now;
        console.log(`[WODs] Disk cache hit: ${wodsCache.workouts?.length} workouts`);
        return wodsCache;
      }
    } catch(e) { console.log('[WODs] Disk cache invalid, refetching'); }
  }

  // Fetch from GitHub
  console.log('[WODs] Fetching from GitHub...');
  // For large files, use GitHub API with download_url which handles auth properly
  const metaResp = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/contents/${WODS_FILE}`, {
    headers: { Authorization: `Bearer ${GITHUB_TOKEN}`, Accept: 'application/vnd.github+json' }
  });
  if (!metaResp.ok) throw new Error(`GitHub meta fetch failed: ${metaResp.status}`);
  const meta = await metaResp.json();
  // Use download_url for the actual content — avoids base64 encoding issues
  const resp = await fetch(meta.download_url);
  if (!resp.ok) throw new Error(`GitHub WODs fetch failed: ${resp.status}`);

  const text = await resp.text();
  console.log(`[WODs] Received ${text.length} chars from GitHub`);

  let data;
  try {
    data = JSON.parse(text);
  } catch(e) {
    throw new Error(`WODs JSON parse failed: ${e.message} (received ${text.length} chars, starts: ${text.slice(0,50)})`);
  }

  // Save to disk and memory
  wodsCache = data;
  wodsCacheTime = now;
  try { fs.writeFileSync(WODS_DISK_CACHE, JSON.stringify(data)); } catch(e) {}
  console.log(`[WODs] Fetched and cached ${data.workouts?.length} workouts`);
  return data;
}

app.get("/wods", async (req, res) => {
  try {
    const wods = await getWodsFromGitHub();
    // Deduplicate by name — keep the most recent occurrence of each workout name
    const workouts = wods.workouts || [];
    const seen = new Map();
    for (const w of workouts) {
      const key = w.name.toLowerCase().trim();
      const existing = seen.get(key);
      // Keep entry with a date if available, otherwise keep first seen
      if (!existing || (!existing.date && w.date) || (w.date && w.date > existing.date)) {
        seen.set(key, w);
      }
    }
    const deduped = Array.from(seen.values());
    console.log(`[WODs] Serving ${deduped.length} workouts (deduped from ${workouts.length})`);
    res.json({ workouts: deduped, version: wods.version, lastUpdated: wods.lastUpdated });
  } catch (err) {
    console.error('[WODs] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});


// Audio transcription proxy (browser can't call Anthropic API directly due to CORS)
app.post("/transcribe", async (req, res) => {
  try {
    const { audio_base64, media_type } = req.body;
    if (!audio_base64) return res.status(400).json({ error: "Missing audio_base64" });
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "anthropic-version": "2023-06-01",
        "x-api-key": ANTHROPIC_API_KEY
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 2000,
        messages: [{
          role: "user",
          content: [
            { type: "document", source: { type: "base64", media_type: media_type || "audio/mp4", data: audio_base64 } },
            { type: "text", text: "Transcribe this audio recording exactly as spoken. Output only the transcription, nothing else." }
          ]
        }]
      })
    });
    const data = await resp.json();
    if (!resp.ok) return res.status(resp.status).json({ error: data?.error?.message || "Claude error" });
    const text = data.content?.map(b => b.text || "").join("").trim() || "";
    res.json({ transcript: text });
  } catch (err) { res.status(500).json({ error: err.message }); }
});


// General Claude proxy (browser can't call Anthropic API directly due to CORS)
app.post("/claude", async (req, res) => {
  try {
    const body = req.body;
    if (!body.model) body.model = "claude-sonnet-4-6";
    if (!body.max_tokens) body.max_tokens = 1000;
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "anthropic-version": "2023-06-01",
        "x-api-key": ANTHROPIC_API_KEY
      },
      body: JSON.stringify(body)
    });
    const data = await resp.json();
    if (!resp.ok) return res.status(resp.status).json(data);
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});


// ══════════════════════════════════════════════════════════════════════════════
// ATHLETE CHECK-IN SYNC — pulls from Wodify appointments, updates Sheet
// ══════════════════════════════════════════════════════════════════════════════

const CHECKIN_SERVICE_ID = "13312";

async function getClientMemberSince(clientId) {
  try {
    const data = await wodifyGet(API_BASE, `/clients/${clientId}`);
    return data.member_since || null;
  } catch { return null; }
}

function calcNextCheckin(lastCheckinDate, memberSinceDate) {
  const last = new Date(lastCheckinDate);
  const memberSince = new Date(memberSinceDate || lastCheckinDate);
  const now = new Date();
  // Within first 90 days of membership → 30-day intervals
  const daysSinceJoin = Math.round((now - memberSince) / 86400000);
  const intervalDays = daysSinceJoin < 90 ? 30 : 90;
  const next = new Date(last);
  next.setDate(next.getDate() + intervalDays);
  return { nextCheckin: next.toISOString().slice(0, 10), intervalDays };
}

async function syncAthleteCheckIns() {
  console.log("[CheckIn Sync] Starting...");
  try {
    // Page through all Athlete Check-In bookings, newest first
    const latestByClient = {};
    let page = 1;

    while (true) {
      const data = await wodifyGet(API_BASE,
        `/appointments/bookings/clients?page=${page}&page_size=200&sort=desc_local_appointment_start_datetime`
      );
      const bookings = data.client_appointment_bookings || [];
      if (!bookings.length) break;

      for (const b of bookings) {
        if (String(b.service_id) !== CHECKIN_SERVICE_ID) continue;
        if (![2, 4].includes(b.booking_status_id)) continue;
        const clientId = String(b.client_id);
        const dateStr = b.local_appointment_start_datetime?.slice(0, 10) || "";
        if (!dateStr) continue;
        // Sorted desc — first hit per client = most recent
        if (!latestByClient[clientId]) {
          latestByClient[clientId] = { name: b.client, date: dateStr, clientId };
        }
      }

      const oldest = bookings[bookings.length - 1];
      const oldestDate = oldest?.local_appointment_start_datetime?.slice(0, 10) || "";
      if (oldestDate && oldestDate < "2024-01-01") break;
      if (!data.pagination?.has_more) break;
      page++;
    }

    console.log(`[CheckIn Sync] Found ${Object.keys(latestByClient).length} athletes with check-ins`);

    const athletes = await getAllAthletes();
    const updates = [];

    for (const athlete of athletes) {
      const match = latestByClient[athlete.wodify_id] ||
        Object.values(latestByClient).find(c =>
          c.name.toLowerCase() === athlete.athlete.toLowerCase()
        );

      // Get member_since from Wodify client record
      const wodifyId = athlete.wodify_id || (match && match.clientId);
      const memberSince = wodifyId ? await getClientMemberSince(wodifyId) : null;

      let lastCheckin, nextCheckin, intervalDays;

      if (match) {
        lastCheckin = match.date;
        const calc = calcNextCheckin(lastCheckin, memberSince);
        nextCheckin = calc.nextCheckin;
        intervalDays = calc.intervalDays;
      } else if (memberSince) {
        // No check-in yet — use member_since as last check-in baseline
        lastCheckin = memberSince;
        const calc = calcNextCheckin(memberSince, memberSince);
        nextCheckin = calc.nextCheckin;
        intervalDays = calc.intervalDays;
      } else {
        continue;
      }

      if (athlete.last_checkin === lastCheckin && athlete.next_checkin === nextCheckin) continue;

      updates.push(
        { range: `Sheet1!B${athlete.row_number}`, values: [[lastCheckin]] },
        { range: `Sheet1!C${athlete.row_number}`, values: [[nextCheckin]] }
      );
      console.log(`[CheckIn Sync] ${athlete.athlete}: last=${lastCheckin} next=${nextCheckin} (${intervalDays}-day interval)`);

      // Rate limit client lookups
      await new Promise(r => setTimeout(r, 100));
    }

    if (updates.length) {
      await sheetsBatchUpdate(updates);
      console.log(`[CheckIn Sync] Updated ${updates.length / 2} athletes`);
    } else {
      console.log("[CheckIn Sync] No updates needed");
    }

    return { updated: updates.length / 2, total: Object.keys(latestByClient).length };
  } catch (err) {
    console.error("[CheckIn Sync] Error:", err.message);
    throw err;
  }
}

// Run once daily at 3AM CST
let lastCheckinSync = null;
function startCheckinCron() {
  setInterval(() => {
    const now = new Date().toLocaleString("en-US", {
      timeZone: "America/Chicago", hour: "2-digit", minute: "2-digit", hour12: false
    });
    const hhmm = now.replace(",", "").trim().slice(0, 5);
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
    if (hhmm === "03:00" && lastCheckinSync !== today) {
      lastCheckinSync = today;
      console.log("[CheckIn Cron] Running daily sync");
      syncAthleteCheckIns().catch(e => console.error("[CheckIn Cron] Error:", e.message));
    }
  }, 30000);
  console.log("[CheckIn Cron] Started");
}

// Manual trigger
app.get("/admin/sync-checkins", async (req, res) => {
  try {
    const result = await syncAthleteCheckIns();
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete athlete row from Sheet (PIN protected)
app.delete("/athletes/:rowNumber", async (req, res) => {
  try {
    const { pin } = req.body;
    if (pin !== (process.env.PLAYBOOK_PIN || "vegvisir2026")) return res.status(403).json({ error: "Invalid PIN" });
    const rowNumber = parseInt(req.params.rowNumber);
    if (isNaN(rowNumber) || rowNumber < 3) return res.status(400).json({ error: "Invalid row" });
    const token = await getGoogleToken();
    // Clear the entire row
    const ranges = "ABCDEFGHIJKLMN".split('').map(col => `Sheet1!${col}${rowNumber}`);
    await sheetsBatchUpdate(ranges.map(range => ({ range, values: [['']] })));
    console.log(`[Delete] Row ${rowNumber} cleared`);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.listen(PORT, () => { console.log(`Server running on port ${PORT}`); startRosterCron(); startCheckinCron(); });

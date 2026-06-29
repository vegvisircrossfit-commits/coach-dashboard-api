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
app.use(express.json());

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

async function findTodaysClasses(today) {
  // Use exact anchor if available
  if (anchorCache[today]) {
    const anchor = anchorCache[today];
    const WINDOW = 150;
    const ids = Array.from({ length: WINDOW * 2 + 1 }, (_, i) => anchor.id - WINDOW + i);
    console.log(`Using exact anchor for ${today}: ${anchor.id}`);
    const results = await Promise.all(
      ids.map(id =>
        wodifyGet(API_BASE, `/classes/${id}`)
          .then(data => {
            if (data.start_date === today && !data.is_cancelled && RECURRING_IDS.has(data.recurring_class_id)) return data;
            return null;
          }).catch(() => null)
      )
    );
    return results.filter(Boolean)
      .filter((c, i, arr) => arr.findIndex(x => x.recurring_class_id === c.recurring_class_id) === i)
      .sort((a, b) => a.start_time > b.start_time ? 1 : -1);
  }

  // Fallback: find closest anchor and estimate
  const sorted = KNOWN_ANCHORS.slice().sort((a, b) => a.date.localeCompare(b.date));
  let best = sorted[sorted.length - 1];
  for (const a of sorted) { if (a.date <= today) best = a; }
  const daysDiff = Math.round((new Date(today) - new Date(best.date)) / 86400000);
  const estimated = best.id + daysDiff * 75000;
  const WINDOW = 300;
  console.log(`Estimating for ${today}: ~${estimated} (${daysDiff} days from ${best.date})`);
  const ids = Array.from({ length: WINDOW * 2 + 1 }, (_, i) => estimated - WINDOW + i);
  const results = await Promise.all(
    ids.map(id =>
      wodifyGet(API_BASE, `/classes/${id}`)
        .then(data => {
          if (data.start_date === today && !data.is_cancelled && RECURRING_IDS.has(data.recurring_class_id)) return data;
          return null;
        }).catch(() => null)
    )
  );
  const found = results.filter(Boolean)
    .filter((c, i, arr) => arr.findIndex(x => x.recurring_class_id === c.recurring_class_id) === i)
    .sort((a, b) => a.start_time > b.start_time ? 1 : -1);
  if (found.length > 0 && !anchorCache[today]) {
    anchorCache[today] = { date: today, id: found[0].id, recurring_id: found[0].recurring_class_id };
  }
  return found;
}

// ══════════════════════════════════════════════════════════════════════════════
// GOOGLE SHEETS
// ══════════════════════════════════════════════════════════════════════════════

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
    last_checkin: row[COL.last_checkin], next_checkin: row[COL.next_checkin],
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
Format: {"dos":["max 3 short bullets"],"donts":["max 3 short bullets"],"injuries":"one line or empty","upcoming":"one line or empty","summary":"one sentence"}
Each bullet under 8 words.`;
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
Use empty string for missing fields.`;
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

async function handleAthleteUpdate(text) {
  if (!looksLikeAthleteMessage(text)) { console.log(`[Slack] Skipping: "${text.slice(0,40)}"`); return; }
  const system = `Extract athlete update from CrossFit coach notes. Athlete name is first.
Return ONLY valid JSON, no markdown.
Format: {"athlete":"Full Name","injuries":null,"upcoming":null,"dos":null,"donts":null,"coach_notes":"full summary"}
Use null for fields not mentioned.`;
  const raw = await callClaude(system, `Parse this update:\n\n${text}`);
  const parsed = parseJSON(raw);
  if (!parsed?.athlete) { console.log("Could not parse athlete name"); return; }
  const existing = await findAthlete(parsed.athlete);
  if (!existing) {
    await addAthlete({ athlete: parsed.athlete, coach_notes: parsed.coach_notes || text });
    const newAthlete = await findAthlete(parsed.athlete);
    if (newAthlete) await generateAndCacheSummary(newAthlete);
    return;
  }
  const fields = {};
  ["injuries","upcoming","dos","donts"].forEach(k => { if (parsed[k]) fields[k] = parsed[k]; });
  if (parsed.coach_notes) {
    const date = new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
    const prev = existing.coach_notes || "";
    fields.coach_notes = prev ? `${prev}\n[${date}] ${parsed.coach_notes}` : `[${date}] ${parsed.coach_notes}`;
  }
  if (Object.keys(fields).length) {
    await updateAthlete(existing.row_number, fields);
    await generateAndCacheSummary({ ...existing, ...fields });
  }
  console.log(`Updated athlete: ${parsed.athlete}`);
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
    else if (event.channel === CURRENT_ATHLETES_CHANNEL) await handleAthleteUpdate(event.text.trim());
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
  res.json({ ok: true, message: "Regenerating summaries in background..." });
  try {
    const athletes = await getAllAthletes();
    const needsSummary = athletes.filter(a => !a.ai_summary && (a.goals || a.injuries || a.dos || a.donts || a.coach_notes));
    console.log(`[Admin] Regenerating ${needsSummary.length} summaries`);
    for (const a of needsSummary) { await generateAndCacheSummary(a); await new Promise(r => setTimeout(r, 500)); }
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

app.listen(PORT, () => { console.log(`Server running on port ${PORT}`); startRosterCron(); });

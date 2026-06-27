const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;

// ── Config ────────────────────────────────────────────────────────────────────
const WODIFY_API_KEY           = process.env.WODIFY_API_KEY;
const ANTHROPIC_API_KEY        = process.env.ANTHROPIC_API_KEY;
const SLACK_SIGNING_SECRET     = process.env.SLACK_SIGNING_SECRET;
const SLACK_BOT_TOKEN          = process.env.SLACK_BOT_TOKEN;
const GOOGLE_SA_JSON           = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
const NEW_ATHLETES_CHANNEL     = process.env.NEW_ATHLETES_CHANNEL;
const CURRENT_ATHLETES_CHANNEL = process.env.CURRENT_ATHLETES_CHANNEL;
const SHEET_ID                 = "1wC31nqMDhhNsXnkCxqihPVWFvRhqioDezFC9ifhXYf0";
const ROSTER_CACHE             = process.env.ROSTER_CACHE_FILE || "/tmp/roster_cache.json";
const LOCATION_ID              = 6982;

const API_BASE     = "https://api.wodify.com/v1";
const APP_BASE     = "https://app-api.wodify.com/v1";
const WODIFY_HEADERS = { "x-api-key": WODIFY_API_KEY, "Accept": "application/json" };

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors());
app.use("/slack/events", express.raw({ type: "application/json" }));
app.use(express.json());

// ── Static ────────────────────────────────────────────────────────────────────
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "index.html")));
app.get("/health", (req, res) => res.json({
  status: "ok",
  hasAnthropicKey: !!ANTHROPIC_API_KEY,
  hasGoogleKey: !!GOOGLE_SA_JSON,
  hasWodifyKey: !!WODIFY_API_KEY,
}));

// ══════════════════════════════════════════════════════════════════════════════
// WODIFY HELPERS
// ══════════════════════════════════════════════════════════════════════════════

async function wodifyGet(base, endpoint) {
  const r = await fetch(`${base}${endpoint}`, { headers: WODIFY_HEADERS });
  return r.json();
}

const RECURRING_IDS = new Set([
  205659, 195631, 195633, 254489, 195634, 195635, 522818,
  293074, 429300, 342890, 358767, 407780, 272141, 559450, 561511
]);
const ANCHOR_RECURRING_ID = 205659;
const KNOWN_ANCHORS = [
  { date: "2026-06-18", id: 174326847 },
  { date: "2026-06-19", id: 174420392 },
  { date: "2026-06-22", id: 174558953 },
  { date: "2026-06-26", id: 174846876 },
];
const anchorCache = {};
KNOWN_ANCHORS.forEach(a => { anchorCache[a.date] = a.id; });

async function findAnchorId(today) {
  if (anchorCache[today]) return anchorCache[today];
  const sorted = KNOWN_ANCHORS.slice().sort((a, b) => a.date.localeCompare(b.date));
  let best = sorted[sorted.length - 1];
  for (const a of sorted) { if (a.date <= today) best = a; }
  const daysDiff = Math.round((new Date(today) - new Date(best.date)) / 86400000);
  let lo = best.id + daysDiff * 40000;
  let hi = best.id + daysDiff * 100000 + 300000;
  for (let i = 0; i < 30; i++) {
    const mid = Math.floor((lo + hi) / 2);
    try {
      const data = await wodifyGet(API_BASE, `/classes/${mid}`);
      if (!data.start_date) { lo = mid + 1; continue; }
      if (data.start_date === today && data.recurring_class_id === ANCHOR_RECURRING_ID) {
        anchorCache[today] = mid; return mid;
      }
      if (data.start_date < today) lo = mid + 1; else hi = mid - 1;
    } catch (e) { lo = mid + 1; }
  }
  const mid = Math.floor((lo + hi) / 2);
  anchorCache[today] = mid; return mid;
}

// ══════════════════════════════════════════════════════════════════════════════
// GOOGLE SHEETS HELPER
// ══════════════════════════════════════════════════════════════════════════════

// Column layout (A=0 … N=13)
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
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/spreadsheets",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600, iat: now
  })).toString("base64url");
  const { createSign } = require("crypto");
  const sign = createSign("RSA-SHA256");
  sign.update(`${header}.${payload}`);
  const sig = sign.sign(sa.private_key, "base64url");
  const jwt = `${header}.${payload}.${sig}`;
  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
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
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values:batchUpdate`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ valueInputOption: "USER_ENTERED", data })
  });
  return resp.json();
}

async function sheetsAppend(values) {
  const token = await getGoogleToken();
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/Sheet1!A3:N:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ values })
  });
  return resp.json();
}

function rowToAthlete(row, rowIndex) {
  row = [...row, ...Array(14).fill("")].slice(0, 14);
  const name = (row[COL.athlete] || "").toString().trim();
  if (!name) return null;
  return {
    row_number:   rowIndex,
    athlete:      name,
    last_checkin: row[COL.last_checkin],
    next_checkin: row[COL.next_checkin],
    notes:        row[COL.notes],
    goals:        row[COL.goals],
    rx:           row[COL.rx],
    injuries:     row[COL.injuries],
    dos:          row[COL.dos],
    donts:        row[COL.donts],
    upcoming:     row[COL.upcoming],
    coach_notes:  row[COL.coach_notes],
    wodify_id:    (row[COL.wodify_id] || "").toString().trim(),
    last_updated: row[COL.last_updated],
    ai_summary:   row[COL.ai_summary] || "",
  };
}

async function getAllAthletes() {
  const result = await sheetsGet("Sheet1!A3:N");
  const rows = result.values || [];
  return rows.map((row, i) => rowToAthlete(row, 3 + i)).filter(Boolean);
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
    .map(([key, value]) => ({
      range: `Sheet1!${FIELD_TO_COL[key]}${rowNumber}`,
      values: [[value]]
    }))
    .filter(d => d.range && !d.range.includes("undefined"));
  if (data.length) await sheetsBatchUpdate(data);
}

async function addAthlete(fields) {
  const now = new Date().toLocaleString("en-US", { timeZone: "America/Chicago" });
  const row = Array(14).fill("");
  Object.entries(fields).forEach(([key, value]) => {
    if (COL[key] !== undefined) row[COL[key]] = value || "";
  });
  row[COL.last_updated] = now;
  await sheetsAppend([row]);
}

// ══════════════════════════════════════════════════════════════════════════════
// CLAUDE HELPERS
// ══════════════════════════════════════════════════════════════════════════════

function parseJSON(text) {
  try { return JSON.parse(text.replace(/```json|```/g, "").trim()); }
  catch { return null; }
}

async function callClaude(system, userMessage) {
  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "anthropic-version": "2023-06-01",
      "x-api-key": ANTHROPIC_API_KEY
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 600,
      system,
      messages: [{ role: "user", content: userMessage }]
    })
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(data?.error?.message || `Claude error ${resp.status}`);
  return data.content?.map(b => b.text || "").join("").trim() || "";
}

// ── AI Summary — generate and cache to column N ───────────────────────────────
// Only called when notes-related fields actually change.
// Returns the summary string.

const AI_SUMMARY_FIELDS = ["goals","rx","injuries","dos","donts","upcoming","notes","coach_notes"];

function notesHash(athlete) {
  return AI_SUMMARY_FIELDS.map(f => athlete[f] || "").join("|");
}

async function generateAndCacheSummary(athlete) {
  const context = [
    athlete.goals     && `Goals: ${athlete.goals}`,
    athlete.rx        && `Prescription: ${athlete.rx}`,
    athlete.injuries  && `Injuries: ${athlete.injuries}`,
    athlete.dos       && `Do's: ${athlete.dos}`,
    athlete.donts     && `Don'ts: ${athlete.donts}`,
    athlete.upcoming  && `Upcoming: ${athlete.upcoming}`,
    athlete.notes     && `Notes: ${athlete.notes}`,
    athlete.coach_notes && `Coach Notes: ${athlete.coach_notes}`,
  ].filter(Boolean).join("\n");

  if (!context) return "";

  const system = `You create ultra-concise coach briefs for CrossFit athletes. 
Return ONLY valid JSON, no markdown.
Format: {
  "dos": ["max 3 short bullets"],
  "donts": ["max 3 short bullets"],
  "injuries": "one line or empty string",
  "upcoming": "one line or empty string",
  "summary": "one sentence coach prep note"
}
Each bullet under 8 words. Be specific and actionable.`;

  const raw = await callClaude(system, `Athlete: ${athlete.athlete}\n\n${context}`);
  const parsed = parseJSON(raw);
  if (!parsed) return context.slice(0, 200);

  const summary = JSON.stringify(parsed);
  // Cache it back to the sheet
  await sheetsBatchUpdate([{
    range: `Sheet1!N${athlete.row_number}`,
    values: [[summary]]
  }]);
  console.log(`AI summary cached for ${athlete.athlete}`);
  return summary;
}

// Get summary — use cached if available, generate if not
async function getAthleteSummary(athlete) {
  if (athlete.ai_summary) {
    try { return JSON.parse(athlete.ai_summary); } catch {}
  }
  const raw = await generateAndCacheSummary(athlete);
  try { return JSON.parse(raw); } catch { return null; }
}

// ══════════════════════════════════════════════════════════════════════════════
// ROSTER BUILDER (runs in-process on a cron)
// ══════════════════════════════════════════════════════════════════════════════

async function fetchTodaysReservations(dateStr) {
  const reservations = [];
  let page = 1;
  console.log(`[Roster] Fetching reservations for ${dateStr}...`);
  while (true) {
    const data = await wodifyGet(API_BASE, `/client_class_reservations?page=${page}&page_size=200`);
    const rows = data.client_class_reservations || [];
    if (!rows.length) break;

    const todayRows = rows.filter(r =>
      r.local_class_start_datetime?.startsWith(dateStr) &&
      r.reservation_status_id !== 1  // exclude cancelled
    );
    reservations.push(...todayRows);

    const lastDate = rows[rows.length - 1]?.local_class_start_datetime?.slice(0, 10) || "";
    if (lastDate > dateStr) { console.log(`[Roster] Passed today on page ${page}`); break; }
    if (!data.pagination?.has_more) break;
    page++;
  }
  console.log(`[Roster] Found ${reservations.length} reservations for ${dateStr}`);
  return reservations;
}

async function buildRosterCache() {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
  console.log(`[Roster] Building cache for ${today}`);

  try {
    const reservations = await fetchTodaysReservations(today);
    if (!reservations.length) {
      console.log("[Roster] No reservations found");
      return;
    }

    // Group by class_id → list of client names
    const classMap = {};
    for (const r of reservations) {
      const cid = String(r.class_id);
      if (!classMap[cid]) {
        classMap[cid] = {
          class_id: cid,
          class_name: r.class || "",
          start_time: r.local_class_start_datetime || "",
          client_names: [],
          client_ids: [],
        };
      }
      classMap[cid].client_names.push((r.client || "").toLowerCase());
      classMap[cid].client_ids.push(String(r.client_id || ""));
    }

    // Load sheet athletes
    const athletes = await getAllAthletes();
    const byName = {};
    const byWodifyId = {};
    athletes.forEach(a => {
      byName[a.athlete.toLowerCase()] = a;
      if (a.wodify_id) byWodifyId[a.wodify_id] = a;
    });

    // Enrich each class with matched athlete data
    const enriched = {};
    for (const [cid, cls] of Object.entries(classMap)) {
      const matchedAthletes = [];
      const seen = new Set();
      for (let i = 0; i < cls.client_names.length; i++) {
        const clientName = cls.client_names[i];
        const clientId = cls.client_ids[i];
        const sheetAthlete = byWodifyId[clientId] || byName[clientName];
        const key = clientId || clientName;
        if (seen.has(key)) continue;
        seen.add(key);

        if (sheetAthlete) {
          // Use cached AI summary — no API call here
          let summary = null;
          if (sheetAthlete.ai_summary) {
            try { summary = JSON.parse(sheetAthlete.ai_summary); } catch {}
          }
          matchedAthletes.push({
            ...sheetAthlete,
            coaching_brief: summary,
            has_notes: true,
          });
        } else {
          // Athlete not in sheet yet
          matchedAthletes.push({
            athlete: cls.client_names[i],
            row_number: null,
            has_notes: false,
            coaching_brief: null,
          });
        }
      }
      enriched[cid] = { ...cls, athletes: matchedAthletes };
      console.log(`[Roster] ${cls.class_name}: ${matchedAthletes.length} athletes (${matchedAthletes.filter(a => a.has_notes).length} with notes)`);
    }

    const cache = {
      date: today,
      built_at: new Date().toISOString(),
      classes: enriched,
    };
    fs.writeFileSync(ROSTER_CACHE, JSON.stringify(cache));
    console.log(`[Roster] Cache written — ${Object.keys(enriched).length} classes`);
  } catch (err) {
    console.error("[Roster] Build failed:", err.message);
  }
}

// ── Cron scheduler — fires 15 min before each class (CST) ────────────────────
// Class times: 5AM, 6AM, 7:30AM, 9AM, 3PM, 4PM, 5PM, 6PM
// Run times:   4:44, 5:44, 7:14, 8:44, 14:44, 15:44, 16:44, 17:44

const ROSTER_RUN_TIMES = new Set([
  "04:44", "05:44", "07:14", "08:44", "14:44", "15:44", "16:44", "17:44"
]);
let lastRosterMinute = null;

function startRosterCron() {
  setInterval(() => {
    const now = new Date().toLocaleString("en-US", {
      timeZone: "America/Chicago",
      hour: "2-digit", minute: "2-digit", hour12: false
    });
    const hhmm = now.replace(",", "").trim().slice(0, 5);
    if (ROSTER_RUN_TIMES.has(hhmm) && hhmm !== lastRosterMinute) {
      lastRosterMinute = hhmm;
      console.log(`[Roster Cron] Triggered at ${hhmm} CST`);
      buildRosterCache();
    }
  }, 30000); // check every 30 seconds
  console.log("[Roster Cron] Started");
}

// ══════════════════════════════════════════════════════════════════════════════
// SLACK HELPERS
// ══════════════════════════════════════════════════════════════════════════════

function verifySlackSignature(req) {
  if (!SLACK_SIGNING_SECRET) return true;
  const timestamp = req.headers["x-slack-request-timestamp"];
  if (Math.abs(Date.now() / 1000 - timestamp) > 300) return false;
  const body = req.body.toString();
  const sigBase = `v0:${timestamp}:${body}`;
  const sig = "v0=" + crypto.createHmac("sha256", SLACK_SIGNING_SECRET).update(sigBase).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(req.headers["x-slack-signature"] || "v0="));
}

// Filter out non-athlete messages before hitting Claude
function looksLikeAthleteMessage(text) {
  if (text.length < 20) return false;  // too short to be an athlete note
  const ignorePatterns = [
    /^now done/i, /^testing/i, /^test$/i, /^👍/, /^✅/,
    /^https?:\/\//i, /^<http/i,  // links only
  ];
  return !ignorePatterns.some(p => p.test(text.trim()));
}

async function handleNewAthlete(text) {
  const system = `You extract structured athlete data from CrossFit gym consultation notes.
Return ONLY valid JSON, no markdown.
Format: {"athlete":"Full Name","goals":"...","injuries":"...","dos":"...","donts":"...","upcoming":"...","notes":"...","coach_notes":"one sentence summary"}
Use empty string for missing fields. Never invent information.`;

  const raw = await callClaude(system, `Parse this new athlete consultation note:\n\n${text}`);
  const parsed = parseJSON(raw);
  if (!parsed?.athlete) { console.log("Could not parse new athlete name"); return; }

  const existing = await findAthlete(parsed.athlete);
  if (existing) {
    const fields = Object.fromEntries(Object.entries(parsed).filter(([k, v]) => v && k !== "athlete"));
    await updateAthlete(existing.row_number, fields);
    // Regenerate AI summary since notes changed
    const updated = { ...existing, ...fields };
    await generateAndCacheSummary(updated);
    console.log(`Updated existing athlete: ${parsed.athlete}`);
  } else {
    await addAthlete(parsed);
    // Find the newly added row and generate summary
    const newAthlete = await findAthlete(parsed.athlete);
    if (newAthlete) await generateAndCacheSummary({ ...newAthlete, ...parsed });
    console.log(`Added new athlete: ${parsed.athlete}`);
  }
}

async function handleAthleteUpdate(text) {
  if (!looksLikeAthleteMessage(text)) {
    console.log(`[Slack] Skipping non-athlete message: "${text.slice(0, 40)}"`);
    return;
  }

  const system = `You extract athlete update info from CrossFit coach notes. Athlete name is first in the message.
Return ONLY valid JSON, no markdown.
Format: {"athlete":"Full Name","injuries":null,"upcoming":null,"dos":null,"donts":null,"coach_notes":"full update summary"}
Use null for fields not mentioned — don't overwrite with empty string.`;

  const raw = await callClaude(system, `Parse this athlete update:\n\n${text}`);
  const parsed = parseJSON(raw);
  if (!parsed?.athlete) { console.log("Could not parse athlete name from update"); return; }

  const existing = await findAthlete(parsed.athlete);
  if (!existing) {
    await addAthlete({ athlete: parsed.athlete, coach_notes: parsed.coach_notes || text });
    const newAthlete = await findAthlete(parsed.athlete);
    if (newAthlete) await generateAndCacheSummary(newAthlete);
    console.log(`Added new athlete from update: ${parsed.athlete}`);
    return;
  }

  const fields = {};
  ["injuries", "upcoming", "dos", "donts"].forEach(k => { if (parsed[k]) fields[k] = parsed[k]; });

  if (parsed.coach_notes) {
    const date = new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
    const prev = existing.coach_notes || "";
    fields.coach_notes = prev ? `${prev}\n[${date}] ${parsed.coach_notes}` : `[${date}] ${parsed.coach_notes}`;
  }

  if (Object.keys(fields).length) {
    await updateAthlete(existing.row_number, fields);
    // Regenerate summary since notes changed
    const updated = { ...existing, ...fields };
    await generateAndCacheSummary(updated);
    console.log(`Updated athlete: ${parsed.athlete}`);
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// ROUTES
// ══════════════════════════════════════════════════════════════════════════════

// Slack events
app.post("/slack/events", async (req, res) => {
  if (!verifySlackSignature(req)) return res.status(403).json({ error: "Invalid signature" });
  const body = JSON.parse(req.body.toString());
  if (body.type === "url_verification") return res.json({ challenge: body.challenge });
  res.json({ ok: true });

  const event = body.event || {};
  if (event.type !== "message" || event.bot_id || !event.text) return;
  const channel = event.channel;
  const text = event.text.trim();

  try {
    if (channel === NEW_ATHLETES_CHANNEL && text.toLowerCase().includes("new athlete")) {
      await handleNewAthlete(text);
    } else if (channel === CURRENT_ATHLETES_CHANNEL) {
      await handleAthleteUpdate(text);
    }
  } catch (err) {
    console.error("Slack handler error:", err.message);
  }
});

// Athletes
app.get("/athletes", async (req, res) => {
  try {
    const athletes = await getAllAthletes();
    res.json({ athletes, count: athletes.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get("/athletes/search", async (req, res) => {
  try {
    const { name, wodify_id } = req.query;
    const athlete = await findAthlete(name, wodify_id);
    if (!athlete) return res.status(404).json({ error: "Athlete not found" });
    res.json(athlete);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.patch("/athletes/:rowNumber", async (req, res) => {
  try {
    const rowNumber = parseInt(req.params.rowNumber);
    if (isNaN(rowNumber) || rowNumber < 3) return res.status(400).json({ error: "Invalid row number" });

    // Get current athlete data to merge with update
    const athletes = await getAllAthletes();
    const current = athletes.find(a => a.row_number === rowNumber);

    await updateAthlete(rowNumber, req.body);

    // If notes-related fields changed, regenerate AI summary
    const notesFields = ["goals","rx","injuries","dos","donts","upcoming","notes","coach_notes"];
    const hasNotesChange = notesFields.some(f => req.body[f] !== undefined);
    if (hasNotesChange && current) {
      const updated = { ...current, ...req.body, row_number: rowNumber };
      generateAndCacheSummary(updated).catch(e => console.error("Summary regen failed:", e.message));
    }

    res.json({ ok: true, row: rowNumber });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post("/athletes", async (req, res) => {
  try {
    await addAthlete(req.body);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Manual trigger to regenerate all AI summaries (run once to populate column N)
app.get("/admin/regenerate-summaries", async (req, res) => {
  res.json({ ok: true, message: "Regenerating summaries in background..." });
  try {
    const athletes = await getAllAthletes();
    const needsSummary = athletes.filter(a => !a.ai_summary && (a.goals || a.injuries || a.dos || a.donts || a.coach_notes));
    console.log(`[Admin] Regenerating summaries for ${needsSummary.length} athletes`);
    for (const a of needsSummary) {
      await generateAndCacheSummary(a);
      await new Promise(r => setTimeout(r, 500)); // rate limit
    }
    console.log("[Admin] Summary regeneration complete");
  } catch (err) { console.error("[Admin] Summary regen error:", err.message); }
});

// Roster endpoints
app.get("/roster", (req, res) => {
  try {
    if (!fs.existsSync(ROSTER_CACHE)) return res.status(404).json({ error: "Roster not built yet" });
    const cache = JSON.parse(fs.readFileSync(ROSTER_CACHE, "utf8"));
    const summary = Object.entries(cache.classes || {}).map(([id, cls]) => ({
      class_id: id, class_name: cls.class_name,
      start_time: cls.start_time, athlete_count: cls.athletes?.length || 0,
    }));
    res.json({ date: cache.date, built_at: cache.built_at, classes: summary });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get("/roster/:classId", (req, res) => {
  try {
    if (!fs.existsSync(ROSTER_CACHE)) return res.status(404).json({ error: "Roster not built yet — check back 15 min before class" });
    const cache = JSON.parse(fs.readFileSync(ROSTER_CACHE, "utf8"));
    const cls = cache.classes?.[req.params.classId];
    if (!cls) return res.status(404).json({ error: "Class not found in cache", available: Object.keys(cache.classes || {}) });
    res.json({ ...cls, cache_built_at: cache.built_at, date: cache.date });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Manual roster build trigger (for testing)
app.get("/admin/build-roster", async (req, res) => {
  res.json({ ok: true, message: "Building roster cache in background..." });
  buildRosterCache();
});

// Today's classes
app.get("/today-classes", async (req, res) => {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
  try {
    const anchorId = await findAnchorId(today);
    const WINDOW = 50;
    const ids = Array.from({ length: WINDOW * 2 + 1 }, (_, i) => anchorId - WINDOW + i);
    const results = await Promise.all(
      ids.map(id =>
        wodifyGet(API_BASE, `/classes/${id}`)
          .then(data => {
            if (data.start_date === today && !data.is_cancelled && RECURRING_IDS.has(data.recurring_class_id)) return data;
            return null;
          }).catch(() => null)
      )
    );
    const found = results
      .filter(Boolean)
      .filter((c, i, arr) => arr.findIndex(x => x.recurring_class_id === c.recurring_class_id) === i)
      .sort((a, b) => a.start_time > b.start_time ? 1 : -1);
    res.json({ classes: found, date: today });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Generic Wodify proxy
app.get("/wodify/*", async (req, res) => {
  const wodifyPath = req.params[0];
  const params = new URLSearchParams(req.query);
  const suffix = `/${wodifyPath}${params.toString() ? "?" + params.toString() : ""}`;
  for (const base of [API_BASE, APP_BASE]) {
    try {
      const r = await fetch(`${base}${suffix}`, { headers: WODIFY_HEADERS });
      const text = await r.text();
      if (r.status !== 403 && !text.includes("Missing Authentication")) {
        try { res.status(r.status).json(JSON.parse(text)); }
        catch { res.status(r.status).send(text); }
        return;
      }
    } catch (e) { console.log(`Error: ${e.message}`); }
  }
  res.status(500).json({ error: "Both API endpoints failed" });
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  startRosterCron();
});

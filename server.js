const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const WODIFY_API_KEY = process.env.WODIFY_API_KEY;
const API_BASE = "https://api.wodify.com/v1";       // Classes, clients
const APP_BASE = "https://app-api.wodify.com/v1";   // Reservations, sub-paths

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => res.sendFile(path.join(__dirname, "index.html")));
app.get("/health", (req, res) => res.json({ status: "ok" }));

const HEADERS = { "x-api-key": WODIFY_API_KEY, "Accept": "application/json" };

async function get(base, path) {
  const r = await fetch(`${base}${path}`, { headers: HEADERS });
  return r.json();
}

const RECURRING_IDS = new Set([
  205659, 195631, 195633, 254489, 195634, 195635, 522818,
  293074, 429300, 342890, 358767, 407780, 272141, 559450, 561511
]);

const ANCHOR_RECURRING_ID = 205659; // CrossFit 5AM — our daily anchor

const KNOWN_ANCHORS = [
  { date: "2026-06-18", id: 174326847 },
  { date: "2026-06-19", id: 174420392 },
  { date: "2026-06-22", id: 174558953 },
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

  console.log(`Binary searching for ${today} between IDs ${lo}-${hi}`);

  for (let i = 0; i < 30; i++) {
    const mid = Math.floor((lo + hi) / 2);
    try {
      const data = await get(API_BASE, `/classes/${mid}`);
      if (!data.start_date) { lo = mid + 1; continue; }
      if (data.start_date === today && data.recurring_class_id === ANCHOR_RECURRING_ID) {
        console.log(`Found anchor: ${mid} for ${today}`);
        anchorCache[today] = mid;
        return mid;
      }
      if (data.start_date < today) lo = mid + 1;
      else hi = mid - 1;
    } catch (e) { lo = mid + 1; }
  }
  const mid = Math.floor((lo + hi) / 2);
  anchorCache[today] = mid;
  return mid;
}

// Get today's classes
app.get("/today-classes", async (req, res) => {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
  console.log("Finding classes for:", today);
  try {
    const anchorId = await findAnchorId(today);
    console.log(`Anchor: ${anchorId}`);

    const WINDOW = 50;
    const ids = Array.from({ length: WINDOW * 2 + 1 }, (_, i) => anchorId - WINDOW + i);

    const results = await Promise.all(
      ids.map(id =>
        get(API_BASE, `/classes/${id}`)
          .then(data => {
            if (data.start_date === today && !data.is_cancelled && RECURRING_IDS.has(data.recurring_class_id)) {
              console.log(`Found: ${data.name} id:${id}`);
              return data;
            }
            return null;
          })
          .catch(() => null)
      )
    );

    const found = results
      .filter(Boolean)
      .filter((c, i, arr) => arr.findIndex(x => x.recurring_class_id === c.recurring_class_id) === i)
      .sort((a, b) => a.start_time > b.start_time ? 1 : -1);

    console.log(`Found ${found.length} classes`);
    res.json({ classes: found, date: today });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Get all reservations for a specific date (uses the working client_class_reservations endpoint)
app.get("/daily-reservations", async (req, res) => {
  const today = req.query.date ||
    new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
  const locationId = req.query.location_id || "6982";
  const pageSize = req.query.page_size || 200;

  try {
    const data = await get(API_BASE,
      `/client_class_reservations?location_id=${locationId}&date_from=${today}&date_to=${today}&page_size=${pageSize}`
    );
    if (data.HTTPCode || data.message) {
      return res.status(500).json({ error: "Wodify error", detail: data });
    }
    console.log(`Daily reservations for ${today}: ${(data.client_class_reservations || []).length} records`);
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Get reservations for a specific class — first tries date-based lookup, then direct endpoints
app.get("/class-reservations/:classId", async (req, res) => {
  const { classId } = req.params;

  // Strategy 1: Use the working date-based endpoint and filter by class_id
  try {
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
    const data = await get(API_BASE,
      `/client_class_reservations?location_id=6982&date_from=${today}&date_to=${today}&page_size=500`
    );
    if (data.client_class_reservations) {
      const filtered = data.client_class_reservations.filter(
        r => String(r.class_id) === String(classId)
      );
      console.log(`Date-based lookup for class ${classId}: ${filtered.length} reservations`);
      res.json({ client_class_reservations: filtered, source: "date_filter" });
      return;
    }
  } catch (e) {
    console.log(`Date-based lookup failed: ${e.message}`);
  }

  // Strategy 2: Try direct endpoints as fallback
  const endpoints = [
    `/classes/${classId}/reservations`,
    `/classes/reservations?class_id=${classId}&page_size=100`,
    `/classes/reservations/clients/search?q=${classId}&page_size=100`,
    `/clients/class-reservations?class_id=${classId}&page_size=100`,
  ];

  for (const ep of endpoints) {
    for (const base of [API_BASE, APP_BASE]) {
      try {
        const data = await get(base, ep);
        if (!data.HTTPCode && !data.message) {
          console.log(`Reservations found at ${base}${ep}`);
          res.json(data);
          return;
        }
        console.log(`Failed ${base}${ep}: ${JSON.stringify(data).slice(0, 100)}`);
      } catch (e) {
        console.log(`Error ${base}${ep}: ${e.message}`);
      }
    }
  }
  res.status(404).json({ error: "No working reservations endpoint found", tried: endpoints });
});

// Generic proxy — tries api.wodify.com first, falls back to app-api.wodify.com
app.get("/wodify/*", async (req, res) => {
  const wodifyPath = req.params[0];
  const params = new URLSearchParams(req.query);
  const suffix = `/${wodifyPath}${params.toString() ? "?" + params.toString() : ""}`;

  for (const base of [API_BASE, APP_BASE]) {
    try {
      const r = await fetch(`${base}${suffix}`, { headers: HEADERS });
      const text = await r.text();
      console.log(`${base}${suffix} → ${r.status}`);
      if (r.status !== 403 && !text.includes("Missing Authentication")) {
        try { res.status(r.status).json(JSON.parse(text)); }
        catch { res.status(r.status).send(text); }
        return;
      }
    } catch (e) { console.log(`Error: ${e.message}`); }
  }
  res.status(500).json({ error: "Both API endpoints failed" });
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const WODIFY_API_KEY = process.env.WODIFY_API_KEY;
const WODIFY_BASE = "https://api.wodify.com/v1";

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

async function wGet(path) {
  const r = await fetch(`${WODIFY_BASE}${path}`, {
    headers: { "x-api-key": WODIFY_API_KEY, "Accept": "application/json" },
  });
  return r.json();
}

const RECURRING_IDS = new Set([
  205659, 195631, 195633, 254489, 195634, 195635, 522818,
  293074, 429300, 342890, 358767, 407780, 272141, 559450, 561511
]);

// CrossFit 5AM recurring class ID — used as our daily anchor
const ANCHOR_RECURRING_ID = 205659;

// Known anchor points to bootstrap binary search
// Format: { date: "YYYY-MM-DD", id: XXXXXX }
const KNOWN_ANCHORS = [
  { date: "2026-06-18", id: 174326847 },
  { date: "2026-06-19", id: 174420392 },
  { date: "2026-06-22", id: 174558953 },
];

// Cache: { date -> anchorId }
const anchorCache = {};
KNOWN_ANCHORS.forEach(a => { anchorCache[a.date] = a.id; });

// Binary search for today's 5AM anchor ID
async function findAnchorId(today) {
  if (anchorCache[today]) {
    console.log(`Using cached anchor for ${today}: ${anchorCache[today]}`);
    return anchorCache[today];
  }

  // Find the closest known anchor
  const sorted = KNOWN_ANCHORS.slice().sort((a, b) => a.date.localeCompare(b.date));
  let best = sorted[sorted.length - 1]; // default to most recent known
  for (const a of sorted) {
    if (a.date <= today) best = a;
  }

  // Estimate starting point
  const daysDiff = Math.round((new Date(today) - new Date(best.date)) / 86400000);
  let lo = best.id + daysDiff * 40000;
  let hi = best.id + daysDiff * 100000 + 200000;
  
  console.log(`Binary searching for ${today} anchor between IDs ${lo} and ${hi}`);

  // Binary search for the 5AM class on today's date
  for (let i = 0; i < 30; i++) {
    const mid = Math.floor((lo + hi) / 2);
    try {
      const data = await wGet(`/classes/${mid}`);
      if (!data.start_date) { lo = mid + 1; continue; }
      
      if (data.start_date === today && data.recurring_class_id === ANCHOR_RECURRING_ID) {
        console.log(`Found anchor at ID ${mid} for ${today}`);
        anchorCache[today] = mid;
        return mid;
      } else if (data.start_date < today) {
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    } catch (e) {
      lo = mid + 1;
    }
  }

  // If binary search didn't find exact match, return midpoint as best guess
  return Math.floor((lo + hi) / 2);
}

app.get("/today-classes", async (req, res) => {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
  console.log("Finding classes for:", today);

  try {
    // Step 1: Find today's anchor ID (5AM CrossFit)
    const anchorId = await findAnchorId(today);
    console.log(`Anchor ID for ${today}: ${anchorId}`);

    // Step 2: Fetch all IDs within ±50 of anchor in parallel
    const WINDOW = 50;
    const ids = Array.from({ length: WINDOW * 2 + 1 }, (_, i) => anchorId - WINDOW + i);

    const results = await Promise.all(
      ids.map(id =>
        wGet(`/classes/${id}`)
          .then(data => {
            if (data.start_date === today && !data.is_cancelled && RECURRING_IDS.has(data.recurring_class_id)) {
              console.log(`Found: ${data.name} (${data.start_time}) ID:${id}`);
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

    console.log(`Total found: ${found.length} classes for ${today}`);
    res.json({ classes: found, date: today });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Proxy all Wodify API requests
app.get("/wodify/*", async (req, res) => {
  const wodifyPath = req.params[0];
  const params = new URLSearchParams(req.query);
  const url = `${WODIFY_BASE}/${wodifyPath}${params.toString() ? "?" + params.toString() : ""}`;
  console.log("Proxying to:", url);
  try {
    const response = await fetch(url, {
      headers: { "x-api-key": WODIFY_API_KEY, "Accept": "application/json", "Content-Type": "application/json" },
    });
    const text = await response.text();
    console.log("Status:", response.status, "Body:", text.slice(0, 200));
    try { res.status(response.status).json(JSON.parse(text)); }
    catch { res.status(response.status).send(text); }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

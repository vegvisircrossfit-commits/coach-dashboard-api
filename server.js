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

// Known anchor: CrossFit 5AM on 2026-06-18 = class ID 174326847
// Known anchor: CrossFit 6PM on 2027-06-15 = class ID 190794719
// Delta: 16,467,872 IDs over 362 days = ~45,491 IDs/day
const ANCHOR_DATE = "2026-06-18";
const ANCHOR_ID = 174326847;
const IDS_PER_DAY = 45491;

// All recurring class IDs
const RECURRING_IDS = new Set([
  205659, 195631, 195633, 254489, 195634, 195635, 522818,
  293074, 429300, 342890, 358767, 407780, 272141, 559450, 561511
]);

// Binary search for a class near a target ID that matches today's date
async function findClassForDate(targetId, today, maxAttempts = 10) {
  let lo = targetId - IDS_PER_DAY * 2;
  let hi = targetId + IDS_PER_DAY * 2;
  let best = null;

  for (let i = 0; i < maxAttempts; i++) {
    const mid = Math.floor((lo + hi) / 2);
    try {
      const data = await wGet(`/classes/${mid}`);
      if (data.start_date === today && !data.is_cancelled && RECURRING_IDS.has(data.recurring_class_id)) {
        return data;
      }
      if (data.start_date && data.start_date < today) {
        lo = mid + 1;
      } else if (data.start_date && data.start_date > today) {
        hi = mid - 1;
      } else {
        // Not found, try nearby
        break;
      }
    } catch (e) {
      lo = mid + 1;
    }
  }
  return best;
}

app.get("/today-classes", async (req, res) => {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
  console.log("Finding classes for:", today);

  try {
    // Calculate approximate starting ID for today
    const anchorDate = new Date(ANCHOR_DATE);
    const todayDate = new Date(today);
    const daysDiff = Math.round((todayDate - anchorDate) / 86400000);
    const approxId = ANCHOR_ID + Math.round(daysDiff * IDS_PER_DAY);
    
    console.log(`Days from anchor: ${daysDiff}, approx ID: ${approxId}`);

    // Fetch a window of classes around the approximate ID
    // Try IDs in a range and collect all that match today
    const candidates = [];
    const windowSize = 500; // Search ±500 IDs
    const step = 1; // Classes clustered within a few IDs

    for (let offset = -windowSize; offset <= windowSize; offset += step) {
      const id = approxId + offset;
      try {
        const data = await wGet(`/classes/${id}`);
        if (data.start_date === today && !data.is_cancelled) {
          if (RECURRING_IDS.has(data.recurring_class_id)) {
            candidates.push(data);
            console.log(`Found: ${data.name} (${data.start_time})`);
          }
        }
        // If we've gone past today, stop going forward
        if (data.start_date && data.start_date > today && offset > 0) break;
        if (data.start_date && data.start_date < today && offset < 0) {
          offset = Math.max(offset, -step); // Don't go further back
        }
      } catch (e) {
        // ID doesn't exist, skip
      }
    }

    // Deduplicate by recurring_class_id, keep the one for today
    const seen = new Set();
    const found = candidates.filter(c => {
      if (seen.has(c.recurring_class_id)) return false;
      seen.add(c.recurring_class_id);
      return true;
    }).sort((a, b) => a.start_time > b.start_time ? 1 : -1);

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
    console.log("Status:", response.status, "Body:", text.slice(0, 300));
    try { res.status(response.status).json(JSON.parse(text)); }
    catch { res.status(response.status).send(text); }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

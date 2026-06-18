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

// Special route: get today's classes filtered by date
app.get("/today-classes", async (req, res) => {
  // Get today in Houston time (CT)
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" }); // YYYY-MM-DD
  console.log("Fetching classes for today:", today);
  try {
    // Fetch up to 1000 classes and filter by today's date client-side
    // since Wodify's date filter doesn't work reliably
    const response = await fetch(`${WODIFY_BASE}/classes?page_size=100`, {
      headers: { "x-api-key": WODIFY_API_KEY, "Accept": "application/json" },
    });
    const data = await response.json();
    const allClasses = data.classes || [];
    // Filter to today only, not cancelled
    const todayClasses = allClasses.filter(c => c.start_date === today && !c.is_cancelled);
    res.json({ classes: todayClasses, date: today });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Proxy all other Wodify API requests
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

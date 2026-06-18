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
  res.json({ status: "ok", key_set: !!WODIFY_API_KEY });
});

// Try every possible auth method simultaneously so we can see what works
app.get("/debug", async (req, res) => {
  const methods = [
    { label: "header_lowercase",  headers: { "x-api-key": WODIFY_API_KEY } },
    { label: "header_titlecase",  headers: { "X-Api-Key": WODIFY_API_KEY } },
    { label: "header_uppercase",  headers: { "X-API-KEY": WODIFY_API_KEY } },
    { label: "header_apikey",     headers: { "apikey": WODIFY_API_KEY } },
    { label: "header_auth_bearer",headers: { "Authorization": `Bearer ${WODIFY_API_KEY}` } },
    { label: "header_auth_apikey",headers: { "Authorization": `ApiKey ${WODIFY_API_KEY}` } },
    { label: "queryparam",        query: `?x-api-key=${WODIFY_API_KEY}` },
  ];

  const results = {};
  for (const m of methods) {
    const url = WODIFY_BASE + "/classes" + (m.query || "");
    try {
      const r = await fetch(url, {
        headers: { "Accept": "application/json", ...(m.headers || {}) },
      });
      const text = await r.text();
      results[m.label] = { status: r.status, body: text.slice(0, 120) };
    } catch (err) {
      results[m.label] = { error: err.message };
    }
  }
  res.json(results);
});

app.get("/wodify/*", async (req, res) => {
  const wodifyPath = req.params[0];
  const params = new URLSearchParams(req.query);
  const url = `${WODIFY_BASE}/${wodifyPath}${params.toString() ? "?" + params.toString() : ""}`;
  try {
    const response = await fetch(url, {
      headers: {
        "x-api-key": WODIFY_API_KEY,
        "Accept": "application/json",
      },
    });
    const text = await response.text();
    try { res.status(response.status).json(JSON.parse(text)); }
    catch { res.status(response.status).send(text); }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

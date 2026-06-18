const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const WODIFY_API_KEY = process.env.WODIFY_API_KEY;

// Try app-api.wodify.com since api.wodify.com strips our auth header
const WODIFY_BASE = "https://app-api.wodify.com/v1";

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.get("/health", (req, res) => {
  res.json({ status: "ok", key_set: !!WODIFY_API_KEY });
});

// Debug endpoint — tries multiple paths so we can see what works
app.get("/debug", async (req, res) => {
  const paths = [
    "/classes",
    "/customers/locations",
    "/clients",
    "/programs",
  ];
  const results = {};
  for (const p of paths) {
    const url = WODIFY_BASE + p;
    try {
      const r = await fetch(url, {
        headers: {
          "x-api-key": WODIFY_API_KEY,
          "X-Api-Key": WODIFY_API_KEY,
          "Accept": "application/json",
        },
      });
      const text = await r.text();
      results[p] = { status: r.status, body: text.slice(0, 150) };
    } catch (err) {
      results[p] = { error: err.message };
    }
  }
  res.json(results);
});

app.get("/wodify/*", async (req, res) => {
  const wodifyPath = req.params[0];
  const params = new URLSearchParams(req.query);
  const url = `${WODIFY_BASE}/${wodifyPath}${params.toString() ? "?" + params.toString() : ""}`;
  console.log("Proxying to:", url);
  try {
    const response = await fetch(url, {
      headers: {
        "x-api-key": WODIFY_API_KEY,
        "X-Api-Key": WODIFY_API_KEY,
        "Accept": "application/json",
        "Content-Type": "application/json",
      },
    });
    const text = await response.text();
    console.log("Status:", response.status, "Body:", text.slice(0, 300));
    try {
      res.status(response.status).json(JSON.parse(text));
    } catch {
      res.status(response.status).send(text);
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

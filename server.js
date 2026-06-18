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

app.get("/wodify/*", async (req, res) => {
  const wodifyPath = req.params[0];
  const params = new URLSearchParams(req.query);
  const url = `${WODIFY_BASE}/${wodifyPath}${params.toString() ? "?" + params.toString() : ""}`;
  console.log("Proxying to:", url);
  try {
    const response = await fetch(url, {
      headers: {
        "x-api-key": WODIFY_API_KEY,
        "Accept": "application/json",
        "Content-Type": "application/json",
      },
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

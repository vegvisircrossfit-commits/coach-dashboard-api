const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const WODIFY_API_KEY = process.env.WODIFY_API_KEY;
const WODIFY_BASE = "https://api.wodify.com/v1";

app.use(cors());
app.use(express.json());

// Serve the coach dashboard
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

// Proxy all Wodify API requests — uses x-api-key header (correct Wodify auth)
app.get("/wodify/*", async (req, res) => {
  const wodifyPath = req.params[0];
  const query = new URLSearchParams(req.query).toString();
  const url = `${WODIFY_BASE}/${wodifyPath}${query ? "?" + query : ""}`;
  console.log("Proxying to:", url);
  try {
    const response = await fetch(url, {
      headers: {
        "x-api-key": WODIFY_API_KEY,
        "Content-Type": "application/json",
      },
    });
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (err) {
    res.status(500).json({ error: "Failed to reach Wodify API", details: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

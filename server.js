const express = require("express");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 3000;
const WODIFY_API_KEY = process.env.WODIFY_API_KEY;
const WODIFY_BASE = "https://api.wodify.com/v1";

app.use(cors()); // Allow requests from your iPad app
app.use(express.json());

// Health check
app.get("/", (req, res) => {
  res.json({ status: "Coach Dashboard API is running" });
});

// Generic Wodify proxy — forwards any path to Wodify with your API key
app.get("/wodify/*", async (req, res) => {
  const path = req.params[0];
  const query = new URLSearchParams(req.query).toString();
  const url = `${WODIFY_BASE}/${path}${query ? "?" + query : ""}`;

  try {
    const response = await fetch(url, {
      headers: {
        "Authorization": `Bearer ${WODIFY_API_KEY}`,
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

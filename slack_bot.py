"""
slack_bot.py — Slack event listener for Vegvisir Staff Hub

Watches #new-athletes and #current-athletes.
Uses Claude to parse messages and writes structured data to Google Sheet.

Deploy on Render as a web service (it needs a public URL for Slack events).
Set these environment variables on Render:
  SLACK_BOT_TOKEN         — xoxb-... token from your Slack app
  SLACK_SIGNING_SECRET    — from your Slack app Basic Information page
  ANTHROPIC_API_KEY       — your Anthropic API key
  GOOGLE_SERVICE_ACCOUNT_JSON — the full JSON contents of your service account key file
  NEW_ATHLETES_CHANNEL    — Slack channel ID for #new-athletes
  CURRENT_ATHLETES_CHANNEL — Slack channel ID for #current-athletes
"""

import os
import json
import hmac
import hashlib
import time
import anthropic
from flask import Flask, request, jsonify
from sheet import find_athlete, update_athlete, add_athlete

app = Flask(__name__)

ANTHROPIC_CLIENT = anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY"))

NEW_ATHLETES_CHANNEL     = os.environ.get("NEW_ATHLETES_CHANNEL", "")
CURRENT_ATHLETES_CHANNEL = os.environ.get("CURRENT_ATHLETES_CHANNEL", "")
SLACK_SIGNING_SECRET     = os.environ.get("SLACK_SIGNING_SECRET", "")


# ── Slack signature verification ─────────────────────────────────────────────

def verify_slack_signature(request):
    timestamp = request.headers.get("X-Slack-Request-Timestamp", "")
    if abs(time.time() - float(timestamp)) > 300:
        return False  # replay attack
    sig_basestring = f"v0:{timestamp}:{request.get_data(as_text=True)}"
    my_sig = "v0=" + hmac.new(
        SLACK_SIGNING_SECRET.encode(),
        sig_basestring.encode(),
        hashlib.sha256,
    ).hexdigest()
    slack_sig = request.headers.get("X-Slack-Signature", "")
    return hmac.compare_digest(my_sig, slack_sig)


# ── Claude message parsers ────────────────────────────────────────────────────

def parse_new_athlete_message(text: str) -> dict:
    """
    Parse a #new-athletes message into structured athlete fields.
    Expected format: "New Athlete Alert" followed by consultation notes.
    Returns dict of sheet fields.
    """
    response = ANTHROPIC_CLIENT.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=1000,
        system="""You extract structured athlete data from CrossFit gym consultation notes.
Return ONLY valid JSON, no markdown, no explanation.

Format:
{
  "athlete": "Full Name",
  "goals": "What they want to achieve",
  "injuries": "Any injuries or physical limitations mentioned",
  "dos": "Things coaches should emphasize or do with this athlete",
  "donts": "Things to avoid with this athlete",
  "upcoming": "Any trips, events, or time away mentioned",
  "notes": "Any other relevant info",
  "coach_notes": "Summary for coaches"
}

If a field isn't mentioned, use empty string. Never invent information.""",
        messages=[{"role": "user", "content": f"Parse this new athlete consultation note:\n\n{text}"}]
    )
    raw = response.content[0].text.strip()
    try:
        return json.loads(raw.replace("```json", "").replace("```", "").strip())
    except Exception:
        return {"notes": text, "coach_notes": "Could not auto-parse — review manually"}


def parse_current_athlete_update(text: str) -> dict:
    """
    Parse a #current-athletes update message.
    Expected format: Athlete name first, then update info.
    Returns dict with athlete name and fields to update.
    """
    response = ANTHROPIC_CLIENT.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=800,
        system="""You extract athlete update information from CrossFit coach notes.
The message will have an athlete's name first, followed by updates.
Return ONLY valid JSON, no markdown.

Format:
{
  "athlete": "Full Name (exactly as it appears at start of message)",
  "injuries": "Updated injury info if mentioned, else null",
  "upcoming": "Trips or events if mentioned, else null",
  "dos": "Updated coaching cues if mentioned, else null",
  "donts": "Things to avoid if mentioned, else null",
  "coach_notes": "Full summary of this update"
}

Use null for fields not mentioned — don't overwrite with empty string.""",
        messages=[{"role": "user", "content": f"Parse this athlete update:\n\n{text}"}]
    )
    raw = response.content[0].text.strip()
    try:
        return json.loads(raw.replace("```json", "").replace("```", "").strip())
    except Exception:
        return {"athlete": text.split("\n")[0][:50], "coach_notes": text}


# ── Message handlers ──────────────────────────────────────────────────────────

def handle_new_athlete(text: str):
    """Parse and add/update athlete from #new-athletes message."""
    parsed = parse_new_athlete_message(text)
    name = parsed.get("athlete", "").strip()
    if not name:
        print("Could not extract athlete name from new athlete message")
        return

    existing = find_athlete(name=name)
    if existing:
        # Athlete already exists — update their record
        update_fields = {k: v for k, v in parsed.items() if v and k != "athlete"}
        update_athlete(existing["row_number"], update_fields)
        print(f"Updated existing athlete: {name}")
    else:
        # New athlete — add a row
        add_athlete(parsed)
        print(f"Added new athlete: {name}")


def handle_current_athlete_update(text: str):
    """Parse and update athlete from #current-athletes message."""
    parsed = parse_current_athlete_update(text)
    name = parsed.get("athlete", "").strip()
    if not name:
        print("Could not extract athlete name from update message")
        return

    existing = find_athlete(name=name)
    if not existing:
        print(f"Athlete not found in sheet: {name} — adding as new")
        add_athlete({"athlete": name, "coach_notes": parsed.get("coach_notes", text)})
        return

    # Only update fields that were explicitly mentioned (not null)
    update_fields = {}
    for key in ["injuries", "upcoming", "dos", "donts"]:
        val = parsed.get(key)
        if val:
            update_fields[key] = val

    # Always append to coach_notes rather than overwrite
    if parsed.get("coach_notes"):
        existing_notes = existing.get("coach_notes", "")
        timestamp = time.strftime("%Y-%m-%d")
        new_note = f"[{timestamp}] {parsed['coach_notes']}"
        update_fields["coach_notes"] = f"{existing_notes}\n{new_note}".strip() if existing_notes else new_note

    if update_fields:
        update_athlete(existing["row_number"], update_fields)
        print(f"Updated athlete: {name} — fields: {list(update_fields.keys())}")


# ── Slack event endpoint ──────────────────────────────────────────────────────

@app.route("/slack/events", methods=["POST"])
def slack_events():
    # URL verification challenge (one-time during Slack app setup)
    body = request.get_json(force=True)
    if body.get("type") == "url_verification":
        return jsonify({"challenge": body["challenge"]})

    # Verify signature
    if not verify_slack_signature(request):
        return jsonify({"error": "Invalid signature"}), 403

    event = body.get("event", {})
    event_type = event.get("type")
    channel = event.get("channel", "")
    text = event.get("text", "").strip()
    bot_id = event.get("bot_id")

    # Ignore bot messages and non-message events
    if event_type != "message" or bot_id or not text:
        return jsonify({"ok": True})

    # Route by channel
    if channel == NEW_ATHLETES_CHANNEL and "new athlete" in text.lower():
        handle_new_athlete(text)
    elif channel == CURRENT_ATHLETES_CHANNEL:
        handle_current_athlete_update(text)

    return jsonify({"ok": True})


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "service": "vegvisir-slack-bot"})


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 3001))
    app.run(host="0.0.0.0", port=port)

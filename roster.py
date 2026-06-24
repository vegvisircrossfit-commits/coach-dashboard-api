"""
roster.py — Class roster builder for Vegvisir Staff Hub

Runs 15 minutes before each class hour via cron.
Paginates through Wodify client_class_reservations for today,
matches athletes to Google Sheet, enriches with notes,
and caches the result so the dashboard can serve it instantly.

Schedule (Houston time, CST = UTC-6):
  44 4  * * 1-6   # 4:44 AM  → 5AM class
  44 5  * * 1-6   # 5:44 AM  → 6AM class
  14 7  * * 1-6   # 7:14 AM  → 7:30AM class
  44 8  * * 1-6   # 8:44 AM  → 9AM class
  44 14 * * 1-6   # 2:44 PM  → 3PM class
  44 15 * * 1-6   # 3:44 PM  → 4PM class
  44 16 * * 1-6   # 4:44 PM  → 5PM class
  44 17 * * 1-6   # 5:44 PM  → 6PM class

Environment variables (set on Render):
  WODIFY_API_KEY              — your Wodify API key
  GOOGLE_SERVICE_ACCOUNT_JSON — service account JSON contents
  ANTHROPIC_API_KEY           — for AI note summarization
  ROSTER_CACHE_FILE           — path to cache file (default: /tmp/roster_cache.json)
"""

import os
import json
import datetime
import requests
import anthropic
from sheet import get_all_athletes

WODIFY_KEY   = os.environ.get("WODIFY_API_KEY", "")
WODIFY_BASE  = "https://api.wodify.com/v1"
LOCATION_ID  = 6982
CACHE_FILE   = os.environ.get("ROSTER_CACHE_FILE", "/tmp/roster_cache.json")
ANTHROPIC_CLIENT = anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY"))

HEADERS = {"x-api-key": WODIFY_KEY, "Accept": "application/json"}


# ── Wodify helpers ────────────────────────────────────────────────────────────

def get_today_str():
    return datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=-5))).strftime("%Y-%m-%d")


def fetch_all_reservations_today(date_str: str) -> list:
    """
    Paginate through ALL client_class_reservations and filter to today.
    Since Wodify ignores date params, we page until we pass today's date.
    """
    reservations = []
    page = 1
    page_size = 200

    print(f"Fetching reservations for {date_str}...")
    while True:
        url = f"{WODIFY_BASE}/client_class_reservations?page={page}&page_size={page_size}"
        resp = requests.get(url, headers=HEADERS, timeout=30)
        if not resp.ok:
            print(f"Error fetching page {page}: {resp.status_code}")
            break

        data = resp.json()
        rows = data.get("client_class_reservations", [])
        if not rows:
            break

        # Filter to today only
        today_rows = [r for r in rows if r.get("local_class_start_datetime", "").startswith(date_str)]
        reservations.extend(today_rows)

        # If the last row's date is past today, we can stop paginating
        last_date = rows[-1].get("local_class_start_datetime", "")[:10]
        if last_date > date_str:
            print(f"Reached dates past today on page {page}, stopping.")
            break

        pagination = data.get("pagination", {})
        if not pagination.get("has_more"):
            break

        page += 1
        print(f"  Page {page-1}: {len(today_rows)} today's reservations found so far...")

    print(f"Total reservations for {date_str}: {len(reservations)}")
    return reservations


def group_by_class(reservations: list) -> dict:
    """Group reservations by class_id."""
    classes = {}
    for r in reservations:
        cid = str(r.get("class_id", ""))
        if cid not in classes:
            classes[cid] = {
                "class_id": cid,
                "class_name": r.get("class", ""),
                "start_time": r.get("local_class_start_datetime", ""),
                "coaches": r.get("coaches", []),
                "athletes": [],
            }
        # Only include non-cancelled reservations
        if r.get("reservation_status_id") not in [1]:  # 1 = Cancelled
            classes[cid]["athletes"].append({
                "client_id": str(r.get("client_id", "")),
                "name": r.get("client", ""),
                "reservation_status": r.get("reservation_status", ""),
                "is_signed_in": r.get("reservation_status_id") == 3,
            })
    return classes


# ── AI note summarizer ────────────────────────────────────────────────────────

def summarize_athlete_notes(athlete: dict) -> dict:
    """
    Use Claude to extract a clean coach brief from the athlete's sheet data.
    Returns enhanced athlete dict with structured coaching_brief.
    """
    # Build context from all available fields
    context_parts = []
    if athlete.get("goals"):        context_parts.append(f"Goals: {athlete['goals']}")
    if athlete.get("rx"):           context_parts.append(f"RX/Prescription: {athlete['rx']}")
    if athlete.get("injuries"):     context_parts.append(f"Injuries: {athlete['injuries']}")
    if athlete.get("dos"):          context_parts.append(f"Do's: {athlete['dos']}")
    if athlete.get("donts"):        context_parts.append(f"Don'ts: {athlete['donts']}")
    if athlete.get("upcoming"):     context_parts.append(f"Upcoming: {athlete['upcoming']}")
    if athlete.get("notes"):        context_parts.append(f"Notes: {athlete['notes']}")
    if athlete.get("coach_notes"):  context_parts.append(f"Coach Notes: {athlete['coach_notes']}")

    if not context_parts:
        return {"dos": [], "donts": [], "injuries": "", "upcoming": "", "summary": "No notes on file"}

    # Check 90-day check-in status
    checkin_overdue = False
    next_checkin = athlete.get("next_checkin", "")
    if next_checkin:
        try:
            due = datetime.datetime.strptime(str(next_checkin)[:10], "%Y-%m-%d")
            checkin_overdue = due < datetime.datetime.now()
        except Exception:
            pass

    context = "\n".join(context_parts)

    response = ANTHROPIC_CLIENT.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=500,
        system="""You create concise coach briefs for CrossFit athletes. 
Return ONLY valid JSON, no markdown.

Format:
{
  "dos": ["bullet 1", "bullet 2"],
  "donts": ["bullet 1", "bullet 2"],
  "injuries": "brief injury summary or empty string",
  "upcoming": "upcoming trips/events or empty string",
  "summary": "one sentence coach brief"
}

Keep each bullet under 8 words. Be specific and actionable.""",
        messages=[{"role": "user", "content": f"Create a coach brief for {athlete['athlete']}:\n\n{context}"}]
    )

    raw = response.content[0].text.strip()
    try:
        brief = json.loads(raw.replace("```json", "").replace("```", "").strip())
    except Exception:
        brief = {"dos": [], "donts": [], "injuries": "", "upcoming": "", "summary": context[:100]}

    brief["checkin_overdue"] = checkin_overdue
    return brief


# ── Main roster builder ───────────────────────────────────────────────────────

def build_roster_cache():
    today = get_today_str()
    print(f"\n=== Building roster cache for {today} ===")

    # 1. Fetch all today's reservations from Wodify
    reservations = fetch_all_reservations_today(today)
    if not reservations:
        print("No reservations found for today")
        return

    # 2. Group by class
    classes = group_by_class(reservations)
    print(f"Found {len(classes)} classes with reservations")

    # 3. Load all athletes from Google Sheet
    print("Loading athlete data from Google Sheet...")
    sheet_athletes = get_all_athletes()
    # Build lookup by name (lowercase) and by wodify_id
    by_name = {a["athlete"].lower(): a for a in sheet_athletes}
    by_wodify_id = {a["wodify_id"]: a for a in sheet_athletes if a["wodify_id"]}

    # 4. Enrich each class roster with sheet data + AI brief
    enriched_classes = {}
    for class_id, cls in classes.items():
        enriched_athletes = []
        for athlete_basic in cls["athletes"]:
            # Match to sheet
            sheet_data = (
                by_wodify_id.get(athlete_basic["client_id"]) or
                by_name.get(athlete_basic["name"].lower())
            )

            if sheet_data:
                brief = summarize_athlete_notes(sheet_data)
                enriched_athletes.append({
                    **athlete_basic,
                    "goals": sheet_data.get("goals", ""),
                    "rx": sheet_data.get("rx", ""),
                    "coaching_brief": brief,
                    "has_notes": True,
                })
            else:
                enriched_athletes.append({
                    **athlete_basic,
                    "coaching_brief": {"dos": [], "donts": [], "injuries": "", "upcoming": "", "summary": "No notes on file", "checkin_overdue": False},
                    "has_notes": False,
                })

        enriched_classes[class_id] = {
            **cls,
            "athletes": enriched_athletes,
        }
        print(f"  {cls['class_name']}: {len(enriched_athletes)} athletes enriched")

    # 5. Write cache
    cache = {"date": today, "built_at": datetime.datetime.now().isoformat(), "classes": enriched_classes}
    with open(CACHE_FILE, "w") as f:
        json.dump(cache, f, indent=2)
    print(f"\nRoster cache written to {CACHE_FILE}")
    return cache


if __name__ == "__main__":
    build_roster_cache()

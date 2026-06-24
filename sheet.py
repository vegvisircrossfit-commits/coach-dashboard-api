"""
sheet.py — Google Sheets helper for Vegvisir Staff Hub
Provides read/write access to the athlete tracking sheet.

Sheet columns (row 2 = headers, data starts row 3):
A: Athlete
B: Last check-in
C: 90 days later
D: Notes
E: Goals
F: RX
G: Injuries
H: Dos
I: Donts
J: Upcoming
K: Coach Notes
L: Wodify ID
M: Last Updated
"""

import os
import json
import datetime
from google.oauth2 import service_account
from googleapiclient.discovery import build

SHEET_ID = "1wC31nqMDhhNsXnkCxqihPVWFvRhqioDezFC9ifhXYf0"
SHEET_TAB = "Sheet1"  # update if your tab has a different name
HEADER_ROW = 2        # your headers are on row 2
DATA_START  = 3       # athlete data starts on row 3

SCOPES = ["https://www.googleapis.com/auth/spreadsheets"]

COL = {
    "athlete":      "A",
    "last_checkin": "B",
    "next_checkin": "C",
    "notes":        "D",
    "goals":        "E",
    "rx":           "F",
    "injuries":     "G",
    "dos":          "H",
    "donts":        "I",
    "upcoming":     "J",
    "coach_notes":  "K",
    "wodify_id":    "L",
    "last_updated": "M",
}

# Column letter → zero-based index
COL_IDX = {v: ord(v) - ord("A") for v in COL.values()}
NUM_COLS = len(COL)  # 13 columns (A–M)


def _get_service():
    """Build the Sheets API client from environment variable."""
    key_json = os.environ.get("GOOGLE_SERVICE_ACCOUNT_JSON")
    if not key_json:
        raise EnvironmentError("GOOGLE_SERVICE_ACCOUNT_JSON env var not set")
    info = json.loads(key_json)
    creds = service_account.Credentials.from_service_account_info(info, scopes=SCOPES)
    return build("sheets", "v4", credentials=creds, cache_discovery=False)


def _range(start_row, end_row=None):
    end = str(end_row) if end_row else ""
    return f"{SHEET_TAB}!A{start_row}:M{end or ''}"


def get_all_athletes():
    """
    Returns a list of dicts, one per athlete row.
    Empty rows are skipped.
    """
    svc = _get_service()
    result = svc.spreadsheets().values().get(
        spreadsheetId=SHEET_ID,
        range=_range(DATA_START),
        valueRenderOption="UNFORMATTED_VALUE",
    ).execute()

    rows = result.get("values", [])
    athletes = []
    for i, row in enumerate(rows):
        # pad row to full width so every column is accessible
        row = row + [""] * (NUM_COLS - len(row))
        name = row[COL_IDX["A"]].strip() if row[COL_IDX["A"]] else ""
        if not name:
            continue
        athletes.append({
            "row_number": DATA_START + i,
            "athlete":      name,
            "last_checkin": row[COL_IDX["B"]],
            "next_checkin": row[COL_IDX["C"]],
            "notes":        row[COL_IDX["D"]],
            "goals":        row[COL_IDX["E"]],
            "rx":           row[COL_IDX["F"]],
            "injuries":     row[COL_IDX["G"]],
            "dos":          row[COL_IDX["H"]],
            "donts":        row[COL_IDX["I"]],
            "upcoming":     row[COL_IDX["J"]],
            "coach_notes":  row[COL_IDX["K"]],
            "wodify_id":    str(row[COL_IDX["L"]]).strip(),
            "last_updated": row[COL_IDX["M"]],
        })
    return athletes


def find_athlete(name=None, wodify_id=None):
    """
    Find a single athlete by name (case-insensitive) or Wodify ID.
    Returns the athlete dict or None.
    """
    athletes = get_all_athletes()
    for a in athletes:
        if wodify_id and str(a["wodify_id"]) == str(wodify_id):
            return a
        if name and a["athlete"].lower() == name.lower():
            return a
    return None


def update_athlete(row_number, fields: dict):
    """
    Update specific columns for an athlete by their sheet row number.
    fields: dict of column_key → new_value  e.g. {"injuries": "Left knee", "dos": "Low impact"}
    """
    svc = _get_service()
    fields["last_updated"] = datetime.datetime.now().strftime("%Y-%m-%d %H:%M")

    # Build individual cell updates
    data = []
    for key, value in fields.items():
        col_letter = COL.get(key)
        if not col_letter:
            continue
        data.append({
            "range": f"{SHEET_TAB}!{col_letter}{row_number}",
            "values": [[value]],
        })

    if not data:
        return

    svc.spreadsheets().values().batchUpdate(
        spreadsheetId=SHEET_ID,
        body={"valueInputOption": "USER_ENTERED", "data": data},
    ).execute()
    print(f"Updated row {row_number}: {list(fields.keys())}")


def add_athlete(fields: dict):
    """
    Append a new athlete row to the sheet.
    fields: dict with at least {"athlete": "Name", ...}
    """
    svc = _get_service()
    fields["last_updated"] = datetime.datetime.now().strftime("%Y-%m-%d %H:%M")

    row = [""] * NUM_COLS
    for key, value in fields.items():
        col_letter = COL.get(key)
        if col_letter:
            row[COL_IDX[col_letter]] = value

    svc.spreadsheets().values().append(
        spreadsheetId=SHEET_ID,
        range=f"{SHEET_TAB}!A{DATA_START}",
        valueInputOption="USER_ENTERED",
        insertDataOption="INSERT_ROWS",
        body={"values": [row]},
    ).execute()
    print(f"Added new athlete: {fields.get('athlete')}")


def get_athletes_by_wodify_ids(wodify_ids: list):
    """
    Given a list of Wodify client IDs, return matching athlete dicts.
    Used by roster.py to enrich class rosters.
    """
    id_set = set(str(i) for i in wodify_ids)
    athletes = get_all_athletes()
    return [a for a in athletes if a["wodify_id"] in id_set]


if __name__ == "__main__":
    # Quick test
    athletes = get_all_athletes()
    print(f"Found {len(athletes)} athletes in sheet")
    for a in athletes[:3]:
        print(f"  {a['athlete']} (Wodify ID: {a['wodify_id']})")

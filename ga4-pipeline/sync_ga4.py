#!/usr/bin/env python3
"""GA4 → private Google Sheets for Caviar. No analytics data is stored in GitHub."""
import json
import os
import sys
import time
from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo
from google.oauth2 import service_account
from google.auth.transport.requests import AuthorizedSession

PROPERTIES = {"ru": "368821033", "global": "474782469"}
# Days are defined by the timezone configured for each GA4 property, not UTC.
SITE_TIMEZONES = {"ru": "Europe/Moscow", "global": "America/Los_Angeles"}
SPREADSHEET_ID = os.environ["GA4_SHEET_ID"]
SCOPES = [
    "https://www.googleapis.com/auth/analytics.readonly",
    "https://www.googleapis.com/auth/spreadsheets",
]
TABS = {
    "Daily": ["date", "site", "users", "sessions", "engagedSessions", "engagementRate", "keyEvents", "eventCount", "status"],
    "Sources": ["date", "site", "sourceMedium", "channel", "sessions", "users", "engagedSessions", "keyEvents"],
    "Countries": ["date", "site", "country", "sessions", "engagedSessions", "users", "keyEvents"],
    "LandingPages": ["date", "site", "landingPage", "sessions", "engagedSessions", "keyEvents"],
    "Events": ["date", "site", "eventName", "eventCount", "keyEvents"],
    "Checks": ["date", "site", "fetchedAtUTC", "status", "notes"],
}
REPORTS = {
    "Daily": (["date"], ["activeUsers", "sessions", "engagedSessions", "engagementRate", "keyEvents", "eventCount"]),
    "Sources": (["date", "sessionSourceMedium", "sessionDefaultChannelGroup"], ["sessions", "activeUsers", "engagedSessions", "keyEvents"]),
    "Countries": (["date", "country"], ["sessions", "engagedSessions", "activeUsers", "keyEvents"]),
    "LandingPages": (["date", "landingPage"], ["sessions", "engagedSessions", "keyEvents"]),
    "Events": (["date", "eventName"], ["eventCount", "keyEvents"]),
}
API = "https://analyticsdata.googleapis.com/v1beta"

def spreadsheet_range(tab):
    return "'" + tab.replace("'", "''") + "'!A:Z"

def iso_date(s):
    return f"{s[:4]}-{s[4:6]}-{s[6:8]}"

def api_json(session, method, url, **kwargs):
    for attempt in range(6):
        response = session.request(method, url, timeout=100, **kwargs)
        if response.ok:
            return response.json() if response.content else {}
        if response.status_code in (429, 500, 502, 503, 504) and attempt < 5:
            time.sleep(min(2 ** (attempt + 1), 32))
            continue
        raise RuntimeError(f"{method} {url}: HTTP {response.status_code}: {response.text[:700]}")

def run_report(session, property_id, dims, metrics, start, end):
    rows = []
    offset = 0
    page_size = 10000
    while True:
        body = {
            "dateRanges": [{"startDate": start, "endDate": end}],
            "dimensions": [{"name": x} for x in dims],
            "metrics": [{"name": x} for x in metrics],
            "limit": str(page_size),
            "offset": str(offset),
            "keepEmptyRows": False,
        }
        data = api_json(session, "POST", f"{API}/properties/{property_id}:runReport", json=body)
        chunk = data.get("rows", [])
        for item in chunk:
            d = [v.get("value", "") for v in item.get("dimensionValues", [])]
            m = [v.get("value", "") for v in item.get("metricValues", [])]
            rows.append((d, m))
        offset += len(chunk)
        if not chunk or offset >= int(data.get("rowCount", offset)):
            break
        if len(rows) > 200000:
            raise RuntimeError("Too many GA4 rows: refusing truncated export")
    return rows

def metric(x):
    try:
        return float(x) if "." in str(x) else int(x)
    except (ValueError, TypeError):
        return x

def to_sheet_row(tab, site, dim_values, metric_values, status="PRELIMINARY"):
    day = iso_date(dim_values[0])
    if tab == "Daily":
        return [day, site] + [metric(x) for x in metric_values] + [status]
    if tab == "Sources":
        return [day, site, dim_values[1], dim_values[2]] + [metric(x) for x in metric_values]
    if tab == "Countries":
        return [day, site, dim_values[1]] + [metric(x) for x in metric_values]
    if tab == "LandingPages":
        return [day, site, dim_values[1]] + [metric(x) for x in metric_values]
    return [day, site, dim_values[1]] + [metric(x) for x in metric_values]

def sheets_url(path):
    return f"https://sheets.googleapis.com/v4/spreadsheets/{SPREADSHEET_ID}/{path}"

def read_existing(session, tab):
    value = api_json(session, "GET", sheets_url("values/" + __import__("urllib.parse", fromlist=["quote"]).quote(spreadsheet_range(tab), safe="")),
                     params={"valueRenderOption": "UNFORMATTED_VALUE"})
    rows = value.get("values", [])
    if rows and rows[0][:len(TABS[tab])] != TABS[tab]:
        raise RuntimeError(f"Unexpected header in tab {tab}. Refusing to overwrite.")
    return rows[1:] if rows else []

def collection_window(site, collected_at_utc, bootstrap, refresh_days, full_backfill=False):
    """Use the property-local date; the current day is always incomplete.

    The most recent *completed* local calendar day remains PRELIMINARY.
    GA4 may revise even older data, so the last refresh_days days are refetched.
    """
    local_today = collected_at_utc.astimezone(ZoneInfo(SITE_TIMEZONES[site])).date()
    end = local_today - timedelta(days=1)
    start = bootstrap if full_backfill else max(bootstrap, end - timedelta(days=refresh_days - 1))
    settled_through = local_today - timedelta(days=2)
    return start, end, settled_through


def day_status(day, settled_through):
    return "OK" if date.fromisoformat(day) <= settled_through else "PRELIMINARY"


def main():
    raw = os.environ["GOOGLE_SERVICE_ACCOUNT_JSON"]
    credentials = service_account.Credentials.from_service_account_info(json.loads(raw), scopes=SCOPES)
    session = AuthorizedSession(credentials)
    now_utc = datetime.now(timezone.utc)
    bootstrap = date.fromisoformat(os.getenv("GA4_BOOTSTRAP_START", "2026-06-24"))
    refresh_days = int(os.getenv("GA4_REFRESH_DAYS", "35"))
    if refresh_days < 3:
        raise ValueError("GA4_REFRESH_DAYS must be >= 3")
    existing = {tab: read_existing(session, tab) for tab in TABS}

    # Only initial missing historical coverage forces backfill; a property-local
    # date not yet available must NEVER trigger a complete historical refetch.
    needs_bootstrap = any(not existing[t] for t in TABS)
    for site in PROPERTIES:
        daily_dates = [date.fromisoformat(str(r[0])) for r in existing["Daily"] if len(r) >= 2 and str(r[1]) == site]
        if not daily_dates or min(daily_dates) > bootstrap:
            needs_bootstrap = True

    full_backfill = os.getenv("GA4_FULL_BACKFILL", "") == "1" or needs_bootstrap
    windows = {
        site: collection_window(site, now_utc, bootstrap, refresh_days, full_backfill)
        for site in PROPERTIES
    }
    fetched = {tab: [] for tab in TABS}
    stamp = now_utc.isoformat(timespec="seconds")
    for site, property_id in PROPERTIES.items():
        start, end, settled_through = windows[site]
        if end < start:
            print(f"{site}: no completed dates to sync")
            continue
        print(f"{site}: {start}..{end} (property timezone {SITE_TIMEZONES[site]}); settled through {settled_through}")
        site_rows = {}
        for tab, (dims, metrics) in REPORTS.items():
            report = run_report(session, property_id, dims, metrics, start.isoformat(), end.isoformat())
            site_rows[tab] = [
                to_sheet_row(tab, site, d, m, day_status(iso_date(d[0]), settled_through))
                for d, m in report
            ]
            print(f"{site} {tab}: {len(report)} rows")
        for tab, rows in site_rows.items():
            fetched[tab].extend(rows)
        daily_dates = {row[0] for row in site_rows["Daily"]}
        for day_index in range((end - start).days + 1):
            day = (start + timedelta(days=day_index)).isoformat()
            observed = day in daily_dates
            status = day_status(day, settled_through) if observed else "NO_DATA"
            note = (
                "Last completed local day; GA4 can still revise it"
                if status == "PRELIMINARY"
                else "GA4 daily report present" if observed
                else "No GA4 daily row; investigate tracking, access or processing delay"
            )
            fetched["Checks"].append([day, site, stamp, status, note])
            if not observed:
                print(f"WARNING: {site} {day}: NO_DATA")

    payload = []
    for tab, header in TABS.items():
        old = [r for r in existing[tab] if len(r) >= 2 and str(r[0]) < windows.get(str(r[1]), (bootstrap,))[0].isoformat()]
        all_rows = old + fetched[tab]
        all_rows.sort(key=lambda x: (str(x[0]), str(x[1]), str(x[2]) if len(x) > 2 else ""))
        payload.append({"range": f"'{tab}'!A1", "values": [header] + all_rows})
    # Expand tab grids to fit backfill before changing any data.
    meta = api_json(session, "GET", f"https://sheets.googleapis.com/v4/spreadsheets/{SPREADSHEET_ID}",
                    params={"fields": "sheets(properties(sheetId,title,gridProperties(rowCount,columnCount)))"})
    layouts = {s["properties"]["title"]: s["properties"] for s in meta.get("sheets", [])}
    grid_updates = []
    for item in payload:
        tab = item["range"].split("'")[1]
        prop = layouts[tab]
        required = len(item["values"])
        current = int(prop["gridProperties"]["rowCount"])
        if required > current:
            grid_updates.append({"updateSheetProperties": {
                "properties": {"sheetId": prop["sheetId"], "gridProperties": {"rowCount": required + 200}},
                "fields": "gridProperties.rowCount"
            }})
    if grid_updates:
        api_json(session, "POST", f"https://sheets.googleapis.com/v4/spreadsheets/{SPREADSHEET_ID}:batchUpdate",
                 json={"requests": grid_updates})
    # Write before clearing tails so a failed run does not first erase the whole workbook.
    # All CRM_* tabs are left untouched.
    for item in payload:
        tab = item["range"].split("'")[1]
        rows = item["values"]
        for offset in range(0, len(rows), 1500):
            block = rows[offset:offset + 1500]
            api_json(session, "POST", sheets_url("values:batchUpdate"),
                     json={"valueInputOption": "RAW",
                           "data": [{"range": f"'{tab}'!A{offset + 1}", "values": block}]})
        previous_size = len(existing[tab]) + 1
        if previous_size > len(rows):
            api_json(session, "POST", sheets_url("values:batchClear"),
                     json={"ranges": [f"'{tab}'!A{len(rows) + 1}:Z{previous_size}"]})
        print(f"Sheet {tab}: {len(rows) - 1} data rows stored")
    print("Synced per-property local completed dates into private Google Sheet")

if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"GA4 sync failed: {exc}", file=sys.stderr)
        sys.exit(1)

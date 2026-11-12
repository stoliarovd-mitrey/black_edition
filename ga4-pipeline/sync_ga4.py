#!/usr/bin/env python3
"""GA4 → private Google Sheets for Caviar. No analytics data is stored in GitHub."""
import json
import os
import sys
import time
from datetime import date, datetime, timedelta, timezone
from google.oauth2 import service_account
from google.auth.transport.requests import AuthorizedSession

PROPERTIES = {"ru": "368821033", "global": "474782469"}
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

def to_sheet_row(tab, site, dim_values, metric_values):
    day = iso_date(dim_values[0])
    if tab == "Daily":
        return [day, site] + [metric(x) for x in metric_values] + ["OK"]
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

def main():
    raw = os.environ["GOOGLE_SERVICE_ACCOUNT_JSON"]
    credentials = service_account.Credentials.from_service_account_info(json.loads(raw), scopes=SCOPES)
    session = AuthorizedSession(credentials)
    end = date.today() - timedelta(days=1)  # yesterday may be incomplete for GA4 Global (US-Pacific timezone)
    bootstrap = date.fromisoformat(os.getenv("GA4_BOOTSTRAP_START", "2026-06-24"))
    refresh_days = int(os.getenv("GA4_REFRESH_DAYS", "35"))
    start = min(end - timedelta(days=refresh_days - 1), bootstrap) if os.getenv("GA4_FULL_BACKFILL", "") == "1" else end - timedelta(days=refresh_days - 1)
    # Automatically backfill to bootstrap if the workbook has no historical rows.
    existing = {tab: read_existing(session, tab) for tab in TABS}
    if not existing["Daily"] or min(str(r[0]) for r in existing["Daily"] if r) > bootstrap.isoformat():
        start = bootstrap
    if end < start:
        print("No completed dates to sync")
        return
    fetched = {tab: [] for tab in TABS}
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    for site, property_id in PROPERTIES.items():
        site_rows = {}
        for tab, (dims, metrics) in REPORTS.items():
            report = run_report(session, property_id, dims, metrics, start.isoformat(), end.isoformat())
            site_rows[tab] = [to_sheet_row(tab, site, d, m) for d, m in report]
            print(f"{site} {tab}: {len(report)} rows")
        for tab, rows in site_rows.items():
            fetched[tab].extend(rows)
        for day_index in range((end - start).days + 1):
            day = (start + timedelta(days=day_index)).isoformat()
            observed = any(row[0] == day for row in site_rows["Daily"])
            fetched["Checks"].append([day, site, now, ("PRELIMINARY" if day == end.isoformat() else "OK") if observed else "NO_DATA", ("Latest day: GA4 may still be processing or in a different timezone" if day == end.isoformat() else "GA4 daily report present") if observed else "No GA4 daily row; investigate tag or processing delay"])
    payload = []
    for tab, header in TABS.items():
        old = [r for r in existing[tab] if r and str(r[0]) < start.isoformat()]
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
    # Clear stale rows and write in bounded batches (avoid oversized Sheets API payloads).
    api_json(session, "POST", sheets_url("values:batchClear"), json={"ranges": [spreadsheet_range(t) for t in TABS]})
    for item in payload:
        tab = item["range"].split("'")[1]
        rows = item["values"]
        for offset in range(0, len(rows), 1500):
            block = rows[offset:offset + 1500]
            api_json(session, "POST", sheets_url("values:batchUpdate"),
                     json={"valueInputOption": "RAW",
                           "data": [{"range": f"'{tab}'!A{offset + 1}", "values": block}]})
        print(f"Sheet {tab}: {len(rows) - 1} data rows stored")
    print(f"Synced {start}..{end}; private Google Sheet {SPREADSHEET_ID}")

if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"GA4 sync failed: {exc}", file=sys.stderr)
        sys.exit(1)

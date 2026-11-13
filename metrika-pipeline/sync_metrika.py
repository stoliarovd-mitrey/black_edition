"""Read-only Yandex Metrica export; private results go only to Google Sheets.

Never print credentials, private report values, response bodies, or request URLs.
Only GET requests are permitted to Yandex. Google writes target Metrika_* tabs.
"""
import json
import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timezone
from urllib.parse import quote, urlparse

YANDEX_API = "https://api-metrika.yandex.net"
DOMAINS = {
    "ru": ("caviar-phone.ru", "caviar-phones.ru"),
    "global": ("caviar.global",),
}
METRICS = [
    "ym:s:visits", "ym:s:users", "ym:s:pageviews",
    "ym:s:percentNewVisitors", "ym:s:bounceRate", "ym:s:pageDepth",
    "ym:s:avgVisitDurationSeconds",
]
ATTRIBUTION = "cross_device_last_significant"
REPORTS = {
    "total": [],
    "daily": ["ym:s:date"],
    "sources": ["ym:s:<attribution>TrafficSource", "ym:s:<attribution>SourceEngine"],
    "utm": ["ym:s:UTMSource", "ym:s:UTMMedium"],
    "landing": ["ym:s:startURLDomain", "ym:s:startURLPath"],
}


class ApiError(Exception):
    """Sanitized error that is safe in public Action logs."""
    def __init__(self, message, details=None):
        super().__init__(message)
        self.details = details


def api_json(session, method, url, **kwargs):
    for attempt in range(4):
        try:
            response = session.request(method, url, timeout=90, **kwargs)
        except Exception:
            if attempt == 3:
                raise ApiError("Network request failed") from None
            time.sleep(2 ** attempt)
            continue
        if response.ok:
            try:
                return response.json()
            except ValueError:
                raise ApiError("API returned invalid JSON") from None
        if response.status_code not in (429, 500, 502, 503, 504) or attempt == 3:
            try:
                detail = response.json()
            except ValueError:
                detail = {"responseType": "non-JSON"}
            raise ApiError("API HTTP " + str(response.status_code), detail)
        time.sleep(2 ** attempt)
    raise ApiError("API retries exhausted")


def host(value):
    if isinstance(value, dict):
        value = value.get("site") or value.get("host") or ""
    text = str(value or "").strip()
    if not text:
        return ""
    return (urlparse(text if "://" in text else "https://" + text).hostname or "").lower().removeprefix("www.")


def markets_for_counter(counter):
    values = [counter.get("site"), counter.get("site2")]
    # External Taplink tags may list Caviar landing URLs as mirrors.
    # Select the primary site; those external tags are not site analytics.
    hosts = {host(v) for v in values}
    result = {m for m, aliases in DOMAINS.items() if hosts.intersection(aliases)}
    if str(counter.get("id")) == "11882827":
        result.add("ru")
    if str(counter.get("id")) == "46387191":
        result.add("global")
    return sorted(result)


def list_counters(session):
    counters, offset = [], 1
    while True:
        data = api_json(session, "GET", YANDEX_API + "/management/v1/counters", params={
            "field": "goals,mirrors", "per_page": 1000, "offset": offset,
        })
        page = data.get("counters", [])
        counters.extend(page)
        offset += len(page)
        if not page or offset > int(data.get("rows", len(counters))):
            return counters
        if offset > 100000:
            raise ApiError("Counter pagination limit exceeded")


def date_windows():
    return [(str(y), f"{y}-09-01", f"{y}-11-12") for y in (2024, 2025, 2026)]


def domain_filter(market):
    aliases = [h for d in DOMAINS[market] for h in (d, "www." + d)]
    return "ym:s:startURLDomain=.(" + ",".join("'" + d + "'" for d in aliases) + ")"


def report(session, counter_id, market, date1, date2, dimensions):
    offset, rows, first, page_meta = 1, [], None, []
    while True:
        params = {
            "ids": str(counter_id), "date1": date1, "date2": date2,
            "metrics": ",".join(METRICS), "accuracy": "full",
            "attribution": ATTRIBUTION, "lang": "ru", "include_undefined": "true",
            "filters": domain_filter(market), "limit": 10000, "offset": offset,
        }
        if dimensions:
            params["dimensions"] = ",".join(dimensions)
        data = api_json(session, "GET", YANDEX_API + "/stat/v1/data", params=params)
        if first is None:
            first = data
        page = data.get("data", [])
        rows.extend(page)
        page_meta.append({k: data.get(k) for k in (
            "sampled", "sample_share", "sample_size", "sample_space", "data_lag",
            "total_rows", "total_rows_rounded", "contains_sensitive_data",
        )})
        offset += len(page)
        if not dimensions or not page or offset > int(data.get("total_rows", len(rows))):
            break
        if len(rows) >= 100000:
            raise ApiError("Report pagination safety limit exceeded")
    actual_metrics = first.get("query", {}).get("metrics", METRICS)
    actual_dims = first.get("query", {}).get("dimensions", dimensions)
    metadata = {
        "query": first.get("query", {}), "pages": page_meta,
        "totals": dict(zip(actual_metrics, first.get("totals", []))),
        "attributionRequested": ATTRIBUTION,
        "usersAreDistinctForThisQuery": True,
        "landingFilter": domain_filter(market),
        "robotFilter": "counter/API defaults; no extra robot filter",
    }
    if not dimensions:
        rows = [{"dimensions": [], "metrics": first.get("totals", [])}]
    parsed = []
    for row in rows:
        dims = dict(zip(actual_dims, row.get("dimensions", [])))
        metrics = dict(zip(actual_metrics, row.get("metrics", [])))
        parsed.append((dims, metrics))
    return parsed, metadata


def write_tabs(session, spreadsheet_id, tabs):
    """Stage complete snapshots, then replace only pipeline-owned tab ranges."""
    base = "https://sheets.googleapis.com/v4/spreadsheets/" + spreadsheet_id
    meta = api_json(session, "GET", base, params={"fields": "sheets(properties(sheetId,title,gridProperties))"})
    existing = {s["properties"]["title"]: s["properties"] for s in meta["sheets"]}
    stages, requests = [], []
    stamp = str(int(time.time()))
    for n, (title, values) in enumerate(tabs.items()):
        if not title.startswith("Metrika_"):
            raise ValueError("Unsafe destination")
        width = max(map(len, values))
        stage_title = "_MetrikaStage_" + stamp + "_" + str(n)
        result = api_json(session, "POST", base + ":batchUpdate", json={"requests": [{"addSheet": {"properties": {
            "title": stage_title, "hidden": True,
            "gridProperties": {"rowCount": len(values), "columnCount": width},
        }}}]})
        stage_id = result["replies"][0]["addSheet"]["properties"]["sheetId"]
        stages.append(stage_id)
        for i in range(0, len(values), 300):
            api_json(session, "POST", base + "/values:batchUpdate", json={"valueInputOption": "RAW", "data": [{
                "range": "'" + stage_title + "'!A" + str(i + 1), "values": values[i:i+300],
            }]})
        if title not in existing:
            result = api_json(session, "POST", base + ":batchUpdate", json={"requests": [{"addSheet": {"properties": {
                "title": title, "gridProperties": {"rowCount": max(100, len(values)), "columnCount": width, "frozenRowCount": 1},
            }}}]})
            existing[title] = result["replies"][0]["addSheet"]["properties"]
        dest = existing[title]
        grid = dest["gridProperties"]
        if grid["rowCount"] < len(values) or grid["columnCount"] < width:
            requests.append({"updateSheetProperties": {"properties": {"sheetId": dest["sheetId"], "gridProperties": {
                "rowCount": max(grid["rowCount"], len(values)), "columnCount": max(grid["columnCount"], width),
            }}, "fields": "gridProperties.rowCount,gridProperties.columnCount"}})
        requests.append({"repeatCell": {"range": {"sheetId": dest["sheetId"]}, "cell": {}, "fields": "userEnteredValue"}})
        requests.append({"copyPaste": {"source": {"sheetId": stage_id, "startRowIndex": 0, "endRowIndex": len(values), "startColumnIndex": 0, "endColumnIndex": width},
            "destination": {"sheetId": dest["sheetId"], "startRowIndex": 0, "endRowIndex": len(values), "startColumnIndex": 0, "endColumnIndex": width}, "pasteType": "PASTE_VALUES"}})
    requests.extend({"deleteSheet": {"sheetId": s}} for s in stages)
    api_json(session, "POST", base + ":batchUpdate", json={"requests": requests})


def main():
    token = os.environ.get("YANDEX_METRIKA_TOKEN", "").strip()
    if not token:
        print("Waiting for YANDEX_METRIKA_TOKEN repository secret; no export attempted.")
        return 0
    import requests
    from google.auth.transport.requests import AuthorizedSession
    from google.oauth2 import service_account
    yandex = requests.Session()
    yandex.headers["Authorization"] = "OAuth " + token
    google = AuthorizedSession(service_account.Credentials.from_service_account_info(
        json.loads(os.environ["GOOGLE_SERVICE_ACCOUNT_JSON"]), scopes=["https://www.googleapis.com/auth/spreadsheets"]))
    spreadsheet_id = os.environ["GA4_SHEET_ID"]
    stamp = datetime.now(timezone.utc).isoformat()
    counters = list_counters(yandex)
    selected = [(c, m) for c in counters for m in markets_for_counter(c)]
    crows = [["counterId", "market", "name", "site", "mirrorsJSON", "created", "timezone", "checkedUTC"]]
    grows = [["counterId", "goalId", "name", "type", "source", "status", "checkedUTC"]]
    rrows = [["counterId", "market", "year", "date1", "date2", "report", "dimensionsJSON", "metricsJSON", "metadataJSON", "checkedUTC"]]
    checks = [["checkedUTC", "counterId", "market", "year", "report", "status", "rows", "note"]]
    jsonstr = lambda v: json.dumps(v, ensure_ascii=False, separators=(",", ":"))
    failed = False
    for market in DOMAINS:
        if not any(m == market for _, m in selected):
            checks.append([stamp, "", market, "", "counter", "NO_ACCESSIBLE_COUNTER", 0, "No matching counter in this account; not zero traffic."])
    seen = set()
    tasks = []
    for c, market in selected:
        cid = str(c["id"])
        crows.append([cid, market, c.get("name", ""), host(c.get("site") or c.get("site2")), jsonstr(c.get("mirrors") or c.get("mirrors2") or []), c.get("create_time", ""), c.get("time_zone_name", ""), stamp])
        if cid not in seen:
            for goal in c.get("goals", []):
                grows.append([cid, str(goal.get("id", "")), goal.get("name", ""), goal.get("type", ""), goal.get("goal_source", ""), goal.get("status", ""), stamp])
            seen.add(cid)
        for year, date1, date2 in date_windows():
            for name, dims in REPORTS.items():
                tasks.append((cid, market, year, date1, date2, name, dims))
    def query_task(task):
        cid, market, year, date1, date2, name, dims = task
        client = requests.Session()
        client.headers["Authorization"] = "OAuth " + token
        print("Querying " + market + " " + year + " " + name, flush=True)
        try:
            rows, metadata = report(client, cid, market, date1, date2, dims)
            visits = metadata["totals"].get("ym:s:visits", 0)
            check = [stamp, cid, market, year, name, "OK" if visits else "NO_DATA", len(rows), "Sampled" if any(p.get("sampled") for p in metadata["pages"]) else "Unsampled"]
            values = [[cid, market, year, date1, date2, name, jsonstr(d), jsonstr(m), jsonstr(metadata), stamp] for d, m in rows]
            return values, check
        except ApiError as e:
            note = str(e) + (" | " + jsonstr(e.details) if e.details is not None else "")
            return [], [stamp, cid, market, year, name, "ERROR", 0, note[:45000]]
        finally:
            client.close()
    with ThreadPoolExecutor(max_workers=4) as pool:
        for values, check in pool.map(query_task, tasks):
            rrows.extend(values)
            checks.append(check)
            failed = failed or check[5] == "ERROR"
    # Keep old successful values for any query that failed on a refresh.
    failed_keys = {(r[1], r[2], str(r[3]), r[4]) for r in checks[1:] if r[5] == "ERROR"}
    if failed_keys:
        try:
            old = api_json(google, "GET", "https://sheets.googleapis.com/v4/spreadsheets/" + spreadsheet_id + "/values/" + quote("Metrika_Reports!A1:J100000", safe="")).get("values", [])
            for row in old[1:]:
                if len(row) >= 10 and (str(row[0]), row[1], str(row[2]), row[5]) in failed_keys:
                    rrows.append(row)
        except ApiError:
            pass
    tabs = {"Metrika_Checks": checks}
    if selected:
        tabs.update({"Metrika_Counters": crows, "Metrika_Goals": grows, "Metrika_Reports": rrows})
    write_tabs(google, spreadsheet_id, tabs)
    if failed or not selected:
        print("Some checks need attention; successful reports saved and earlier failed-report snapshots preserved.")
        return 2
    print("Read-only Metrica export completed. Private values stored only in Google Sheets.")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as exc:
        print("Metrica export failed safely: " + type(exc).__name__)
        sys.exit(1)

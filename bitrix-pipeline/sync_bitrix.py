#!/usr/bin/env python3
"""Read-only Bitrix24 CRM snapshot -> private Caviar GA4 Google Sheet.

No CRM names, email addresses, phone numbers, comments or free-form deal titles exported.
Never publish CRM data or tokens to GitHub. Only Bitrix READ methods are invoked.
"""
import hashlib
import hmac
import json
import os
import sys
import time
import phonenumbers
from datetime import datetime, timedelta, timezone
from urllib.parse import urlsplit
import requests
from google.oauth2 import service_account
from google.auth.transport.requests import AuthorizedSession

SHEET_ID = os.environ["GA4_SHEET_ID"]
WEBHOOK = os.environ["BITRIX24_WEBHOOK_URL"].strip().rstrip("/") + "/"
CREDS = json.loads(os.environ["GOOGLE_SERVICE_ACCOUNT_JSON"])
SCOPES = ["https://www.googleapis.com/auth/spreadsheets"]
START_DATE = os.getenv("BITRIX_START_DATE", "2023-01-01")
REFRESH_DAYS = int(os.getenv("BITRIX_REFRESH_DAYS", "60"))
MAX_ROWS = int(os.getenv("BITRIX_MAX_ROWS", "50000"))
HEADER = {
    "CRM_Deals": ["dealId","createdAt","modifiedAt","closedDateField","categoryId","stageId","stageSemanticId","closed","sourceId","sourceDescription","utmSource","utmMedium","utmCampaign","utmContent","utmTerm","opportunity","currency","assignedById","clientKey","leadId","originId","dealType","buyerType","buyerTypeRaw","store","ga4Site","storeRaw"],
    "CRM_Leads": ["leadId","createdAt","modifiedAt","statusId","statusSemanticId","sourceId","sourceDescription","utmSource","utmMedium","utmCampaign","utmContent","utmTerm","assignedById","clientKey","isReturnCustomer","opportunity","currency","marketFromPhone","phoneMarketReason"],
    "CRM_Stages": ["entityId","statusId","name","semantics","sort","categoryId"],
    "CRM_Fields": ["object","field","label","type","isRequired"],
    "CRM_Checks": ["checkedAtUTC","object","records","earliestCreatedAt","latestCreatedAt","status","note"]
}
WHITELISTS = {
    "deal": ["ID","DATE_CREATE","DATE_MODIFY","CLOSEDATE","CATEGORY_ID","STAGE_ID","STAGE_SEMANTIC_ID",
             "CLOSED","SOURCE_ID","SOURCE_DESCRIPTION","UTM_SOURCE","UTM_MEDIUM","UTM_CAMPAIGN",
             "UTM_CONTENT","UTM_TERM","OPPORTUNITY","CURRENCY_ID","ASSIGNED_BY_ID","CONTACT_ID",
             "COMPANY_ID","LEAD_ID","ORIGIN_ID","TYPE_ID","UF_CRM_1661441015959","UF_CRM_606035AA978EA"],
    "lead": ["ID","DATE_CREATE","DATE_MODIFY","STATUS_ID","STATUS_SEMANTIC_ID","SOURCE_ID",
             "SOURCE_DESCRIPTION","UTM_SOURCE","UTM_MEDIUM","UTM_CAMPAIGN","UTM_CONTENT","UTM_TERM",
             "ASSIGNED_BY_ID","CONTACT_ID","COMPANY_ID","IS_RETURN_CUSTOMER","OPPORTUNITY","CURRENCY_ID","PHONE"]
}

def require_https_webhook(url):
    u = urlsplit(url)
    if u.scheme != "https" or not u.netloc or "/rest/" not in u.path:
        raise ValueError("Invalid Bitrix24 webhook URL: expected HTTPS with /rest/ path")
    if u.username or u.password:
        raise ValueError("Webhook URL must not embed HTTP basic credentials")

def bitrix(method, parameters=None):
    # Fail closed: never make calls to write-capable endpoints.
    if method not in {"crm.deal.list","crm.deal.fields","crm.lead.list","crm.lead.fields","crm.status.list"}:
        raise ValueError("Non-read Bitrix method denied")
    url = WEBHOOK + method + ".json"
    params = parameters or {}
    for i in range(7):
        try:
            resp = requests.post(url, json=params, timeout=65)
            data = resp.json()
        except (requests.RequestException, ValueError):
            if i < 6:
                time.sleep(min(2 ** (i+1), 25))
                continue
            raise RuntimeError("Bitrix endpoint unavailable (URL and token suppressed)")
        err = data.get("error", "")
        if resp.status_code in {429, 500, 502, 503, 504} or err in {
            "QUERY_LIMIT_EXCEEDED", "OPERATION_TIME_LIMIT", "INTERNAL_SERVER_ERROR"
        }:
            if i < 6:
                time.sleep(min(2 ** (i+1), 25))
                continue
        if resp.status_code >= 400 or err:
            raise RuntimeError(f"Bitrix {method}: HTTP {resp.status_code}, code={str(err)[:70]} (secret suppressed)")
        return data
    raise RuntimeError(f"Bitrix {method}: retries exhausted")

def paged(method, params):
    output = []
    offset = 0
    while True:
        query = dict(params)
        query["start"] = offset
        data = bitrix(method, query)
        rows = data.get("result", [])
        if not isinstance(rows, list):
            raise RuntimeError(f"{method} returned unexpected format")
        output.extend(rows)
        if len(output) > MAX_ROWS:
            raise RuntimeError(f"{method}: too many rows; limit {MAX_ROWS}, refusing truncated snapshot")
        next_ = data.get("next")
        if next_ is None:
            break
        n = int(next_)
        if n <= offset:
            raise RuntimeError(f"{method}: pagination not advancing")
        offset = n
        if offset > MAX_ROWS * 2:
            raise RuntimeError(f"{method}: pagination safety limit")
        time.sleep(0.25)
    return output

def google(session, method, suffix, **kwargs):
    url = f"https://sheets.googleapis.com/v4/spreadsheets/{SHEET_ID}{suffix}"
    for attempt in range(7):
        resp = session.request(method, url, timeout=100, **kwargs)
        if resp.ok:
            return resp.json() if resp.content else {}
        if resp.status_code in {429, 500, 502, 503, 504} and attempt < 6:
            time.sleep(min(2 ** (attempt+1), 32))
            continue
        raise RuntimeError(f"Sheets API HTTP {resp.status_code}: {resp.text[:300]}")
    raise RuntimeError("Sheets API retries exhausted")

def sheet_rows(session, tab):
    from urllib.parse import quote
    data = google(session, "GET", "/values/" + quote("'" + tab + "'!A:AZ", safe=""), params={"valueRenderOption":"UNFORMATTED_VALUE"})
    rows = data.get("values", [])
    if not rows or rows[0][:len(HEADER[tab])] != HEADER[tab]:
        raise RuntimeError(f"CRM tab {tab} missing or unexpected header; refusing overwrite")
    return rows[1:]

def val(record, field):
    value = record.get(field)
    if value is None:
        return ""
    if isinstance(value, (dict, list)):
        return ""
    return str(value)[:350]

def client_key(record):
    contact = val(record,"CONTACT_ID")
    company = val(record,"COMPANY_ID")
    raw = "contact:"+contact if contact not in ("", "0") else ("company:"+company if company not in ("", "0") else "")
    if not raw:
        return ""
    return hmac.new(WEBHOOK.encode(), raw.encode(), hashlib.sha256).hexdigest()[:24]

# Actual Caviar deal-level classification, confirmed from the Bitrix enum options.
# Do not infer missing values from contact history or lead attributes.
BUYER_TYPE_FIELD = "UF_CRM_1661441015959"
BUYER_TYPES = {"1094": "Новый", "1096": "Старый", "1098": "Дилер"}

def buyer_type(d):
    raw = val(d, BUYER_TYPE_FIELD)
    if not raw:
        return "Не определено", ""
    return BUYER_TYPES.get(raw, "Неизвестный код"), raw

# Store is explicitly assigned to each deal; never infer it from customer geography.
STORE_FIELD = "UF_CRM_606035AA978EA"
STORE_TYPES = {"202": ("cvr", "ru"), "204": ("glb", "global"), "698": ("cn", "")}

def store_type(d):
    raw = val(d, STORE_FIELD)
    if not raw:
        return ("Не определено", "", "")
    site, ga4 = STORE_TYPES.get(raw, ("Неизвестный код", ""))
    return (site, ga4, raw)

def normalized_deal(d):
    return [val(d,x) for x in ["ID","DATE_CREATE","DATE_MODIFY","CLOSEDATE","CATEGORY_ID","STAGE_ID","STAGE_SEMANTIC_ID",
            "CLOSED","SOURCE_ID","SOURCE_DESCRIPTION","UTM_SOURCE","UTM_MEDIUM","UTM_CAMPAIGN","UTM_CONTENT",
            "UTM_TERM","OPPORTUNITY","CURRENCY_ID","ASSIGNED_BY_ID"]] + [
            client_key(d),val(d,"LEAD_ID"),val(d,"ORIGIN_ID"),val(d,"TYPE_ID"),*buyer_type(d),*store_type(d)]


def market_from_phone(record):
    """Region heuristic for leads only: RU + Kazakhstan -> ru, valid others -> global.
    Do not store, hash, print or export raw phone numbers.
    """
    value = record.get("PHONE")
    numbers = []
    if isinstance(value, list):
        numbers = [str(it.get("VALUE","")) for it in value if isinstance(it, dict) and it.get("VALUE")]
    elif isinstance(value, dict) and value.get("VALUE"):
        numbers = [str(value["VALUE"])]
    elif isinstance(value, str) and value.strip():
        numbers = [value]
    if not numbers:
        return ("unknown", "no_phone")
    recognized = set()
    for raw in numbers:
        raw = raw.strip()
        compact = "".join(c for c in raw if c.isdigit())
        if raw.startswith("+"):
            candidate = "+" + compact
        elif raw.startswith("00") and len(compact) > 4:
            candidate = "+" + compact[2:]
        elif len(compact) == 11 and compact[0] in "78":
            candidate = "+7" + compact[1:]
        else:
            # An unlabeled local number is not evidence of a country.
            continue
        try:
            parsed = phonenumbers.parse(candidate, None)
        except phonenumbers.NumberParseException:
            continue
        if not phonenumbers.is_valid_number(parsed):
            continue
        recognized.add("ru" if parsed.country_code == 7 else "global")
    if len(recognized) == 1:
        market = next(iter(recognized))
        return (market, "phone_country_code")
    if len(recognized) > 1:
        return ("unknown", "conflicting_phones")
    return ("unknown", "invalid_or_local_phone")

def normalized_lead(d):
    return [val(d,x) for x in ["ID","DATE_CREATE","DATE_MODIFY","STATUS_ID","STATUS_SEMANTIC_ID","SOURCE_ID",
            "SOURCE_DESCRIPTION","UTM_SOURCE","UTM_MEDIUM","UTM_CAMPAIGN","UTM_CONTENT","UTM_TERM","ASSIGNED_BY_ID"]] + [
            client_key(d),val(d,"IS_RETURN_CUSTOMER"),val(d,"OPPORTUNITY"),val(d,"CURRENCY_ID"),*market_from_phone(d)]

def main():
    require_https_webhook(WEBHOOK)
    session = AuthorizedSession(service_account.Credentials.from_service_account_info(CREDS, scopes=SCOPES))
    existing = {tab: sheet_rows(session, tab) for tab in HEADER}
    now = datetime.now(timezone.utc)
    latest = now - timedelta(days=REFRESH_DAYS)
    initial = not existing["CRM_Deals"] or not existing["CRM_Leads"]
    # Backfill all deals once whenever new classification/store columns are introduced.
    buyer_type_backfill = not existing["CRM_Deals"] or not any(
        len(row) >= len(HEADER["CRM_Deals"]) for row in existing["CRM_Deals"]
    )
    leads_phone_backfill = not existing["CRM_Leads"] or any(
        len(row) < len(HEADER["CRM_Leads"]) for row in existing["CRM_Leads"]
    )
    mode = "historical" if initial else "modified_60d"
    status_rows = paged("crm.status.list", {})
    fields_deal = bitrix("crm.deal.fields").get("result", {})
    fields_lead = bitrix("crm.lead.fields").get("result", {})
    fields = {"deal": fields_deal, "lead": fields_lead}
    current = {}
    for kind in ["deal", "lead"]:
        f = fields[kind]
        chosen = [k for k in WHITELISTS[kind] if k in f]
        if "ID" not in chosen or "DATE_CREATE" not in chosen:
            raise RuntimeError(f"Bitrix {kind} lacks mandatory fields")
        if kind == "deal" and buyer_type_backfill:
            query_filter = {">=DATE_CREATE": "2020-01-01"}
        elif initial or (kind == "lead" and leads_phone_backfill):
            query_filter = {">=DATE_CREATE": START_DATE}
        else:
            query_filter = {">=DATE_MODIFY": latest.strftime("%Y-%m-%d")}
        selection = {"select": chosen, "order": {"ID": "ASC"}, "filter": query_filter}
        records = paged(f"crm.{kind}.list", selection)
        current[kind] = records
        print(f"{kind}: fetched {len(records)} ({mode})")  # no CRM values in public logs
    # Preserve prior rows (including records not modified recently), update by CRM numeric ID.
    exports = {}
    for tab, kind, normalize in [("CRM_Deals","deal",normalized_deal),("CRM_Leads","lead",normalized_lead)]:
        by_id = {str(r[0]):r for r in existing[tab] if r and str(r[0]).isdigit()}
        for record in current[kind]:
            by_id[str(record["ID"])] = normalize(record)
        exports[tab] = [by_id[k] for k in sorted(by_id, key=int)]
    stages = []
    for d in status_rows:
        x = d.get("EXTRA") or {}
        stages.append([val(d,"ENTITY_ID"),val(d,"STATUS_ID"),val(d,"NAME"),
                       val(d,"SEMANTICS") or str(x.get("SEMANTICS","")),val(d,"SORT"),val(d,"CATEGORY_ID")])
    exports["CRM_Stages"] = stages
    meta = []
    for kind, f in fields.items():
        for name, spec in sorted(f.items()):
            meta.append([kind,name,str(spec.get("title") or spec.get("formLabel") or spec.get("listLabel") or "")[:200],
                        str(spec.get("type") or ""),str(spec.get("isRequired") or "")])
    exports["CRM_Fields"] = meta
    timestamp = now.isoformat(timespec="seconds")
    def check_row(tab, records):
        dates = sorted(str(r[1]) for r in records if len(r)>1 and r[1])
        return [timestamp,tab,len(records),dates[0] if dates else "",dates[-1] if dates else "","OK",
                "Current-state snapshot (not stage history); amount = opportunity, never use paidClientField"]
    exports["CRM_Checks"] = [check_row(tab,exports[tab]) for tab in ["CRM_Deals","CRM_Leads"]] + [
        [timestamp,"CRM_Stages",len(stages),"","","OK","Stage semantics from current CRM settings"],
        [timestamp,"CRM_Fields",len(meta),"","","OK","Schema metadata; phone used only in memory for market inference, never stored"]
    ]
    # Preflight all existing tabs and capacity before mutating any cells.
    grid = google(session,"GET","",params={"fields":"sheets(properties(sheetId,title,gridProperties(rowCount,columnCount)))"})
    layout = {s["properties"]["title"]:s["properties"] for s in grid["sheets"]}
    changes = []
    for tab, rows in exports.items():
        if tab not in layout:
            raise RuntimeError(f"Tab {tab} missing in Google Sheets")
        required = len(rows)+1
        current_n = layout[tab]["gridProperties"]["rowCount"]
        if required>current_n:
            changes.append({"updateSheetProperties":{"properties":{"sheetId":layout[tab]["sheetId"],"gridProperties":{"rowCount":required+100}},"fields":"gridProperties.rowCount"}})
    if changes:
        google(session,"POST",":batchUpdate",json={"requests":changes})
    # Update data tabs first, write checks LAST; stale check timestamp signals incomplete runs.
    for tab in ["CRM_Deals","CRM_Leads","CRM_Stages","CRM_Fields","CRM_Checks"]:
        rows = [HEADER[tab]] + exports[tab]
        google(session,"POST","/values:batchClear",json={"ranges":[f"'{tab}'!A:AZ"]})
        for index in range(0,len(rows),750):
            google(session,"POST","/values:batchUpdate",json={"valueInputOption":"RAW","data":[{
                "range":f"'{tab}'!A{index+1}","values":rows[index:index+750]}]})
        print(f"{tab}: written {len(rows)-1} records")
    print("Bitrix CRM sync finished successfully (no personal names or contact details stored)")

def record_failure(exc):
    try:
        # Do not include URLs, tokens or CRM records in the diagnostic.
        code = str(exc).split("?")[0].split(" (secret suppressed)")[0][:180]
        clean = code.replace(WEBHOOK, "[REDACTED]")
        credentials = service_account.Credentials.from_service_account_info(
            CREDS, scopes=SCOPES
        )
        session = AuthorizedSession(credentials)
        from urllib.parse import quote
        now = datetime.now(timezone.utc).isoformat(timespec="seconds")
        url = (f"https://sheets.googleapis.com/v4/spreadsheets/{SHEET_ID}/values/"
               + quote("'CRM_Checks'!A:G",safe="") + ":append")
        resp = session.post(url, params={"valueInputOption":"RAW","insertDataOption":"INSERT_ROWS"},
                            json={"values":[[now,"SYNC_ERROR",0,"","","ERROR",clean]]},timeout=30)
        if resp.status_code>=400:
            print("CRM diagnostics could not be written",file=sys.stderr)
    except Exception:
        print("CRM diagnostics unavailable",file=sys.stderr)

if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        record_failure(exc)
        print("Bitrix sync failed:",str(exc).split("?")[0][:200],file=sys.stderr)
        sys.exit(1)

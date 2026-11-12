#!/usr/bin/env python3
"""Inspect only Bitrix24 custom deal-field labels and enum choices (no CRM client data)."""
import os, json, requests, datetime, time
from google.oauth2 import service_account
from google.auth.transport.requests import AuthorizedSession

WEBHOOK = os.environ["BITRIX24_WEBHOOK_URL"].rstrip("/") + "/"
SHEET_ID = os.environ["GA4_SHEET_ID"]
SCOPES = ["https://www.googleapis.com/auth/spreadsheets"]
KEYWORDS = ("нов", "стар", "дилер", "покупател", "клиент", "тип клиента", "new", "old", "dealer", "repeat")
def post(method, payload):
    u=WEBHOOK+method+".json"
    for attempt in range(5):
        r=requests.post(u,json=payload,timeout=65)
        if r.status_code in (429,502,503,504) and attempt<4:
            time.sleep((attempt+1)*2); continue
        j=r.json()
        if r.status_code>=400 or j.get("error"):
            raise RuntimeError(f"Bitrix metadata {method} failed: status {r.status_code}, code {str(j.get('error',''))[:70]}")
        return j.get("result")
    raise RuntimeError("Bitrix metadata API unavailable")
f=post("crm.deal.fields",{})
uf=post("crm.deal.userfield.list",{"filter":{"LANG":"ru"}})
if not isinstance(f,dict) or not isinstance(uf,list):
    raise RuntimeError("Unexpected Bitrix metadata format")
byname={r.get("FIELD_NAME"):r for r in uf}
rows=[["field","label","fieldType","enumOptions","matched","lastCheckedAt"]]
now=datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds")
for name,spec in sorted(f.items()):
    if not name.startswith("UF_CRM_"):
        continue
    u=byname.get(name,{})
    label=u.get("EDIT_FORM_LABEL") or u.get("LIST_COLUMN_LABEL") or spec.get("title") or name
    if isinstance(label,dict):
        label=" | ".join(str(v) for v in label.values() if v)
    options=u.get("LIST") or spec.get("items") or []
    options_text="; ".join(f"{e.get('ID',e.get('id',''))}:{str(e.get('VALUE',e.get('value','')))[:80]}" for e in options if isinstance(e,dict))
    matched=any(w in (str(label)+" "+options_text).lower() for w in KEYWORDS)
    if not options and not matched:
        continue
    rows.append([name,str(label)[:150],str(u.get("USER_TYPE_ID") or spec.get("type") or ""),
                 options_text[:2500],"YES" if matched else "NO",now])
if len(rows)==1:
    raise RuntimeError("No candidate enumeration fields discovered")
cred=service_account.Credentials.from_service_account_info(json.loads(os.environ["GOOGLE_SERVICE_ACCOUNT_JSON"]),scopes=SCOPES)
session=AuthorizedSession(cred)
root=f"https://sheets.googleapis.com/v4/spreadsheets/{SHEET_ID}"
r=session.post(root+"/values:batchClear",json={"ranges":["'CRM_TypeMap'!A:F"]},timeout=65);r.raise_for_status()
r=session.post(root+"/values:batchUpdate",json={"valueInputOption":"RAW","data":[{"range":"'CRM_TypeMap'!A1","values":rows}]},timeout=65);r.raise_for_status()
print(f"Discovered {len(rows)-1} enum-related fields, {sum(r[4]=='YES' for r in rows[1:])} matching candidate(s). Details only in private sheet.")

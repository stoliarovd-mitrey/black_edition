#!/usr/bin/env python3
"""Read-only Bitrix24 product rows for cvr/glb deals. Store privately in Sheets.

This script never reads customer names, contact details, deal titles or free-text descriptions.
The underlying CRM_Deals sheet is the source of deal/store/buyer/currency metadata.
"""
import json
import os
import sys
import time
from datetime import datetime, timezone
from urllib.parse import urlsplit, quote
import requests
from google.oauth2 import service_account
from google.auth.transport.requests import AuthorizedSession

WEBHOOK = os.environ["BITRIX24_WEBHOOK_URL"].strip().rstrip("/") + "/"
SHEET_ID = os.environ["GA4_SHEET_ID"]
CREDS = json.loads(os.environ["GOOGLE_SERVICE_ACCOUNT_JSON"])
MAX_DEALS = int(os.environ.get("BITRIX_PRODUCTS_MAX_DEALS", "1200"))
BATCH_SIZE = 30
PRODUCTS_HEADER = ["dealId","store","ga4Site","buyerType","productRowId","productId","productName","quantity","unitPrice","lineAmount","currency","syncedAtUTC"]
CHECKS_HEADER = ["dealId","store","productRowsCount","syncedAtUTC","status"]
SCOPES = ["https://www.googleapis.com/auth/spreadsheets"]

def safe_call(method, url, **kwargs):
    for attempt in range(6):
        try:
            r = method(url, timeout=110, **kwargs)
        except requests.RequestException:
            if attempt < 5:
                time.sleep(2**attempt+1)
                continue
            raise RuntimeError("API connection unavailable (details redacted)")
        if r.status_code in (429,500,502,503,504) and attempt<5:
            time.sleep(min(2**(attempt+1),30))
            continue
        if not r.ok:
            raise RuntimeError("API call unsuccessful (status %d)"%r.status_code)
        return r.json() if r.content else {}
    raise RuntimeError("API retry exhausted")

def get_values(session, tab, header):
    address=f"https://sheets.googleapis.com/v4/spreadsheets/{SHEET_ID}/values/{quote(chr(39)+tab+chr(39)+'!A:AB',safe='')}"
    data = safe_call(session.get,address,params={"valueRenderOption":"UNFORMATTED_VALUE"})
    rows = data.get("values", [])
    if not rows or rows[0][:len(header)] != header:
        raise RuntimeError("Unexpected columns in private sheet %s"%tab)
    return rows[1:]

def put_rows(session, tab, header, rows):
    url=f"https://sheets.googleapis.com/v4/spreadsheets/{SHEET_ID}"
    if not rows:
        print("%s has no rows; preserving prior state"%tab)
        return
    required=len(rows)+1
    meta=safe_call(session.get,url,params={"fields":"sheets(properties(sheetId,title,gridProperties(rowCount)))"})
    info={s["properties"]["title"]:s["properties"] for s in meta["sheets"]}[tab]
    if required>info["gridProperties"]["rowCount"]:
        safe_call(session.post,url+":batchUpdate",json={"requests":[{"updateSheetProperties":{
            "properties":{"sheetId":info["sheetId"],"gridProperties":{"rowCount":required+100}},
            "fields":"gridProperties.rowCount"
        }}]})
    safe_call(session.post,url+"/values:batchClear",json={"ranges":[f"'{tab}'!A:AB"]})
    allrows=[header]+rows
    for start in range(0,len(allrows),600):
        block=allrows[start:start+600]
        safe_call(session.post,url+"/values:batchUpdate",json={"valueInputOption":"RAW","data":[{
            "range":f"'{tab}'!A{start+1}","values":block
        }]})

def get_products(deal_ids):
    r=urlsplit(WEBHOOK)
    if r.scheme!="https" or "/rest/" not in r.path or r.username or r.password:
        raise ValueError("Webhook URL invalid")
    cmd={str(deal_id):f"crm.deal.productrows.get?id={deal_id}" for deal_id in deal_ids}
    payload=safe_call(requests.post,WEBHOOK+"batch.json",json={"halt":0,"cmd":cmd})
    if payload.get("error"):
        raise RuntimeError("Bitrix batch returned an error code")
    result=payload.get("result",{})
    errors=result.get("result_error") or {}
    if errors:
        raise RuntimeError("Bitrix product batch returned subquery errors; refusing partial refresh")
    values=result.get("result")
    if not isinstance(values,dict):
        raise RuntimeError("Unexpected product batch response")
    if any(str(k) not in values or not isinstance(values[str(k)],list) for k in deal_ids):
        raise RuntimeError("Product batch missing records")
    return values

def main():
    sess=AuthorizedSession(service_account.Credentials.from_service_account_info(CREDS,scopes=SCOPES))
    deals=get_values(sess,"CRM_Deals",["dealId","createdAt","modifiedAt","closedDateField","categoryId","stageId","stageSemanticId","closed","sourceId","sourceDescription","utmSource","utmMedium","utmCampaign","utmContent","utmTerm","opportunity","currency","assignedById","clientKey","leadId","originId","dealType","buyerType","buyerTypeRaw","store","ga4Site","storeRaw","paidClientField"])
    previous_products=get_values(sess,"CRM_Products",PRODUCTS_HEADER)
    checks=get_values(sess,"CRM_ProductChecks",CHECKS_HEADER)
    checked={str(row[0]):row for row in checks if row}
    dmap={}
    for d in deals:
        if len(d)<27: continue
        deal_id=str(d[0])
        if not deal_id.isdigit() or str(d[24]) not in {"cvr","glb"}:continue
        dmap[deal_id]=d
    candidates=[]
    for did,d in dmap.items():
        record=checked.get(did)
        if record is None or (len(record)>3 and str(d[2])[:19]>str(record[3])[:19]):
            candidates.append(d)
    # Prefer newest purchases, then eventually backfill all older deals.
    candidates.sort(key=lambda d:(str(d[1]),int(d[0])), reverse=True)
    candidates=candidates[:MAX_DEALS]
    print("CRM eligible stores=%d, already checked=%d, requested now=%d"%(len(dmap),len(checked),len(candidates)))
    if not candidates:
        return
    now=datetime.now(timezone.utc).isoformat(timespec="seconds")
    updates={}
    checks_update={}
    for i in range(0,len(candidates),BATCH_SIZE):
        selection=candidates[i:i+BATCH_SIZE]
        payload=get_products([str(d[0]) for d in selection])
        for d in selection:
            did=str(d[0]); rows=payload[did]
            if len(rows)>500: raise RuntimeError("Unusually large number of products in one deal")
            result=[]
            for item in rows:
                if not isinstance(item,dict):raise RuntimeError("Unexpected product row")
                price=item.get("PRICE")
                qty=item.get("QUANTITY")
                try:
                    total=round(float(price)*float(qty),2)
                except (ValueError,TypeError):
                    total=""
                product_name=str(item.get("PRODUCT_NAME") or "")[:240]
                result.append([
                    did,str(d[24]),str(d[25]),str(d[22]),str(item.get("ID") or ""),
                    str(item.get("PRODUCT_ID") or ""),product_name,
                    str(qty if qty is not None else ""),str(price if price is not None else ""),
                    total,str(d[16]),now
                ])
            updates[did]=result
            checks_update[did]=[did,str(d[24]),len(rows),now,"OK"]
        if i+BATCH_SIZE<len(candidates):
            time.sleep(0.5)
    # Rebuild only after every requested deal has returned successfully.
    preserved=[p for p in previous_products if p and str(p[0]) not in updates]
    product_rows=preserved+[p for vals in updates.values() for p in vals]
    product_rows.sort(key=lambda r:(int(r[0]) if str(r[0]).isdigit() else 0,str(r[4])))
    existing_checks={str(r[0]):r for r in checks if r}
    existing_checks.update(checks_update)
    allchecks=[existing_checks[k] for k in sorted(existing_checks,key=lambda k:int(k) if k.isdigit() else 0)]
    put_rows(sess,"CRM_Products",PRODUCTS_HEADER,product_rows)
    put_rows(sess,"CRM_ProductChecks",CHECKS_HEADER,allchecks)
    print("CRM products sync OK; product rows %d; checked deals %d; remaining unsynced %d"%(
        len(product_rows),len(allchecks),max(0,len(dmap)-len(allchecks))))

if __name__=="__main__":
    try:
        main()
    except Exception as exc:
        print("Read-only product sync failed: "+str(exc).split("?")[0][:180],file=sys.stderr)
        sys.exit(1)

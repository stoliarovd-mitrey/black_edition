"""Independent read-only access check for Caviar Bitrix24 webhook.
Writes API health status privately into CRM_Checks; no data, names or tokens.
"""
import json, os, sys, datetime
import requests
from urllib.parse import quote
from google.oauth2 import service_account
from google.auth.transport.requests import AuthorizedSession

base=os.environ["BITRIX24_WEBHOOK_URL"].strip().rstrip("/")+"/"
sheet=os.environ["GA4_SHEET_ID"]
scopes=["https://www.googleapis.com/auth/spreadsheets"]
methods=["crm.deal.list","crm.lead.list","crm.status.list","crm.deal.fields","crm.lead.fields"]
def check(method):
    params={"select":["ID"],"start":0} if method.endswith(".list") and method!="crm.status.list" else {}
    res=requests.post(base+method+".json",json=params,timeout=35)
    obj=res.json()
    return res.status_code==200 and not obj.get("error"),obj.get("error","")
def main():
    outcomes=[]
    for method in methods:
        try:
            passed,reason=check(method)
        except Exception:
            passed,reason=False,"ENDPOINT_UNAVAILABLE"
        outcomes.append((method,passed,str(reason)[:70]))
    credentials=service_account.Credentials.from_service_account_info(json.loads(os.environ["GOOGLE_SERVICE_ACCOUNT_JSON"]),scopes=scopes)
    session=AuthorizedSession(credentials)
    now=datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds")
    results=[[
        now,"CONNECTION_TEST",0,"","","OK" if all(item[1] for item in outcomes) else "ERROR",
        "; ".join(f"{item[0]}:{'OK' if item[1] else item[2] or 'HTTP_ERROR'}" for item in outcomes)
    ]]
    endpoint=f"https://sheets.googleapis.com/v4/spreadsheets/{sheet}/values/"+quote("'CRM_Checks'!A:G",safe="")+":append"
    resp=session.post(endpoint,params={"valueInputOption":"RAW","insertDataOption":"INSERT_ROWS"},json={"values":results},timeout=45)
    resp.raise_for_status()
    print("Bitrix REST checks:","OK" if all(item[1] for item in outcomes) else "ERROR")
    if not all(item[1] for item in outcomes): sys.exit(1)
if __name__=="__main__":main()

"""Distinct audience per private channel definition; never logs private values."""
import json
import os
import sys
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from urllib.parse import quote
import sync_metrika as core

SOURCE = 'ym:s:cross_device_last_significantUTMSource'
MEDIUM = 'ym:s:cross_device_last_significantUTMMedium'
ENGINE = 'ym:s:cross_device_last_significantSourceEngine'
TRAFFIC = 'ym:s:cross_device_last_significantTrafficSource'
METRICS = ['ym:s:users', 'ym:s:visits', 'ym:s:bounceRate', 'ym:s:pageDepth', 'ym:s:avgVisitDurationSeconds']

def literal(value):
    return "'" + str(value).replace('\\', '\\\\').replace("'", "\\'") + "'"

def member(attr, values):
    values = sorted(set(values))
    return '(' + ' OR '.join(attr + '=.(' + ','.join(map(literal, values[i:i+100])) + ')' for i in range(0,len(values),100)) + ')'

def build_filters(utm_rows, engine_rows):
    tagged, engines, traffic = defaultdict(list), defaultdict(list), defaultdict(list)
    for row in utm_rows:
        tagged[row[1]].append(row[0])
    for row in engine_rows:
        if row[1]:
            engines[row[2]].append(row[1])
        else:
            traffic[row[2]].append(row[0])
    result = {}
    no_source = 'NOT(' + SOURCE + "=~'.+')"
    no_medium = 'NOT(' + MEDIUM + "=~'.+')"
    for channel in sorted(set(tagged) | set(engines) | set(traffic) | {'Другая реклама'}):
        clauses = []
        if tagged[channel]: clauses.append(member(SOURCE, tagged[channel]))
        fallback = []
        if engines[channel]: fallback.append(member(ENGINE, engines[channel]))
        if traffic[channel]: fallback.append(member(TRAFFIC, traffic[channel]))
        if fallback: clauses.append('(' + no_source + ' AND ' + no_medium + ' AND (' + ' OR '.join(fallback) + '))')
        if channel == 'Другая реклама': clauses.append('(' + no_source + ' AND ' + MEDIUM + "=.(\'cpc\',\'ppc\',\'paid\'))")
        result[channel] = '(' + ' OR '.join(clauses) + ')'
    return result

def main():
    import requests
    from google.auth.transport.requests import AuthorizedSession
    from google.oauth2 import service_account
    google = AuthorizedSession(service_account.Credentials.from_service_account_info(json.loads(os.environ['GOOGLE_SERVICE_ACCOUNT_JSON']), scopes=['https://www.googleapis.com/auth/spreadsheets']))
    book = os.environ['GA4_SHEET_ID']
    base = 'https://sheets.googleapis.com/v4/spreadsheets/' + book
    def read(a1):
        return core.api_json(google,'GET',base+'/values/'+quote(a1,safe=''),params={'valueRenderOption':'UNFORMATTED_VALUE'}).get('values',[])
    filters = build_filters(read('Metrika_UTM_Map!A2:D500'),read('Metrika_Engine_Map!A2:D200'))
    stamp = datetime.now(timezone.utc).isoformat()
    try:
        cached = {(r[0],str(r[1]),r[2],r[9]):r for r in read('Metrika_Channels!A2:K1000') if len(r)>=11}
    except core.ApiError:
        cached = {}
    rows = [['market','year','channel','users','visits','bounceRate','pageDepth','durationSeconds','sampled','filter','checkedUTC']]
    checks = [['market','year','channel','status','note']]
    tasks = [(market,cid,y,start,end,ch,f) for market,cid in [('ru',11882827),('global',46387191)] for y,start,end in core.date_windows() for ch,f in filters.items()]
    def query(task):
        market,cid,year,start,end,channel,segment=task
        full_filter=core.domain_filter(market)+' AND '+segment
        old=cached.get((market,str(year),channel,full_filter))
        if old:
            return old,[market,year,channel,'OK_CACHED','Identical whole-period segment; prior successful query retained']
        client=requests.Session()
        client.headers['Authorization']='OAuth '+os.environ['YANDEX_METRIKA_TOKEN']
        try:
            if len(full_filter)>10000: raise ValueError('Filter exceeds documented limit')
            result=core.api_json(client,'GET',core.YANDEX_API+'/stat/v1/data',params={'ids':cid,'date1':start,'date2':end,'metrics':','.join(METRICS),'filters':full_filter,'accuracy':'full','attribution':core.ATTRIBUTION,'include_undefined':'true','lang':'ru','limit':1})
            values=result.get('totals',[0]*len(METRICS))
            return [market,year,channel,*values,bool(result.get('sampled')),full_filter,stamp],[market,year,channel,'OK','Distinct users from one whole-period filtered query']
        except core.ApiError as exc:
            return None,[market,year,channel,'ERROR',str(exc)+' '+json.dumps(exc.details,ensure_ascii=False)]
        finally:
            client.close()
    with ThreadPoolExecutor(max_workers=4) as pool:
        for row,check in pool.map(query,tasks):
            if row: rows.append(row)
            checks.append(check)
    core.write_tabs(google,book,{'Metrika_Channels':rows,'Metrika_ChannelChecks':checks})
    failed=any(r[3]=='ERROR' for r in checks[1:])
    print('Channel queries completed; private results and checks saved to Google Sheets.')
    return 2 if failed else 0

if __name__=='__main__':
    try: sys.exit(main())
    except Exception as exc:
        print('Channel export failed safely: '+type(exc).__name__)
        sys.exit(1)

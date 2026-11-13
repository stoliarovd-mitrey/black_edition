# Caviar Metrica integration

Read-only Yandex API access (`metrika:read`); aggregate data is written only to the
existing private Google data workbook. No analytics data or tokens are committed
or uploaded as workflow artifacts. Existing GA4/CRM tabs remain unchanged.

## One-time authorization

1. Create a Yandex OAuth application at https://oauth.yandex.ru/client/new using
   “For API access or debugging”. Select only `metrika:read`.
2. Copy its **ClientID**. Open the URL below after replacing `CLIENT_ID`:
   `https://oauth.yandex.ru/authorize?response_type=token&client_id=CLIENT_ID`.
3. Authorize with the Yandex account that can view the Caviar counters.
4. Store the resulting token as a repository Actions secret named
   **YANDEX_METRIKA_TOKEN**. Never paste it into chat, an issue, source code,
   a repository variable, or a spreadsheet.
5. Run the **Caviar Metrica to private Google Sheets** workflow. It reuses the
   existing `GA4_SERVICE_ACCOUNT_JSON` secret and `GA4_SHEET_ID` variable.

Missing token is reported as “Waiting”, not a successful connection. No schedule
is enabled. Run on demand or change `metrika-pipeline/.run` to trigger a run.

## Export and interpretation

- Only counters whose site/mirror matches caviar-phone.ru, caviar-phones.ru or
  caviar.global are selected; Russian counter 11882827 is also recognized.
- Windows: 1 September–12 November inclusive in 2024, 2025, 2026 (73 days).
- Totals, daily rows, source/engine, UTM and landing domain/path. Unique visitors
  for a period come from a single period query, never a sum over days/sources.
- Source attribution: `cross_device_last_significant`. Raw query, sampling,
  timezone and filter metadata are retained for every report. Robot treatment
  uses counter/API defaults; there is no additional robot filter.
- Market filters use the landing domain. Cross-domain visits are attributed to
  their entry site. A counter missing from access is not interpreted as zero.
- Goal definitions are exported, but goal counts are not interpreted as CRM leads.
- Tables: `Metrika_Counters`, `Metrika_Goals`, `Metrika_Reports`, `Metrika_Checks`.
  Full snapshots are staged privately and committed in one Sheets batch; failed
  primary reports preserve previous data snapshots and update only checks.
- Multiple counters are exported separately. Do not add their unique visitor
  counts together without accounting for audience overlap.

Yandex docs: https://yandex.ru/dev/metrika/ru/intro/authorization
and https://yandex.ru/dev/metrika/ru/stat/openapi/data_1.

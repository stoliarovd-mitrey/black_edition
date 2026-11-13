# Caviar GA4 → Google Sheets

This is a read-only collector for two Google Analytics 4 properties:
- global: `474782469`
- ru: `368821033`

**Data stays in a private Google Sheet.** The public repository only contains source code; never commit credentials, raw analytics data, or spreadsheet exports.

## One-time authorization (Google Account owner)

1. Open [Google Cloud Console](https://console.cloud.google.com/) and create/select a project.
2. Enable **Google Analytics Data API** and **Google Sheets API** for the project.
3. IAM & Admin → Service Accounts → Create service account, e.g. `caviar-ga4-reader`. Create a **JSON key** and save it locally. Do not paste it into GitHub files or ChatGPT.
4. In GA4 Admin → Property access management for **each** property (474782469, 368821033), add the service account's email with **Viewer** permission (read-only).
5. Share this private [Google Sheet](https://docs.google.com/spreadsheets/d/1raqWcuyRnmLd5FD1b-QvElLPyMDBFcvzFONeNaaaQfo/edit) with the *same service account email* as **Editor**. The Google Sheet can remain private.
6. In [GitHub Actions secrets](https://github.com/stoliarovd-mitrey/black_edition/settings/secrets/actions) add repository **Secret** `GA4_SERVICE_ACCOUNT_JSON`, whose value is the complete contents of the JSON key file (not its filename).
7. Under [GitHub Actions variables](https://github.com/stoliarovd-mitrey/black_edition/settings/variables/actions) add repository **Variable** `GA4_SHEET_ID` = `1raqWcuyRnmLd5FD1b-QvElLPyMDBFcvzFONeNaaaQfo`.
8. Run [Caviar GA4 workflow](https://github.com/stoliarovd-mitrey/black_edition/actions/workflows/caviar-ga4.yml) once using **Run workflow**. Review the result; a successful run will populate the sheets.

Do not grant the service account GA4 Editor/Admin access: Viewer is sufficient. Do not share the service account private key in chat.

## Schedule

GitHub Actions runs at **04:15 UTC (07:15 Moscow)** and **10:15 UTC (13:15 Moscow)** every day. The second run happens after midnight in Los Angeles, so it can collect the previous property-local day for Global. GitHub's schedule may run late or occasionally skip a run. The daily 08:30 Moscow analysis should read the last successfully synced and settled dates; it must not assume that yesterday's Global calendar day has ended.

The first successful run loads data from June 24, 2026 through the last completed **property-local** day. Subsequent runs refresh the last **35 property-local days** for each property. The latest completed local date is tagged `PRELIMINARY` in **both** `Daily` and `Checks`; the current local date is never downloaded as a full day. Compare only dates tagged `OK` in both tabs and inspect `Checks` for `NO_DATA`. Raw data may still be revised by GA4 after a date becomes `OK`. Backfill happens only when historical coverage is absent or `GA4_FULL_BACKFILL=1` is specified.

## Tabs and interpretation

- `Daily`: users, sessions, engaged sessions, engagement rate, key events
- `Sources`: source/medium and GA4 default channel
- `Countries`: country breakdown
- `LandingPages`: landing page path (GA4 naming)
- `Events`: event names and counts
- `Checks`: property-local daily existence and maturity checks (`OK`, `PRELIMINARY`, `NO_DATA`), not proof of complete data

A missing row is a potential tracking issue, not evidence of zero visits. Key events are not necessarily leads or orders. Investigate traffic anomalies using GA4 and server logs; do not automatically filter whole countries.

## Troubleshooting

- HTTP 403 Analytics: confirm GA4 Viewer permission for both properties and that the API is enabled.
- HTTP 403 Sheets: confirm service account has Editor permission on the private Sheet.
- Missing secret/variable: add them in repository Settings → Secrets and variables → Actions.
- API quota errors: retry later; adjust reporting scope/number of requests.
- GitHub Actions schedule is not guaranteed to fire at the exact minute; check workflow run history.

No data will be collected until the one-time setup is completed.

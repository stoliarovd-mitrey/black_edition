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

GitHub Actions runs at **04:15 UTC (07:15 Moscow)** every day. GitHub's schedule may run late during high load. The daily 08:30 Moscow analysis should consume the private Sheet only after a successful sync.

The first successful run loads data from June 24, 2026 through yesterday. Subsequent runs refresh the last **35 days** because GA4 frequently revises recent data. The last 1–2 days may still be preliminary; compare only settled dates and review the `Checks` tab for missing dates.

## Tabs and interpretation

- `Daily`: users, sessions, engaged sessions, engagement rate, key events
- `Sources`: source/medium and GA4 default channel
- `Countries`: country breakdown
- `LandingPages`: landing page path (GA4 naming)
- `Events`: event names and counts
- `Checks`: daily existence checks, not proof of complete data

A missing row is a potential tracking issue, not evidence of zero visits. Key events are not necessarily leads or orders. Investigate traffic anomalies using GA4 and server logs; do not automatically filter whole countries.

## Troubleshooting

- HTTP 403 Analytics: confirm GA4 Viewer permission for both properties and that the API is enabled.
- HTTP 403 Sheets: confirm service account has Editor permission on the private Sheet.
- Missing secret/variable: add them in repository Settings → Secrets and variables → Actions.
- API quota errors: retry later; adjust reporting scope/number of requests.
- GitHub Actions schedule is not guaranteed to fire at the exact minute; check workflow run history.

No data will be collected until the one-time setup is completed.

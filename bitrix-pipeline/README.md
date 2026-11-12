# Caviar CRM ↔ GA4 (read-only)

Status: direct REST API connection is verified. The first historical backfill runs as a GitHub Actions job; data availability depends on completion.

## Source

- Bitrix24 REST incoming webhook is saved only as GitHub Actions secret `BITRIX24_WEBHOOK_URL`.
- Existing Google service-account JSON secret `GA4_SERVICE_ACCOUNT_JSON` accesses the existing private Google Sheet.
- Existing repository variable `GA4_SHEET_ID` points to that private Sheet.

Read-only methods: `crm.deal.list`, `crm.lead.list`, `crm.status.list`, `crm.deal.fields`, `crm.lead.fields`.
**The script does not invoke Bitrix methods that add, update, or delete CRM objects.**

No names, phones, emails, contact notes or deal titles are copied to Google Sheets. Contact/company IDs become a stable pseudonymous `clientKey` using HMAC. The key is not published.

## Destination tabs in private Google Sheet

- `CRM_Deals`: current deal snapshots (stage, category, source, UTM, value, currency, pseudo-client key, dates)
- `CRM_Leads`: current lead snapshots (status, source, UTM, pseudo-client key, dates)
- `CRM_Stages`: stage code to current label/semantics
- `CRM_Fields`: metadata for finding company-specific source/sale fields
- `CRM_Checks`: successful export timestamp / errors / API-access healthchecks

GA4 is in separate tabs (`Daily`, `Sources`, `Countries`, `LandingPages`, `Events`, `Checks`).

## Operations

Workflow: `.github/workflows/caviar-bitrix.yml`

- Runs daily around **06:50 Moscow** (03:50 UTC), subject to GitHub Actions scheduling delays.
- First run fetches CRM objects from 2023-01-01, **not the complete lifetime history**.
- Following runs update objects modified during the previous 60 days and keep previously fetched older objects.
- Includes pagination for all list methods and retries for rate limits.
- If the run fails, the `CRM_Checks` tab receives a diagnostic row. The daily AI report should not treat stale CRM data as fresh.
- GitHub workflow logs show record counts, not actual records.

Connection-only check workflow: `.github/workflows/caviar-bitrix-verify.yml`, saves a `CONNECTION_TEST` result to `CRM_Checks`.

## Attribution caveats

The original GA4 data export is **aggregated**, not individual sessions; it cannot be deterministically matched to a specific lead. Data can be compared by time, market, campaign/source where available, or product manually mapped from CRM fields.

A deal's current stage is *not* historical stage transition data. `CLOSEDATE` can be planned rather than actual payment date. `OPPORTUNITY` is not verified realized revenue. Determine the actual paid/fulfilled status and payment amount fields with the sales team before reporting true sales.

Pseudo-client keys can indicate repeat *CRM contact* but only when contact/company links exist, and only for history included in export. New customers, first purchase dates and paid order values require business-rule validation.

**Security:** The repository is public. Never commit CRM outputs, API responses, identifiers, tokens, spreadsheet exports, or the complete webhook URL.

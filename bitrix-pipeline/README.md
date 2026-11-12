# Caviar CRM ↔ GA4 (read-only)

Status: direct REST API connection is verified. The first historical backfill runs as a GitHub Actions job; data availability depends on completion.

## Source

- Bitrix24 REST incoming webhook is saved only as GitHub Actions secret `BITRIX24_WEBHOOK_URL`.
- Existing Google service-account JSON secret `GA4_SERVICE_ACCOUNT_JSON` accesses the existing private Google Sheet.
- Existing repository variable `GA4_SHEET_ID` points to that private Sheet.

Read-only methods: `crm.deal.list`, `crm.lead.list`, `crm.status.list`, `crm.deal.fields`, `crm.lead.fields`, and deal product rows through `batch` of `crm.deal.productrows.get` calls.
**The script does not invoke Bitrix methods that add, update, or delete CRM objects.**

No names, phones, emails, contact notes or deal titles are copied to Google Sheets. Contact/company IDs become a stable pseudonymous `clientKey` using HMAC. The key is not published.

## Destination tabs in private Google Sheet

- `CRM_Deals`: current deal snapshots (stage, source, UTM, `opportunity` value, currency, pseudonymous client key, buyer type, store, optional `paidClientField`, dates).
- `CRM_Leads`: current lead snapshots (status, source, UTM, pseudo-client key, dates)
- `CRM_Stages`: stage code to current label/semantics
- `CRM_Fields`: metadata for finding company-specific source/sale fields
- `CRM_Checks`: successful export timestamp / errors / API-access healthchecks
- `CRM_Products`: read-only product rows for `cvr` and `glb` deals, with product name, catalog ID, quantity, price, calculated line amount (not independently verified revenue)
- `CRM_ProductChecks`: each inspected deal, number of product rows and refresh timestamp. This allows distinguishing **no products** from **not yet inspected**

GA4 is in separate tabs (`Daily`, `Sources`, `Countries`, `LandingPages`, `Events`, `Checks`).

## Operations

Workflows: `.github/workflows/caviar-bitrix.yml` for deals/leads and `.github/workflows/caviar-bitrix-products.yml` for product rows.

- Runs daily around **06:50 Moscow** (03:50 UTC), subject to GitHub Actions scheduling delays.
- Store/buyer-type backfill covers accessible historical deals, while initial lead backfill starts from 2023-01-01. Access and CRM retention determine actual coverage.
- Product backfill is incremental: up to 1200 unchecked/changed cvr or glb deals per run, prioritizing recent deals. Use `CRM_ProductChecks` to measure coverage.
- Following runs update objects modified during the previous 60 days and keep previously fetched older objects.
- Includes pagination for all list methods and retries for rate limits.
- If the run fails, the `CRM_Checks` tab receives a diagnostic row. The daily AI report should not treat stale CRM data as fresh.
- GitHub workflow logs show record counts, not actual records.

Connection-only check workflow: `.github/workflows/caviar-bitrix-verify.yml`, saves a `CONNECTION_TEST` result to `CRM_Checks`.

## Attribution caveats

The original GA4 data export is **aggregated**, not individual sessions; it cannot be deterministically matched to a specific lead. Data can be compared by time, market, campaign/source where available, or product manually mapped from CRM fields.

A deal's current stage is *not* historical stage transition data. `CLOSEDATE` can be planned rather than actual payment date. `OPPORTUNITY` is not verified realized revenue. Determine the actual paid/fulfilled status and payment amount fields with the sales team before reporting true sales.

Customer segment is taken **directly** from Bitrix24 deal field `UF_CRM_1661441015959`: `1094` new, `1096` old, `1098` dealer. Blank histories stay `Не определено`; do not guess from linked contacts.

Store is taken **directly** from deal field `UF_CRM_606035AA978EA`: `202` = `cvr` (Russian store, compare with caviar-phone.ru/GA4 ru); `204` = `glb` (Global store, compare with caviar.global/GA4 global); `698` = `cn` (Chinese store; **exclude from RU/Global comparisons**). Null store is `Не определено`. Product fetching is limited to cvr and glb deals.

Deal amount `OPPORTUNITY` is not realized revenue. `UF_CRM_1614947278479` labelled `Оплачено клиентом` is exported as `paidClientField` but its commercial definition needs verification. For deal-level sums, count each deal once even if it has several product rows; never sum entire deal amount across product rows. Individual `CRM_Products.lineAmount` is computed as `PRICE × QUANTITY`, not a payment record.

**Security:** The repository is public. Never commit CRM outputs, API responses, identifiers, tokens, spreadsheet exports, or the complete webhook URL.

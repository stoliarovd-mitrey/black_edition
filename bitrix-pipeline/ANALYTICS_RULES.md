# Caviar: GA4 + Bitrix24 analytic rules

These rules apply to all daily reports and historical comparisons.

## Deals
- Use **only** `CRM_Deals.opportunity` as the value of a deal, in `CRM_Deals.currency`.
- Never use "Оплачено клиентом", payment fields, or per-product sums for the revenue/value metric.
- Deal amount is the **recorded deal value**, not independently verified cash received.
- Success = `STAGE_SEMANTIC_ID=S`; failure = `F`; ongoing = `P`. A deal can be counted as a successful deal only if its current semantic status is S.
- Separate currencies, deduplicate by `dealId`, and report new/old/dealer buyers only from the verified deal buyer-type field.
- Store `cvr` = Russia => GA4 `ru`; `glb` = international => GA4 `global`; `cn` = Chinese legacy store => excluded. Blank store is unknown.
- Products are for product names and quantities only. A deal with several lines still contributes its **opportunity exactly once**.

## Leads
- Lead `isReturnCustomer` has inadequate coverage and **must not be used to report new vs repeat people**.
- Success = `STATUS_SEMANTIC_ID=S`; failure = `F`; ongoing = `P`. Successful lead does **not** imply a sale.
- The Bitrix webhook requests `PHONE` only to classify probable lead market in memory; phone values are never logged, uploaded to GitHub, or persisted in Sheets.
- Valid +7 numbers (Russian or Kazakh) => inferred `ru`. Valid international numbers with other country codes => inferred `global`. No valid international number or conflicting numbers => `unknown`.
- `marketFromPhone` is a **market heuristic, not proof that a lead came from a particular website**. Legacy China-site contacts may be misclassified as `global` when they have international phone numbers.
- When CRM leads lack numbers, show the unknown share. Never assign missing numbers to Global by default.
- If the corresponding CRM sheet has not refreshed successfully, don't make claims about current CRM leads.

## GA4 comparison
- GA4 reports count website sessions/users; CRM phone-based market count is not website attribution.
- Compare rates with complete comparable date ranges and exclude preliminary/partial GA4 dates.
- Do not call correlations of aggregate lead counts and sessions attributed conversions.
- Exclude clearly suspect/bot-like traffic only from separately-labeled diagnostic cuts, not by silently deleting raw records.

## Источники заказов и UTM (обязательное правило)
- Обе вкладки `CRM_Deals` и `CRM_Leads` уже содержат `sourceId`, `sourceDescription`, `utmSource`, `utmMedium`, `utmCampaign`, `utmContent`, `utmTerm`. Эти данные надо использовать в каждом ежедневном сравнении, если CRM_Checks свежий и статус OK. Новые поля/запросы в Bitrix не нужны.
- `sourceId` — категория «Источник» в CRM. Расшифровывай по `CRM_Stages` только там, где `entityId=SOURCE` и `statusId=sourceId`. Нерасшифрованный код не присваивай выдуманному каналу. Значение могли установить вручную либо через интеграцию; происхождение конкретной записи без аудита изменений неизвестно. `sourceDescription` — свободный текст, в нём возможны персональные данные. Не воспроизводи описания в отчётах; используй лишь обезличенные агрегаты при необходимости.
- UTM — отдельный источник *меток, записанных в CRM*, не равнозначный `sourceId`. `utmSource` часто отражает реферер (google.com/yandex.ru), а не оплаченную кампанию. Платным считай только случаи с подтверждающим medium/campaign/типом источника, а не по одному домену поиска.
- По созданным сделкам и лидам показывай: долю заполнения `sourceId`; долю с хотя бы одной UTM; при существенных изменениях — лидирующие *расшифрованные* источники и UTM-каналы, отдельно неизвестные и незаполненные. Доли вычисляй для выбранного периода/рынка, а не переносить долю из всей истории.
- Если `CRM_Deals.leadId` точно совпадает с `CRM_Leads.leadId`, допустимо анализировать UTM связанного лида как **метку исходного лида**, отдельно от UTM самой сделки. Не копировать метки лида в сделку молча и не переносить на сделки по `clientKey`/контакту.
- Не приравнивай менеджерский «Источник» к автоматически проставленной UTM, и не подменяй отсутствующую UTM агрегированными каналами GA4. Наличие UTM в конкретной CRM-записи даёт основание говорить об этой записи/метке, но не доказывает точную многоканальную атрибуцию покупки.
- Для сравнения сделок с GA4 используй только магазин `cvr` ↔ `ru`, `glb` ↔ `global`; `cn` исключён, пустой store отдельно. Для лидов `marketFromPhone` — лишь предполагаемый рынок, не сайт; возможное присутствие китайских обращений указывать как погрешность.
- Суммы только `CRM_Deals.opportunity` с разбивкой по `CRM_Deals.currency` и `STAGE_SEMANTIC_ID=S` для стоимости успешных сделок. Даты `createdAt` — дата создания, не дата успеха или платежа. Не использовать платежи, оплачено клиентом, `CRM_Products.lineAmount` или неопределённые поля сумм.

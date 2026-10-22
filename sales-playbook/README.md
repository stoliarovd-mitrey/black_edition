# Caviar Global — Instagram Direct Sales Playbook

Two pages backed by one editable JSON source:

- `index.html`: read-only manager-facing scripts, copy buttons, search/filter and an interactive 7-stage funnel.
- `editor.html`: separate visual editor for the owner. In addition to scripts, funnel stages and rules, its **Тексты страницы** tab edits all manager-facing page headings, explanatory text, summary cards, navigation labels and checklist items. It edits a browser-local draft and can publish changes with a **fine-grained GitHub Personal Access Token** for this repository, restricted to `Contents: read and write`. The token is never persisted.
- `data.json`: canonical source. Both interfaces read this file. Updating it updates the live manager page without changing the design.

Published paths (when GitHub Pages is configured for `main` root):

- Public manager: `https://stoliarovd-mitrey.github.io/black_edition/sales-playbook/`
- Editor: `https://stoliarovd-mitrey.github.io/black_edition/sales-playbook/editor.html`

**Security:** GitHub Pages is public. The editor URL is also publicly readable even though it is not linked from the manager page. Possession of the URL gives no write permissions: publishing requires a GitHub credential authorized for this repository. Never publish tokens in site content or share them with employees. Use only a token restricted to this repo, revoke it when unused, or download `data.json` and edit through GitHub's own authenticated interface.

All prices, production times and available models are placeholders until independently confirmed by Caviar sales. Do not publish identifiable client dialog transcripts here.
## Response prioritization

There is one manager. This playbook does **not** promise a fixed response time of 10–20 minutes. Handle buying, payment and showroom requests first; then active qualified conversations and ordinary campaign inquiries. Check Direct routinely during the shift and use realistic follow-ups.

## Editing page copy

Open `editor.html`, choose **Тексты страницы**, then select **Воронка**, **Скрипты**, **Стандарты** or **Навигация**. Edit the fields and publish `data.json`. To edit a funnel stage's goal, steps, transitions or displayed time, use **Этапы воронки**. The manager page remains read-only.

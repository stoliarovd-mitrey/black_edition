# World Treasures landing

Standalone Russian landing page and visual editor. The existing presentation in `world-treasures/` is unchanged.

## Editing

Open `edit.html` on GitHub Pages. Select an item or click it on the canvas. Drag to move; drag the gold handle to resize. Use the sidebar for text, images, typography, links, coordinates, mobile order, section background and section height. Section arrows change page order. Undo and redo are available. Mobile preview follows the same responsive layout as the page.

Drafts are stored in IndexedDB in the current browser. They are not public until published. Download and import `content.json` to keep a portable copy of the editable content. Existing image paths depend on this folder's assets.

The Publish action uses a fine-grained GitHub token scoped to this repository with Contents read/write, held only in memory. It checks for concurrent changes before updating `content.json` on `main`. No token is included in source or browser storage. GitHub Pages then rebuilds normally. For files over 950 KB, download content.json and upload through GitHub. Image replacement resizes uploads to at most 1800 pixels and stores WebP data in the project.

## Sources and editorial choices

Copy is adapted from the attached World Treasures workbook, with the presentation as supporting context. Where the sources differ, the workbook's specific material and technique descriptions are used: Qasr Al Noor is platinum; Jingtai Blue is inspired by jingtai lan, without claiming the historical manufacturing method. Edition sizes are 7, 7, 7, and 8. Device variants are omitted because attached renders and spreadsheet device descriptions are not consistent. Four product images are derived from the supplied attachments.

The Contrast page supplied the narrative structure: collection hero, idea, individual model stories, craft/materials, limited edition and packaging. Odyssey .fig was unavailable and has not been reproduced. Contact action goes to Caviar's contact page, because no verified product URLs or order endpoint were supplied.

No build step. Serve via HTTP; scripts fetch content.json. Nunito Sans is reused from the existing repository.

## Cultural inspiration imagery (October 2026)

The landing's four `inspiration-*` sections use independently sourced, openly reusable reference images. They are **historical or thematic visual references**, not production images of Caviar products or claims that a specific artwork was directly reproduced in a Caviar design. Their image URL, title and description are editable via `content.json` and the landing editor.

- Qasr Al Noor: **Arabesque details in Alhambra — DSC07703.JPG**, Daderot, CC0 1.0. Wikimedia Commons: https://commons.wikimedia.org/wiki/File:Arabesque_details_in_Alhambra_-_DSC07703.JPG
- Omkara: **Om symbol.svg**, Wikimedia Commons, public-domain geometric symbol: https://commons.wikimedia.org/wiki/File:Om_symbol.svg
- Dali: **Surreal.png**, Wikionion, CC0 1.0. A generic surreal sketch, not an artwork by Salvador Dalí: https://commons.wikimedia.org/wiki/File:Surreal.png
- Jingtai Blue: **Vase**, China, Qing dynasty, 18th century, Cloisonné enamel, 29.110.57, The Metropolitan Museum of Art, Public Domain: https://www.metmuseum.org/art/collection/search/40714

The images use original-provider URLs (Wikimedia Commons and The Met), not third-party stock hosts. The Commons photographs are served as width-constrained thumbnails where possible.

## Visual HTML editor (GrapesJS)

**Open:** `edit.html` is now a no-code visual builder based on [GrapesJS 0.22.6](https://grapesjs.com/), an existing open-source drag-and-drop HTML website editor (BSD-3-Clause). The previous coordinate-based editor is preserved at `edit-legacy.html`.

**What you can do without code:** Drag ready-made section layouts, hero blocks, text, buttons, galleries and images from the left panel. Use the one-click “+ Секция”, “+ Кнопка”, “+ Текст” and “+ Фото” controls. Select any element to edit its content, text alignment, text size, link, image and alt text. Double-click text inside the canvas. Select a section in the “Секции” tab and use arrows to reorder it, or drag items in the “Слои” panel. Change spacing, colors and other CSS through the “Дизайн” panel. Preview desktop, tablet and mobile versions, undo/redo, duplicate or remove elements.

**How publishing works:** A first-time editor opens the current `content.json` and converts all existing landing sections to reusable responsive HTML blocks. Editing produces a GrapesJS project, plus publishable HTML and CSS. The only publication target is **`builder-data.json`**, committed on `main` using a fine-grained GitHub token with Contents: read/write. A single file contains both project data and the generated public page, so there is no half-published HTML/CSS state. The token is not persisted. GitHub Pages displays `builder-data.json` if it exists; until the first publication, `builder-runtime.js` falls back to the original `app.js` / `content.json` landing unchanged. On a failed publish, it remains unchanged. The current public site does not require the GrapesJS runtime, just HTML and CSS from the saved file.

**Drafts:** Unpublished work is saved in the current browser's IndexedDB. The builder offers to restore it on reopening. “Скачать” exports a portable `world-treasures-builder.json` backup. The published project is stored in `builder-data.json` and can be reopened at any time for structural edits. If the remote file has changed, the publishing workflow stops instead of overwriting it. The combined GitHub publish payload has a 920 KB limit; prefer URLs to existing image files over embedding many large photographs.

**Technical layout:** `builder.js` (editor logic), `builder.css` (editor UI), `builder-theme.css` (responsive site component classes), `builder-runtime.js` (safe public HTML renderer and legacy fallback), `edit.html` (new builder), `edit-legacy.html` (preserved older editor). The visual builder itself depends on the pinned GrapesJS CDN, but the published visitor site does not.

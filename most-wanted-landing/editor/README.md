# Most Wanted content editor

Open `editor/` on the same origin as the landing page. Select a field in the sidebar or click an element in the preview. All text nodes, image groups, video posters and both videos are editable. Product images are linked across the model, lineup and detail crops.

Drafts, including uploaded files, live in IndexedDB in the current browser. Download a draft JSON to back it up or move it between computers. Downloaded HTML contains current text and uploaded media; original assets, CSS and scripts load from the published landing URL and require internet access.

Publishing requires a fine-grained GitHub personal access token scoped to `stoliarovd-mitrey/black_edition` with **Contents: Read and write**. The token is held only for the publication attempt. It is never put in IndexedDB, downloaded drafts, source code or URLs. The editor checks `content.json` revision and the branch head before updating `main`, using a fast-forward update.

The public editor itself has no write credentials. Opening it does not grant repository access. Uploads accept raster images and MP4/WebM up to 45 MiB each. Publishing writes a new content revision and uniquely named media in `assets/editor/`; source assets remain available.

`content.js` discovers fields from the source HTML before applying overrides from `content.json`. Text IDs follow original text-node order, and media IDs follow original asset discovery order. Keep this order stable when changing the source structure, or migrate the overrides as part of a structural edit. Font or CSS changes do not change field IDs.

Only the hero MOST WANTED heading uses the supplied Grand Theft Auto font. All other headings, model names, navigation, paragraphs and buttons retain Nunito Sans.

## Layout editing

The Layout (Сетка) mode shows every main section in document order. Drag a block before another or use Выше / Ниже. Configure visibility, image/text placement, column count, image aspect ratio, desktop width and padding. Mobile layouts remain stacked, with separately configurable catalog columns. Guides are editor-only. Layout settings live under `layout` in the same content revision and are included in browser drafts, backups, HTML export and GitHub publishing. Empty settings preserve the original design. Content fields are discovered before reordering to preserve their IDs.

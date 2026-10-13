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

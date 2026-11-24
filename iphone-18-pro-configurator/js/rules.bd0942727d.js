import { tr, INTL } from './i18n.js';
// Placement rules for the symbol and the nameplate (mm, back-panel coordinates: x to the right, y down).
// Frame window = the model window narrowed by the frame's side blocks; the frame's CAVIAR nameplate is a forbidden zone.
// Symbol and nameplate: entirely inside the window with an edge_gap clearance to any frame elements; between each other — at least symbol_plaque_gap.

// Camera plate shape (09.11.2026): a camera plate has the form key ('wedge'), without the key — emperor. The frame is a single list entry, while assets, volumes and parts
// are swapped for the version for the camera plate shape (frame.forms[form]: the same keys as the frame; opt — option overrides, opt.<id>.values — value overrides)
export function plateForm(cat, st) { const p = cat.plates.find(x => x.id === st.plate.id); return (p && p.form) || 'emperor'; }
export const frameHasForm = (f, form) => form === 'emperor' || !!(f.forms || {})[form];
export function frameOf(cat, st) {
  const b = cat.frames.find(x => x.id === st.frame.id) || cat.frames[0], form = plateForm(cat, st), ov = (b.forms || {})[form];
  if (!ov) return b;
  const { opt = {}, ...rest } = ov;
  const options = (b.options || []).map(o => { const oo = opt[o.id]; if (!oo) return o; const { values: vo = {}, ...r } = oo;
    return { ...o, ...r, ...(o.values ? { values: o.values.map(v => ({ ...v, ...(vo[v.id] || {}) })) } : {}) }; });
  return { ...b, ...rest, options, form };
}

export function frameWindow(cat, st) {
  // light customisation (11.11.2026): there is no frame — the symbol and the nameplate are placed on the back panel with a symbol_margin inset from the edge
  if (st.mode === 'light') { const [x0, y0, x1, y1] = cat.light.panel[st.model], g = cat.light.symbol_margin;
    return { x0: x0 + g, y0: y0 + g, x1: x1 - g, y1: y1 - g, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, blocks: [], policy: 'free', ring: null }; }
  const m = cat.models[st.model], f = frameOf(cat, st), d = cat.dims;
  let [x0, y0, x1, y1] = m.window;
  // wedge camera plate: the wedge extends into the window — the window top for the symbol and the nameplate is below the wedge tip (win_y0 of the shape; the frame has its own, if any)
  const fy = (f.win_y0 || {})[st.model] ?? (((cat.forms || {})[plateForm(cat, st)] || {}).win_y0 || {})[st.model];
  if (fy != null) y0 = Math.max(y0, fy);
  x0 += f.side; x1 -= f.side;
  const cx = (m.window[0] + m.window[2]) / 2;
  const blocks = [];
  const tw = f.tab_w ?? d.tab_w, th = f.tab_h ?? d.tab_h;           // an asset frame has the CAVIAR nameplate dimensions taken from the real geometry
  if (f.tab === 'bottom') blocks.push([cx - tw / 2, y1 - th, cx + tw / 2, y1]);
  if (f.tab === 'top') y0 += 7.0;                                   // bar with the CAVIAR nameplate at the top
  // symbol_ring ("Ring" frame, owner's change 08.11.2026): the symbol is inscribed in the ring opening and sits at its centre, it does not move
  return { x0, y0, x1, y1, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, blocks, policy: f.symbol, ring: (f.symbol_ring || {})[st.model] || null };
}

// Build code step (audit, stage 2, T13): sizes and offsets are written to the code in half-millimetres (code.js: num).
// All limits are snapped to this step INWARD of the allowed range, values — to the step: a saved code opens with the same numbers.
export const STEP = 0.5;
const up = v => Math.ceil(v / STEP - 1e-6) * STEP, dn = v => Math.floor(v / STEP + 1e-6) * STEP, snap = v => Math.round(v / STEP) * STEP;
// limits on the code step inward of [a, b]; if there is not a single step between a and b — the upper limit rounded down (not the middle: snap could round
// up and go beyond b — a symbol wider than the "Ring" opening, 18.11.2026 after the 20 mm minimum)
const inward = (a, b) => { const A = up(a), B = dn(b); return A <= B ? [A, B] : [B, B]; };

// Zones (audit, stage 2, B7). The frame's CAVIAR nameplate covers the bottom of the window across its full width: both the symbol and the nameplate sit above it with an edge_gap clearance.
// "Ring" frame (owner's decision 15.11.2026): the nameplate is allowed as an exception to the rule "does not touch frame elements" — it lies
// over the grille and the panels in the windows. The exception does not apply to the bezel: the nameplate sits below it (symbol_ring.out — the outer diameter of the bezel).
const floorY = (win, g) => Math.min(win.y1, ...win.blocks.map(b => b[1])) - g;
// vertical offset limits of the nameplate (from the window centre, mm) for the current shape and width
export function plaqueYRange(cat, st, win = frameWindow(cat, st)) {
  const pq = plaqueOf(cat, st); if (!pq) return [0, 0]; const g = cat.rules.edge_gap;
  const top = win.ring ? win.ring.c[1] + (win.ring.out ?? win.ring.d) / 2 + g : win.y0 + g;
  return inward(top + pq.h / 2 - win.cy, floorY(win, g) - pq.h / 2 - win.cy);
}
// vertical offset limits of the symbol (from the window centre, mm) for the current size; in the "Ring" the symbol does not move
export function symbolYRange(cat, st, win = frameWindow(cat, st)) {
  if (st.symbol.id === '0') return [0, 0]; if (win.ring) { const y = win.ring.c[1] - win.cy; return [y, y]; }
  const g = cat.rules.edge_gap, r = st.symbol.d / 2 * symFitK(cat, st.symbol.id);
  return inward(win.y0 + g + r - win.cy, floorY(win, g) - r - win.cy);
}

const rectDist = (px, py, r) => { const dx = Math.max(r[0] - px, 0, px - r[2]), dy = Math.max(r[1] - py, 0, py - r[3]); return Math.hypot(dx, dy); };
const rectsGap = (a, b) => Math.max(b[0] - a[2], a[0] - b[2], b[1] - a[3], a[1] - b[3]);

// nameplate size ("Changes" board 14.11.2026, change 5: "on the Pro in the Adamant frame the nameplate overlaps the frame"): width p.w, mm —
// the nameplate is scaled as a whole (k = w / shape width); limits — 60–115 % of the shape and no wider than the frame window with an edge_gap clearance
export function plaqueOf(cat, st, p = st.plaque) {
  const pq = cat.plaques.find(x => x.id === p.id); if (!pq || pq.id === '0') return null;
  const k = (p.w || pq.w) / pq.w; return { ...pq, w: pq.w * k, h: pq.h * k, k };
}
export function plaqueSizeRange(cat, st) {
  const pq = cat.plaques.find(x => x.id === st.plaque.id); if (!pq || pq.id === '0') return [0, 0];
  const win = frameWindow(cat, st), fit = win.x1 - win.x0 - 2 * cat.rules.edge_gap;
  // owner's change 19.11.2026: the nameplate is no smaller than plaque_min_w (30 mm) — the lower end of the width slider
  return inward(Math.min(Math.max(pq.w * 0.6, cat.rules.plaque_min_w ?? 0), fit), Math.min(pq.w * 1.15, fit));
}
export function plaqueRect(cat, st, win, p = st.plaque) {
  const pq = plaqueOf(cat, st, p); if (!pq) return null;
  const x = win.cx + p.x, y = win.cy + p.y;
  return [x - pq.w / 2, y - pq.h / 2, x + pq.w / 2, y + pq.h / 2];
}
// Symbol bounding radius (change 12.11.2026, "the tiger's ears stick out beyond the frame ring"): d — the symbol size (height or width of the silhouette),
// while the silhouette corners (ears, horns, shield edges) lie farther than d / 2. The catalogue fit_k — the largest silhouette radius of the asset ÷ (asset_h / 2),
// measured from the asset vertices; the fitting and clearance rules use a circle of radius d / 2 · fit_k
export const symFitK = (cat, id) => (cat.symbols.find(x => x.id === id) || {}).fit_k || 1;
export function symbolCircle(cat, st, win, s = st.symbol) {
  if (s.id === '0') return null; return [win.cx + s.x, win.cy + s.y, s.d / 2 * symFitK(cat, s.id)];
}

// Symbol size limits for the current window — the catalogue dmin and dmax, each symbol has its own (board, section "Bas-relief symbols · sizes",
// 18.11.2026: minimum 20, 24 or 25 mm, maximum from 25 to 45 mm). The minimum is not below 20 mm for any symbol (owner's change 18.11.2026
// "the symbol diameter must not be less than 20 mm"; old codes with a smaller d are raised to 20 on opening). Exception — a window smaller than
// the symbol: in the "Ring" on the Pro (Ø 25,22) symbols with protruding ears and horns (fit_k > 1,16) are fitted below 20 — otherwise they do not fit
export function symbolSizeRange(cat, st) {
  const win = frameWindow(cat, st), sy = cat.symbols.find(x => x.id === st.symbol.id) || {}; const g = cat.rules.edge_gap;
  const fit = (win.ring ? win.ring.d - 2 * g : Math.min(win.x1 - win.x0, win.y1 - win.y0) - 2 * g) / (sy.fit_k || 1);
  return inward(Math.min(sy.dmin || 10, fit), Math.min(sy.dmax || 30, fit));
}

// Bring the symbol and the nameplate to an allowed position. moved = 'symbol' | 'plaque' — which one moved last (the other gives way).
export function applyRules(cat, st, moved = 'symbol') {
  const form = plateForm(cat, st), notes0 = [];
  if (st.mode !== 'light' && !frameHasForm(cat.frames.find(x => x.id === st.frame.id) || {}, form)) {             // no frame for this camera plate shape — the first suitable one
    const f = cat.frames.find(x => frameHasForm(x, form) && !x.hidden); if (f) { st.frame.id = f.id; st.frame.opts = {}; notes0.push(tr`обрамление заменено на «${f.name}» под форму блока камер`); }
  }
  const win = frameWindow(cat, st), g = cat.rules.edge_gap, gap = cat.rules.symbol_plaque_gap; const notes = [];
  const mm = v => String(v).replace('.', INTL ? '.' : ',');   // decimal point in the English version (review 22.11.2026)
  // nameplate: width — within the limits and on the code step; position — in the zone (window, above the CAVIAR nameplate, in the "Ring" — below the bezel)
  const pq0 = cat.plaques.find(x => x.id === st.plaque.id);
  if (pq0 && pq0.id !== '0') { const [a, b] = plaqueSizeRange(cat, st), w0 = st.plaque.w ?? pq0.w; st.plaque.w = clamp(snap(w0), a, b);
    if (w0 > b + 0.05) notes0.push(tr`табличка уменьшена до ${mm(st.plaque.w)} мм — шире не помещается в окно обрамления`); }
  const pq = plaqueOf(cat, st);
  const holdPlaque = () => { if (!pq) return; const hw = pq.w / 2 + g, [a, b] = plaqueYRange(cat, st, win);
    st.plaque.x = clamp(snap(st.plaque.x), up(win.x0 + hw - win.cx), dn(win.x1 - hw - win.cx)); st.plaque.y = clamp(snap(st.plaque.y), a, b); };
  if (pq) { const y0 = st.plaque.y; holdPlaque();
    if (win.ring && st.plaque.y > y0 + 0.05) notes.push(tr('табличка опущена ниже безеля кольца'));
    else if (win.blocks.length && st.plaque.y < y0 - 0.05 && y0 <= dn(win.y1 - g - pq.h / 2 - win.cy)) notes.push(tr('табличка поднята над табличкой CAVIAR')); }
  // symbol: size — within the limits and on the code step; position — in the zone
  const sym = st.symbol.id !== '0', R = () => st.symbol.d / 2 * symFitK(cat, st.symbol.id);
  const holdSymbol = () => { if (win.ring) { st.symbol.x = win.ring.c[0] - win.cx; st.symbol.y = win.ring.c[1] - win.cy; return; }   // ring centre
    const r = R() + g, [a, b] = symbolYRange(cat, st, win);
    st.symbol.x = clamp(snap(st.symbol.x), up(win.x0 + r - win.cx), dn(win.x1 - r - win.cx)); st.symbol.y = clamp(snap(st.symbol.y), a, b); };
  if (sym) { const [dmin, dmax] = symbolSizeRange(cat, st); st.symbol.d = clamp(snap(st.symbol.d), dmin, dmax);
    const y0 = st.symbol.y; holdSymbol();
    if (!win.ring && win.blocks.length && st.symbol.y < y0 - 0.05 && y0 <= dn(win.y1 - g - R() - win.cy)) notes.push(tr('символ поднят над табличкой CAVIAR')); }
  // symbol ↔ nameplate: symbol_plaque_gap clearance. The one that did not move last gives way; the one that gave way stays in its zone —
  // so after the shift it cannot end up on the CAVIAR nameplate or on the frame (previously the zone was not rechecked after the shift)
  if (sym && pq) {
    const dist = () => { const c = symbolCircle(cat, st, win); return rectDist(c[0], c[1], plaqueRect(cat, st, win)) - c[2]; };
    // vertical distance between the symbol centre and the nearest nameplate edge at which the clearance is kept
    const need = () => { const c = symbolCircle(cat, st, win), r = plaqueRect(cat, st, win), dx = Math.max(r[0] - c[0], 0, c[0] - r[2]), q = c[2] + gap;
      return dx >= q ? 0 : Math.sqrt(q * q - dx * dx); };
    if (dist() < gap - 1e-6) {
      const c = symbolCircle(cat, st, win), r = plaqueRect(cat, st, win), below = (r[1] + r[3]) / 2 >= c[1], n = need();
      const tryPlaque = side => { const y = st.plaque.y, [a, b] = plaqueYRange(cat, st, win);
        st.plaque.y = side ? up(c[1] + n + pq.h / 2 - win.cy) : dn(c[1] - n - pq.h / 2 - win.cy);
        if (st.plaque.y >= a && st.plaque.y <= b) return true; st.plaque.y = y; return false; };
      const trySymbol = side => { if (win.ring) return false; const y = st.symbol.y, [a, b] = symbolYRange(cat, st, win);
        st.symbol.y = side ? up(r[3] + n - win.cy) : dn(r[1] - n - win.cy);                // side: the symbol is below the nameplate
        if (st.symbol.y >= a && st.symbol.y <= b) return true; st.symbol.y = y; return false; };
      const ok = moved === 'plaque' && !win.ring
        ? trySymbol(!below) || trySymbol(below) || tryPlaque(below) || tryPlaque(!below)
        : tryPlaque(below) || tryPlaque(!below) || trySymbol(!below) || trySymbol(below);
      if (!ok || dist() < gap - 1e-6) notes.push(tr('не хватает места: уменьшите символ или табличку'));
    }
  }
  return { win, notes: [...new Set([...notes0, ...notes])] };
}

export const clamp = (v, a, b) => Math.min(Math.max(v, Math.min(a, b)), Math.max(a, b));

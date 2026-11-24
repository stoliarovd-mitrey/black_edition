import { tr } from './i18n.js';
// Build state normalisation (audit 14.11.2026, stage 1: B1, B2, L2).
// Everything that came from a build code (link, "Open by code" field) goes through normalize():
// every id is checked against the catalogue, numbers — with Number.isFinite, texts — against the limits and the character set.
// Hidden camera plates, frames, symbols and nameplate shapes are not opened by code.
// Anything unknown is replaced with the default value; each replacement adds a line to the returned list (the customer sees it).
import { frameOf } from './rules.js';

// escaping for any substitution into HTML (text and attribute values)
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ESC[c]);

// nameplate text (owner's decision 15.11.2026): Russian and English letters, digits, basic punctuation marks;
// no more than PLAQUE_LINES lines, no more than catalog.plaque_text_max characters per line
export const PLAQUE_LINES = 2;
export const PLAQUE_CHARS_HINT = tr('Русские и английские буквы, цифры и знаки . , - ! ? & \' " « » ( ) : ; № + /');
const PLAQUE_BAD = /[^A-Za-zА-Яа-яЁё0-9 .,\-–—!?&'’"«»():;№+\/]/g;
export function cleanPlaqueLine(t, max) { return [...String(t ?? '').replace(PLAQUE_BAD, '')].slice(0, max).join(''); }
export function cleanPlaqueText(text, max) {
  const src = String(text ?? '').replace(/\r/g, '').split('\n');
  const lines = src.slice(0, PLAQUE_LINES).map(l => cleanPlaqueLine(l, max));
  while (lines.length > 1 && !lines[lines.length - 1].trim()) lines.pop();   // an empty second line is not stored
  const out = lines.join('\n'), why = [];
  if (src.filter(l => l.trim()).length > PLAQUE_LINES) why.push(tr`оставлены ${PLAQUE_LINES} строки`);
  if (src.slice(0, PLAQUE_LINES).some(l => [...l.replace(PLAQUE_BAD, '')].length > max)) why.push(tr`строка сокращена до ${max} знаков`);
  if (src.slice(0, PLAQUE_LINES).some(l => l.replace(PLAQUE_BAD, '') !== l)) why.push(tr('убраны недопустимые знаки'));
  return { text: out, why };
}

const has = (list, id) => Array.isArray(list) && list.some(x => x.id === id);
const fin = (v, def) => (typeof v === 'number' && Number.isFinite(v) ? v : def);

// camera plates and frames 1–3 (grey prototype) removed 09.11.2026: old codes with them open with the default camera plate and frame
// camera plates with hidden (Golden Rose, board change 13.11.2026 "remove") are hidden from the menu; old codes with them — the default camera plate as well
// smooth · polished (24, 25) hidden 13.11.2026 "smooth — satin only": a hidden camera plate is replaced with a visible one of the same shape and texture, satin
function fixPlate(cat, s, DEF, ns) {
  if (cat.plates.some(p => p.id === s.plate.id && !p.hidden)) return;
  const old = cat.plates.find(p => p.id === s.plate.id), vis = cat.plates.filter(p => !p.hidden), fm = p => p.form || 'emperor';
  const alt = old && (vis.find(p => fm(p) === fm(old) && p.texture === old.texture && p.finish === 'satin') || vis.find(p => fm(p) === fm(old) && p.texture === old.texture));
  if (alt) { ns.push(tr`блок камер «${old.name}» снят с витрины, взят «${alt.name}»`); s.plate = { ...s.plate, id: alt.id }; return; }
  ns.push(tr('блок камер из кода не найден, взят «') + cat.plates.find(p => p.id === DEF.plate.id).name + '»'); s.plate = { ...s.plate, id: DEF.plate.id };
}

// screw metals matching the frame metal (rules.screw_metals, owner's change 18.11.2026): screws come from the same group as the frame
// (titanium and gold plating — among themselves, precious metals — among themselves). A frame metal outside the groups — no restriction
export function screwMetals(cat, frameMetal) {
  const g = (cat.rules.screw_metals || []).find(x => x.includes(frameMetal)); return cat.metals.filter(m => !g || g.includes(m.id)).map(m => m.id);
}
// is the frame option value allowed?
function optOk(cat, o, v, frameMetal) {
  if (v === '0') return true;
  if (o.metal_of === 'SCREW') return screwMetals(cat, frameMetal).includes(v);
  if (o.metal_of) return has(cat.metals, v);
  if (o.carbon_of) return cat.inserts.some(x => x.id === v && x.type === 'carbon' && x.maps);   // part carbon — the inserts' carbon (19.11.2026)
  return has(o.values, v);
}
// panels in the windows of the "Ring" frame: 0 | M<metal><S|D|F> | C<insert carbon id> (owner's change 19.11.2026: a single "Carbon" button,
// below it — all insert carbons; the former CT (twill) and CF (forged, withdrawn from the showcase) are converted to twill 196)
export const WP_LEGACY = { CT: 'C196', CF: 'C196' };
function wpOk(cat, v) {
  const W = cat.window_panels || {};
  if (v === '0') return true;
  if (v[0] === 'M') return has(cat.metals, v.slice(1, 3)) && has(W.finishes, v[3] || 'S') && v.length <= 4;
  if (v[0] === 'C') return cat.inserts.some(x => x.id === v.slice(1) && x.type === 'carbon' && x.maps);
  return false;
}

export function normalize(cat, s, DEF) {
  const ns = [], d = k => structuredClone(DEF[k]);
  const obj = k => { if (!s[k] || typeof s[k] !== 'object') s[k] = d(k); };
  for (const k of ['plate', 'frame', 'symbol', 'plaque', 'side', 'light']) obj(k);

  // customisation type, model, body
  if (s.mode !== 'light' && s.mode !== 'full') s.mode = null;
  if (!Object.hasOwn(cat.models, s.model)) { ns.push(tr('модель из кода не найдена, взята ') + cat.models[DEF.model].name); s.model = DEF.model; }
  s.color = (cat.color_aliases || {})[s.color] || s.color;                                          // old colour codes
  if (!has(cat.colors, s.color)) { ns.push(tr('цвет корпуса из кода не найден, взят ') + cat.colors.find(c => c.id === DEF.color).name); s.color = DEF.color; }
  if (!has(cat.storage, s.storage)) { ns.push(tr('объём памяти из кода не найден, взят ') + cat.storage.find(x => x.id === DEF.storage).name); s.storage = DEF.storage; }
  if (!has(cat.wallpapers, s.wall)) s.wall = cat.wallpapers[0].id;                                   // old codes (W0 — screen off) → black wallpaper
  if (!has(cat.packs || [{ id: '0' }], s.pack)) s.pack = '0';                                         // packaging (16.11.2026: choice from cat.packs), unknown — the red case

  // full customisation: G10, camera plate, frame, insert
  if (!has(cat.g10, s.g10)) { if (s.mode === 'full') ns.push(tr('цвет канта из кода не найден, взят ') + cat.g10.find(x => x.id === DEF.g10).name); s.g10 = DEF.g10; }
  fixPlate(cat, s, DEF, s.mode === 'full' ? ns : []);
  if (!has(cat.metals, s.plate.metal)) { if (s.mode === 'full') ns.push(tr('металл блока камер из кода не найден, взят ') + cat.metals.find(m => m.id === DEF.plate.metal).name); s.plate.metal = DEF.plate.metal; }
  if (!cat.frames.some(f => f.id === s.frame.id && !f.hidden)) {
    if (s.mode === 'full') ns.push(tr('обрамление из кода снято с витрины, взято «') + cat.frames.find(f => f.id === DEF.frame.id).name + '»');
    s.frame = { ...d('frame'), metal: s.frame.metal }; }
  if (!has(cat.metals, s.frame.metal)) { if (s.mode === 'full') ns.push(tr('металл обрамления из кода не найден, взят ') + cat.metals.find(m => m.id === DEF.frame.metal).name); s.frame.metal = DEF.frame.metal; }
  { const fr = frameOf(cat, s), src = s.frame.opts && typeof s.frame.opts === 'object' ? s.frame.opts : {}, out = {}; let dropped = false;
    for (const [k, v] of Object.entries(src)) {
      const o = (fr.options || []).find(x => x.id === k); let val = String(v);
      if (k === 'WP' && WP_LEGACY[val]) { if (val === 'CF' && s.mode === 'full') ns.push(tr('кованый карбон панелей снят с витрины, взят «Карбон»')); val = WP_LEGACY[val]; }
      // panel carbon withdrawn from the showcase (e.g. "Carbon with gold", 20.11.2026) — twill, not metal
      if (k === 'WP' && val[0] === 'C' && !wpOk(cat, val)) { if (s.mode === 'full') ns.push(tr('карбон панелей из кода снят с витрины, взят «Карбон»')); val = 'C196'; }
      if (o && o.fixed != null) continue;   // fixed value (screws in the frame colour, 21.11.2026): not taken from the code, no note
      const ok = k === 'WP' ? !!fr.window_panels && wpOk(cat, val) : !!o && optOk(cat, o, val, s.frame.metal);
      if (ok) out[k] = val; else if (o && o.metal_of === 'SCREW' && has(cat.metals, val)) { if (s.mode === 'full') ns.push(tr('металл винтов из кода не сочетается с металлом обрамления, взят в цвет обрамления')); }
      else dropped = true; }
    if (dropped && s.mode === 'full') ns.push(tr('часть опций обрамления из кода не найдена, взяты значения по умолчанию'));
    if (fr.window_panels && (!out.WP || out.WP === '0')) out.WP = 'M' + s.frame.metal + 'S';   // "Ring" without panels withdrawn (17.11.2026)
    // bezel carbon (19.11.2026): the former "4" (forged, withdrawn) → "3" "Carbon" + twill; "Carbon" with no choice — twill 196; not carbon — no BC
    { const bp = (fr.options || []).find(o => o.variant_of === 'BEZEL'), bco = (fr.options || []).find(o => o.carbon_of === 'BEZEL');
      if (bp && bco) { if (src[bp.id] === '4' && !out[bp.id]) { out[bp.id] = '3'; out[bco.id] = '196'; if (s.mode === 'full') ns.push(tr('кованый карбон безеля снят с витрины, взят «Карбон»')); }
        const carb = (bp.values.find(v => v.id === out[bp.id]) || {}).carbon;
        if (carb && !out[bco.id]) out[bco.id] = '196'; if (!carb) delete out[bco.id]; } }
    s.frame.opts = out; }
  if (!has(cat.inserts, s.insert)) { if (s.mode === 'full') ns.push(tr('вкладка из кода не найдена, взята «') + cat.inserts.find(x => x.id === DEF.insert).name + '»'); s.insert = DEF.insert; }

  // light customisation: panel
  { const L = cat.light, o = s.light, D = DEF.light, lt = s.mode === 'light';
    if (o.mat !== 'M' && o.mat !== 'C') o.mat = D.mat;
    if (!has(L.metals, o.metal)) { if (lt && o.mat === 'M') ns.push(tr('металл панели из кода не найден, взят ') + (cat.metals.find(m => m.id === D.metal) || {}).name); o.metal = D.metal; }
    if (!has(L.carbon.colors, o.carbon)) { if (lt && o.mat === 'C') ns.push(tr('цвет карбона из кода не найден, взят ') + (L.carbon.colors.find(c => c.id === D.carbon) || {}).name); o.carbon = D.carbon; }
    if (o.tex !== '0' && !has(L.textures, o.tex)) { if (lt) ns.push(tr('фактура панели из кода больше не выпускается, панель без фактуры')); o.tex = '0'; }
    if (o.laser !== '0' && !has(L.lasers, o.laser)) { if (lt) ns.push(tr('узор лазерной гравировки из кода больше не выпускается, гравировка снята')); o.laser = '0'; }
    if (!has(L.laser_colors, o.lc)) o.lc = D.lc;
    if (!has(L.enamel_colors || [], o.ec)) o.ec = D.ec ?? '0';                                   // enamel colour of a texture with enamel (16.11.2026)
    if (o.satin !== '0' && o.satin !== '1') o.satin = '1'; }

  // symbol
  { const y = s.symbol, D = DEF.symbol;
    if (y.id !== '0' && !has(cat.symbols, y.id)) { ns.push(tr('символ из кода не найден, сборка открыта без символа')); y.id = '0'; }
    // a hidden symbol (withdrawn from the showcase) is not opened by code (audit, stage 2, B7)
    { const h = cat.symbols.find(x => x.id === y.id); if (h && h.hidden) { ns.push(tr`символ «${h.name}» снят с витрины, сборка открыта без символа`); y.id = '0'; } }
    const sy = cat.symbols.find(x => x.id === y.id) || {};
    if (!has(cat.metals, y.metal)) { if (y.id !== '0') ns.push(tr('металл символа из кода не найден, взят ') + cat.metals.find(m => m.id === D.metal).name); y.metal = D.metal; }
    const bad = [y.d, y.x, y.y].some(v => !(typeof v === 'number' && Number.isFinite(v)));
    y.d = fin(y.d, sy.d || D.d); y.x = fin(y.x, D.x); y.y = fin(y.y, D.y);
    if (bad && y.id !== '0') ns.push(tr('размер или положение символа в коде записаны с ошибкой, взяты значения по умолчанию'));
    const b = y.base && typeof y.base === 'object' ? y.base : {}, B = sy.base || {};
    y.base = { f: b.f === 'E' ? 'E' : 'S', m: b.m === '0' || has(cat.metals, b.m) ? b.m : '0',
      e: has(B.enamel, b.e) ? b.e : (B.default && has(B.enamel, B.default.e) ? B.default.e : (B.enamel?.[0]?.id ?? '1')) }; }

  // nameplate
  { const p = s.plaque, D = DEF.plaque;
    if (p.id !== '0' && !has(cat.plaques, p.id)) { ns.push(tr('табличка из кода не найдена, сборка открыта без таблички')); p.id = '0'; }
    // a hidden nameplate shape (withdrawn from the showcase) is not opened by code: the text is kept, the shape — the first one in the showcase (audit, stage 2, B7)
    { const h = cat.plaques.find(x => x.id === p.id), alt = cat.plaques.find(x => x.id !== '0' && !x.hidden);
      if (h && h.hidden) { if (alt) { ns.push(tr`форма таблички «${h.name}» снята с витрины, взята «${alt.name}»`); p.id = alt.id; delete p.w; } else { ns.push(tr('табличка из кода снята с витрины, сборка открыта без таблички')); p.id = '0'; } } }
    if (!has(cat.metals, p.metal)) { if (p.id !== '0') ns.push(tr('металл таблички из кода не найден, взят ') + cat.metals.find(m => m.id === D.metal).name); p.metal = D.metal; }
    if (!has(cat.fonts, p.font)) { if (p.id !== '0') ns.push(tr('шрифт таблички из кода не найден, взят «') + cat.fonts.find(f => f.id === D.font).name + '»'); p.font = D.font; }
    const bad = [p.x, p.y].some(v => !(typeof v === 'number' && Number.isFinite(v))) || (p.w != null && !(typeof p.w === 'number' && Number.isFinite(p.w)));
    p.x = fin(p.x, D.x); p.y = fin(p.y, D.y); if (!(typeof p.w === 'number' && Number.isFinite(p.w) && p.w > 0)) delete p.w;
    if (bad && p.id !== '0') ns.push(tr('размер или положение таблички в коде записаны с ошибкой, взяты значения по умолчанию'));
    const c = cleanPlaqueText(p.text, cat.plaque_text_max);
    if (c.why.length && p.id !== '0') ns.push(tr('текст таблички изменён: ') + c.why.join(', '));
    p.text = p.id === '0' ? '' : c.text; }

  // side engraving: strings (the character set and length are checked by fit() from engrave.js)
  s.side = { l: typeof s.side.l === 'string' ? s.side.l : '', r: typeof s.side.r === 'string' ? s.side.r : '' };
  return ns;
}

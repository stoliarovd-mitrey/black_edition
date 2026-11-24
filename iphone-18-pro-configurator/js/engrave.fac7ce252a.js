import { tr } from './i18n.js';
// Side engraving (owner's request 11.11.2026): custom text on the left and right edges of the body.
// One font (Nunito Sans Regular), one size (cap height cap_mm), light tracking (tracking_em of the font size),
// capitals only. The text is always centred in its zone; the zone is the free stretch of the edge between the buttons and
// functional elements with a 2 mm gap (catalog.side_engraving.zones, body Y coordinates: up is +, centre is 0).
// Text length is limited by the actual typeset width, not by the number of letters.
export const SIDES = [['l', tr('Левая грань'), tr('под кнопками громкости')], ['r', tr('Правая грань'), tr('между боковой кнопкой и Camera Control')]];
const ALLOWED = /[^A-ZА-ЯЁ0-9 .,\-&'’"«»!?№+\/():]/g;               // Latin, Cyrillic, digits, simple punctuation

export const sanitize = t => (t || '').toUpperCase().replace(ALLOWED, '').replace(/\s+/g, ' ').replace(/^ /, '');

let ctx, capRatio = 0.705;
const FPX = 200;                                                     // measuring font size, px
export const fontCss = (se, px) => `400 ${px}px "${se.font}", sans-serif`;
export async function loadFont(se) {
  try { await document.fonts.load(fontCss(se, FPX), 'AZАЯ09'); } catch {}
  ctx = document.createElement('canvas').getContext('2d'); ctx.font = fontCss(se, FPX);
  const m = ctx.measureText('H'); if (m.actualBoundingBoxAscent > 0) capRatio = m.actualBoundingBoxAscent / FPX;
}
// font size in mm for the given cap height
export const fontMm = se => se.cap_mm / capRatio;
// typeset width in mm (with tracking between characters)
export function widthMm(se, text) {
  if (!text) return 0; if (!ctx) { ctx = document.createElement('canvas').getContext('2d'); ctx.font = fontCss(se, FPX); }
  const k = fontMm(se) / FPX, n = [...text].length;
  return ctx.measureText(text).width * k + se.tracking_em * fontMm(se) * (n - 1);
}
// average capital character with tracking — for the «N characters left» counter
const AVG = 'АБВГДЕЖЗИКЛМНОПРСТУФХЦЧШЭЮЯABCDEFGHJKLMNOPQRSTUVWXYZ';
export function avgCharMm(se) { widthMm(se, 'A'); const k = fontMm(se) / FPX; return ctx.measureText(AVG).width * k / AVG.length + se.tracking_em * fontMm(se); }
export const zoneLen = (se, model, side) => { const z = se.zones[model][side]; return z[1] - z[0]; };
// trim the text to the zone width; return the text, its width and the number of characters left
export function fit(se, model, side, raw) {
  let t = sanitize(raw); const L = zoneLen(se, model, side);
  while (t && widthMm(se, t) > L) t = [...t].slice(0, -1).join('');
  const w = widthMm(se, t), left = Math.max(0, Math.floor((L - w - (t ? se.tracking_em * fontMm(se) : 0)) / avgCharMm(se)));
  return { text: t, w, L, left };                                   // a trailing space is kept while typing; in 3D and in the code it is trimmed
}

import { tr } from './i18n.js';
// Build code: readable, step by step, with a format version.
// A1-PM.SB.256-G1-P1.GD.0-F1.TN.SC0-I1-S1.GD.d48.x0.ym40-T1.GD.F1.x0.y80-K0~<nameplate text base64url>
// Side engraving (11.11.2026): step E — ELR / EL / ER / E0, texts in the tail: ~<nameplate>~l<left>~r<right> (base64url).
// Light customisation (11.11.2026): step L instead of G, P, F, I — LM.<metal>.s<satin>.t<texture>.z<laser>.c<laser colour> or LC.<carbon colour>.
// Numbers are in half-millimetres, minus = «m». Unknown steps/values are replaced with default values on reading,
// so codes from early versions still open after the library is extended (new steps simply get the default).
export const CODE_VERSION = 'A1';

const num = v => { const n = Math.round(v * 2); return n < 0 ? 'm' + (-n) : String(n); };
const unnum = s => s == null ? null : (s[0] === 'm' ? -parseInt(s.slice(1), 10) : parseInt(s, 10)) / 2;
const b64e = t => btoa(unescape(encodeURIComponent(t))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const b64d = s => { try { return decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/')))); } catch { return ''; } };
// Nameplate and engraving text from a code typed from a picture or recognised by a phone (owner's failure 22.11.2026: «Tatarstan»
// did not open — recognition read «0» as «O» and «Ø»). The text characters are checked: if reading did not produce text,
// look-alike characters (0/O, 1/I/l) are tried and the only variant that reads is taken. null — could not be read.
const TEXT_OK = /^[A-Za-zА-Яа-яЁё0-9 .,\-–—!?&'’"«»():;№+\/\n]*$/, ALIKE = { O: 'O0', 0: '0O', I: 'Il1', l: 'lI1', 1: '1Il' };
const b64strict = s => { if (!/^[A-Za-z0-9_-]*$/.test(s) || s.length % 4 === 1) return null;
  try { const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/')), t = new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(bin, c => c.charCodeAt(0))); return TEXT_OK.test(t) ? t : null; } catch { return null; } };
function readText(s) { if (!s) return ''; const direct = b64strict(s); if (direct !== null) return direct;
  const at = [...s].map((c, i) => ALIKE[c] ? i : -1).filter(i => i >= 0); let total = 1; for (const i of at) { total *= ALIKE[s[i]].length; if (total > 60000) return null; }
  const found = new Map(), ch = [...s];
  (function go(k, changes) { if (found.size > 1 && changes > Math.min(...found.values())) return;
    if (k === at.length) { const t = b64strict(ch.join('')); if (t !== null && (!found.has(t) || found.get(t) > changes)) found.set(t, changes); return; }
    const i = at[k], orig = s[i]; for (const c of ALIKE[orig]) { ch[i] = c; go(k + 1, changes + (c !== orig)); } ch[i] = orig; })(0, 0);
  if (!found.size) return null; const best = Math.min(...found.values()), top = [...found].filter(([, n]) => n === best);
  return top.length === 1 ? top[0][0] : null; }

// symbol base: b + S<metal|0> (satin) or E<enamel colour>; the default (satin, symbol's metal) is not written
const baseCode = b => !b || (b.f !== 'E' && (!b.m || b.m === '0')) ? [] : ['b' + (b.f === 'E' ? 'E' + b.e : 'S' + b.m)];
export function encode(st) {
  const opts = Object.entries(st.frame.opts || {}).map(([k, v]) => k + v).join('.');
  const parts = [
    CODE_VERSION,
    [st.model, st.color, st.storage].join('.'),
    ...(st.mode === 'light' ? [st.light.mat === 'C' ? 'LC.' + st.light.carbon
      : ['LM', st.light.metal, 's' + st.light.satin, 't' + st.light.tex, 'z' + st.light.laser, 'c' + st.light.lc, 'e' + (st.light.ec || '0')].join('.')] : [
    'G' + st.g10,
    ['P' + st.plate.id, st.plate.metal, '0'].join('.'),                              // third field — former camera plate decor (removed 15.11.2026), stays in the format as «0»
    ['F' + st.frame.id, st.frame.metal].concat(opts ? [opts] : []).join('.'),
    'I' + st.insert]),
    st.symbol.id === '0' ? 'S0' : ['S' + st.symbol.id, st.symbol.metal, 'd' + num(st.symbol.d), 'x' + num(st.symbol.x), 'y' + num(st.symbol.y)]
      .concat(baseCode(st.symbol.base)).join('.'),
    st.plaque.id === '0' ? 'T0' : ['T' + st.plaque.id, st.plaque.metal, 'F' + st.plaque.font, 'x' + num(st.plaque.x), 'y' + num(st.plaque.y)].concat(st.plaque.w ? ['w' + num(st.plaque.w)] : []).join('.'),
    'K' + (st.pack || '0'),
  ];
  const se = st.side || {}, sl = (se.l || '').trim(), sr = (se.r || '').trim();
  if (sl || sr) parts.push('E' + (sl ? 'L' : '') + (sr ? 'R' : ''));
  if (st.wall && st.wall !== '1') parts.push('W' + st.wall);                     // screen wallpaper; black (1) is the default, not written to the code
  let code = parts.join('-');
  const pt = st.plaque.id !== '0' && st.plaque.text ? b64e(st.plaque.text) : '';
  if (pt || sl || sr) code += '~' + pt;
  if (sl) code += '~l' + b64e(sl);
  if (sr) code += '~r' + b64e(sr);
  return code;
}

// Codes copied from a wrapped PNG/OCR may contain spaces, line breaks and
// typographic dashes. These are presentation characters, never build values.
export function cleanCodeInput(input) {
  let code = input.trim();
  if (/^https?:\/\//i.test(code)) {
    try { code = new URL(code).searchParams.get('code') || code; } catch {}
  }
  // Pasting «with surroundings» (check 22.11.2026): a link without https://, a code in quotes, with the «Build code:» label, or the name
  // of a downloaded file caviar_specification_<code>.png — the code itself is taken
  const q = code.match(/[?&]code=([^&#\s]+)/); if (q) { try { code = decodeURIComponent(q[1]); } catch { code = q[1]; } }
  code = code.replace(/^caviar_(?:specification|design)_/i, '').replace(/\.png$/i, '').replace(/^[^:]{0,24}:\s+(?=[AB])/, '').replace(/^[«»"'“”‘’`\s]+|[«»"'“”‘’`\s]+$/g, '');
  // «Ø», «ø», «⌀» — this is how recognition reads a slashed zero; Cyrillic look-alike letters — to Latin ones (the code has no Cyrillic)
  const TWIN = { 'А': 'A', 'В': 'B', 'С': 'C', 'Е': 'E', 'Н': 'H', 'К': 'K', 'М': 'M', 'О': 'O', 'Р': 'P', 'Т': 'T', 'Х': 'X', 'а': 'a', 'с': 'c', 'е': 'e', 'о': 'o', 'р': 'p', 'х': 'x', 'у': 'y' };
  return code.replace(/[\s\u200b-\u200d\u2060\ufeff]/g, '')
    .replace(/[\u2010-\u2015\u2212\ufe63\uff0d]/g, '-').replace(/[Øø⌀∅]/g, '0').replace(/[АВСЕНКМОРТХасеорху]/g, c => TWIN[c]);
}

// Returns { st, warn, ok }. ok = false — the string is not a build code of this version (empty, garbage, a foreign format version):
// in that case the calling code does NOT replace the current build. Values inside the code are not checked here — normalize() does that.
export function decode(code, defaults) {
  const st = structuredClone(defaults); const warn = [];
  if (typeof code !== 'string' || !code.trim()) return { st, warn: [tr('код сборки пуст')], ok: false };
  code = cleanCodeInput(code);
  if (isShort(code)) { const full = expand(code); if (!full) return { st, warn: [tr('короткая ссылка на сборку повреждена')], ok: false }; code = cleanCodeInput(full); }
  let [main, text, ...tail] = code.trim().split('~');
  const seg = main.split('-');
  const ver = seg.shift();
  if (!/^A\d+$/.test(ver)) return { st, warn: [tr('это не код сборки')], ok: false };
  if (ver !== CODE_VERSION) return { st, warn: [tr`код сборки версии ${ver} этим конструктором не открывается`], ok: false };
  if (!seg.some(s => /^(PM|P)(\.|$)/.test(s))) return { st, warn: [tr('в коде сборки нет модели')], ok: false };
  st.mode = 'full';
  for (const s of seg) {
    const f = s.split('.');
    const head = f[0];
    if (/^(PM|P)$/.test(head)) { st.model = head; if (f[1]) st.color = f[1]; if (f[2]) st.storage = f[2]; continue; }
    const k = head[0], id = head.slice(1);
    const kv = Object.fromEntries(f.slice(1).filter(x => /^[a-zA-Z]/.test(x) && /\d|m/.test(x.slice(1))).map(x => [x[0], x.slice(1)]));
    switch (k) {
      case 'G': st.g10 = id; break;
      case 'P': st.plate.id = id; if (f[1]) st.plate.metal = f[1]; break;
      case 'F': st.frame.id = id; if (f[1]) st.frame.metal = f[1]; st.frame.opts = {};
        for (const o of f.slice(2)) st.frame.opts[o.slice(0, 2)] = o.slice(2); break;
      case 'I': st.insert = id; break;
      case 'S': st.symbol.id = id; if (id !== '0') { if (f[1]) st.symbol.metal = f[1];
        if (kv.d) st.symbol.d = unnum(kv.d); if (kv.x) st.symbol.x = unnum(kv.x); if (kv.y) st.symbol.y = unnum(kv.y);
        const bo = f.find(x => /^b[SE]/.test(x)); st.symbol.base = { f: 'S', m: '0', e: '1' }; if (bo) { if (bo[1] === 'E') { st.symbol.base.f = 'E'; st.symbol.base.e = bo.slice(2); } else st.symbol.base.m = bo.slice(2); } } break;
      case 'T': st.plaque.id = id; if (id !== '0') { if (f[1]) st.plaque.metal = f[1]; const fo = f.find(x => /^F\d/.test(x)); if (fo) st.plaque.font = fo.slice(1);
        if (kv.x) st.plaque.x = unnum(kv.x); if (kv.y) st.plaque.y = unnum(kv.y); st.plaque.w = kv.w ? unnum(kv.w) : undefined; } break;
      case 'K': st.pack = id; break;
      case 'L': st.mode = 'light'; st.light = { ...(st.light || {}), mat: id === 'C' ? 'C' : 'M' };
        if (id === 'C') { if (f[1]) st.light.carbon = f[1]; }
        else { if (f[1]) st.light.metal = f[1]; for (const x of f.slice(2)) { const v = x.slice(1); if (x[0] === 's') st.light.satin = v; if (x[0] === 't') st.light.tex = v; if (x[0] === 'z') st.light.laser = v; if (x[0] === 'c') st.light.lc = v; if (x[0] === 'e') st.light.ec = v; } }
        break;
      case 'W': st.wall = id; break;
      case 'E': break;                                                           // engraving texts are in the tail of the code
      default: warn.push(tr('часть кода сборки не распознана и пропущена'));
    }
  }
  if (text) { const t = readText(text); if (t === null) warn.push(tr('текст таблички в коде не читается — проверьте знаки кода (0 и O, 1 и l) или впишите текст заново')); else st.plaque.text = t; }
  st.side = { l: '', r: '' }; for (const x of tail) if (x[0] === 'l' || x[0] === 'r') { const t = readText(x.slice(1)); if (t === null) warn.push(tr('текст гравировки в коде не читается — проверьте знаки кода (0 и O, 1 и l) или впишите текст заново')); else st.side[x[0]] = t; }
  return { st, warn: [...new Set(warn)], ok: true };
}

// Short link to a build (owner's change 19.11.2026 «hash the link so that the line is not so long»).
// The site is static — there is nowhere to store builds, so this is not a hash but a packing of the same code: each field of the readable code is 1–2 bytes
// (frequent values — via dictionaries, «letter + number» — prefix index and the number), texts — their UTF-8 bytes; the result is base64url with the letter B.
// Lossless: expand(shrink(c)) === c for any code (checked by tools/test_codes.mjs). Dictionaries are ONLY appended to at the end:
// the order is part of the format, otherwise old short links would open as the wrong build.
const MT = ['GD', 'GP', 'TN', 'TB', 'RG', 'SV'];
const WHOLE = ['A1', 'PM', 'P', 'BK', 'SL', 'GL', 'BG', '256', '512', '1T', '2T', ...MT, '0', 'LM', 'LC', 'E', 'EL', 'ER', 'ELR', 'x0', 'y0',
  ...MT.map(m => 'bS' + m), ...MT.map(m => 'SM' + m), ...MT.flatMap(m => ['S', 'D', 'F'].map(k => 'WPM' + m + k)), 'cG', 'cS', 'cB', 'GR',
  'T0', 'K0', 'K1', 'K2', 'K3', 'S0', 'G1', 'G2', 'G3', 's0', 's1', 't0', 'z0', 'e0', 'e6', 'F1', 'F2', 'F3', 'W2', 'bE1', 'ym52', 'ym40', 'y80'];
const PREFIX = ['G', 'P', 'F', 'I', 'S', 'T', 'K', 'W', 'd', 'x', 'xm', 'y', 'ym', 'w', 'wm', 'bE', 'BP', 'EC', 's', 't', 'z', 'e', 'c', 'A'];
const P0 = 96, LIT = 127, TAIL = 126;                     // field byte: bit 7 — «.» precedes the field, bits 0–6 — dictionary / prefix / literal
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const toB64 = bytes => { let s = ''; for (let i = 0; i < bytes.length; i += 3) { const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
  s += B64[n >> 18 & 63] + B64[n >> 12 & 63] + (i + 1 < bytes.length ? B64[n >> 6 & 63] : '') + (i + 2 < bytes.length ? B64[n & 63] : ''); } return s; };
const fromB64 = s => { if (/[^A-Za-z0-9_-]/.test(s) || s.length % 4 === 1) return null; const out = [];
  for (let i = 0; i < s.length; i += 4) { const c = [0, 1, 2, 3].map(k => B64.indexOf(s[i + k] ?? 'A')); const n = c[0] << 18 | c[1] << 12 | c[2] << 6 | c[3];
    out.push(n >> 16 & 255); if (i + 2 < s.length) out.push(n >> 8 & 255); if (i + 3 < s.length) out.push(n & 255); } return out; };
const utf8 = t => [...new TextEncoder().encode(t)], unutf8 = b => new TextDecoder().decode(new Uint8Array(b));
const putV = (o, n) => { do { let b = n & 127; n = Math.floor(n / 128); if (n) b |= 128; o.push(b); } while (n); };
export const isShort = s => typeof s === 'string' && /^B[A-Za-z0-9_-]+$/.test(s);
export function shrink(code) {
  const o = [], [main, ...tail] = code.split('~');
  main.split(/(?=[-.])/).forEach((tok, i) => {
    const sep = i ? tok[0] : '', f = i ? tok.slice(1) : tok, dot = sep === '.' ? 128 : 0;
    const w = WHOLE.indexOf(f), m = f.match(/^(.*?)(0|[1-9]\d{0,8})$/), p = m ? PREFIX.indexOf(m[1]) : -1;
    if (w >= 0) o.push(dot | w);
    else if (p >= 0) { o.push(dot | (P0 + p)); putV(o, +m[2]); }
    else { const b = utf8(f); o.push(dot | LIT); putV(o, b.length); o.push(...b); }
  });
  if (tail.length) { o.push(TAIL); putV(o, tail.length);
    tail.forEach((t, i) => { const pre = i && /^[lr]/.test(t) ? t[0] : '', body = t.slice(pre.length), raw = fromB64(body);
      const canon = raw && toB64(raw) === body, bytes = canon ? raw : utf8(body);
      o.push((pre === 'l' ? 1 : pre === 'r' ? 2 : 0) | (canon ? 0 : 4)); putV(o, bytes.length); o.push(...bytes); }); }
  return 'B' + toB64(o);
}
export function expand(short) {
  try {
    const b = fromB64(short.slice(1)); if (!b || !b.length) return null; let i = 0;
    const getV = () => { let n = 0, k = 1, x; do { if (i >= b.length) throw 0; x = b[i++]; n += (x & 127) * k; k *= 128; } while (x & 128); return n; };
    let s = '', first = true;
    while (i < b.length && b[i] !== TAIL) {
      const x = b[i++], c = x & 127; if (!first) s += x & 128 ? '.' : '-'; first = false;
      if (c < WHOLE.length) s += WHOLE[c];
      else if (c >= P0 && c < P0 + PREFIX.length) s += PREFIX[c - P0] + getV();
      else if (c === LIT) { const n = getV(); s += unutf8(b.slice(i, i + n)); i += n; }
      else return null;
    }
    if (i < b.length) { i++; const n = getV();
      for (let k = 0; k < n; k++) { const t = b[i++], len = getV(), bytes = b.slice(i, i + len); i += len;
        s += '~' + (t & 1 ? 'l' : t & 2 ? 'r' : '') + (t & 4 ? unutf8(bytes) : toB64(bytes)); } }
    return i === b.length ? s : null;
  } catch { return null; }
}

// Never put a truncated build code in the filename: it would reopen with
// default values for the missing options. Long personalised builds use a
// neutral filename; the image itself always carries the complete code.
export function exportImageName(code, design = false) {
  const prefix = design ? 'caviar_design' : 'caviar_specification';
  const compact = shrink(code);
  return `${prefix}${compact.length <= 180 ? '_' + compact : ''}.png`;
}

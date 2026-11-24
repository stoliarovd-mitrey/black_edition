import english from './translations.en.js';
import chinese from './translations.zh.js';

// The page language comes from <html lang>: Russian is the source copy, /en/ and /zh/ are generated entry points.
const pageLang = typeof document !== 'undefined' ? document.documentElement.lang : 'ru';
export const LANG = pageLang === 'en' ? 'en' : /^zh\b/.test(pageLang) ? 'zh' : 'ru';
export const INTL = LANG !== 'ru';   // international versions share the catalogue, contacts and number format
export const LOCALE = { ru: 'ru-RU', en: 'en-GB', zh: 'zh-Hant-TW' }[LANG];
// Per-language settings: dictionary (Russian phrase → translation), <html lang>, folder of the entry point, quotation marks,
// loading-screen words and page title.
const LANGS = {
  en: { dict: english, html: 'en', dir: 'en', quotes: ['“', '”'], loading: ['LOADING', 'CONFIGURATOR'], title: 'iPhone 18 Pro Configurator' },
  zh: { dict: chinese, html: 'zh-Hant', dir: 'zh', quotes: ['「', '」'], cjk: true, loading: ['載入中'], title: 'iPhone 18 Pro 訂製器' },
};
export const LANGUAGES = Object.keys(LANGS);
const escapePattern = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Dictionary phrases are matched as whole words. The left boundary is checked by hand, without lookbehind: Safari before 16.4
// does not support it and the whole configurator, the Russian version included, would not start. The expression is built on
// the first translation — never in the Russian version.
const CYR = /[А-Яа-яЁё]/, phrases = {};
export const translate = (text, lang = LANG) => {
  const s = String(text), L = LANGS[lang]; if (!L || !/[А-Яа-яЁё«»]/.test(s)) return s;
  const re = phrases[lang] ||= new RegExp('(?:' + Object.keys(L.dict).sort((a, b) => b.length - a.length).map(escapePattern).join('|') + ')(?![А-Яа-яЁё])', 'g');
  let out = '', last = 0, m; re.lastIndex = 0;
  while ((m = re.exec(s))) { const at = m.index;
    if (at > 0 && CYR.test(s[at - 1])) { re.lastIndex = at + 1; continue; }   // the match starts inside a word — not a phrase
    out += s.slice(last, at) + L.dict[m[0]]; last = at + m[0].length; }
  out += s.slice(last);
  if (!out.includes('« »')) out = out.replace(/«/g, L.quotes[0]).replace(/»/g, L.quotes[1]);   // local quotation marks; the hint that lists the allowed characters stays as is
  if (L.cjk) out = out.replace(/([\u2e80-\u9fff\uff00-\uffef」）]) ?([,;:]) /g, (_, c, p) => c + { ',': '，', ';': '；', ':': '：' }[p])   // full-width punctuation between Chinese fragments
    .replace(/([\u2e80-\u9fff」）])\.(?=\s|<|$)/g, '$1。').replace(/([：，。；]) +(?=[\u2e80-\u9fff「])/g, '$1');
  return out;
};
export const translateEnglish = text => translate(text, 'en');

// Translate authored copy only. Tagged-template values (including customer engraving)
// pass through unchanged; Russian is an exact no-op.
export function tr(text, ...values) {
  return Array.isArray(text) ? text.reduce((out, part, i) => out + translate(part) + (i < values.length ? values[i] : ''), '') : translate(text);
}

export const INTERNATIONAL_MANAGER = Object.freeze({
  name: 'Vera Fox', phone: '+971 56 173 4747', email: 'caviar@caviar.global',
  telegram: '@CaviarGlobal', whatsapp: '971561734747', site: 'caviar.global',
});
// International catalogue (English and Chinese): translated copy, international manager, no restricted symbols.
export function localizeCatalog(source, lang = LANG) {
  if (!LANGS[lang]) return source;
  const blocked = new Set(source.symbols.filter(s => s.group === 'heraldry' || ['20', '21'].includes(s.id)).map(s => s.id));
  const copy = value => Array.isArray(value) ? value.map(copy) : value && typeof value === 'object'
    ? Object.fromEntries(Object.entries(value).filter(([key]) => !key.startsWith('_')).map(([key, v]) => [key, copy(v)]))
    : typeof value === 'string'
      ? (value.startsWith('assets/') ? 'https://teatromisterio.github.io/Test-Constructor-iPhone-18-Pro/' + value : translate(value, lang)) : value;
  const cat = copy(source);
  cat.manager = { ...INTERNATIONAL_MANAGER };
  for (const colour of cat.colors) colour.name = colour.name.replace(/^(.+) \(\1\)$/, '$1');
  cat.symbols = cat.symbols.filter(s => !blocked.has(s.id));
  cat.symbol_groups = cat.symbol_groups.filter(g => g.id !== 'heraldry');
  // The "Russia" wallpaper (id 7) is Russian-only (owner's change 22.11.2026); a build with it opens with the first wallpaper
  cat.wallpapers = cat.wallpapers.filter(w => w.id !== '7');
  // Examples must obey the same catalogue as manual selection and imported codes.
  cat.ready = (cat.ready || []).filter(design => !blocked.has(design.code.match(/-S([^.\-]+)/)?.[1]));
  return cat;
}

// Entry point of a translated version, generated from index.html: <lang folder>/index.html with <base href="../">.
export function localizedDocument(html, lang) {
  const L = LANGS[lang];
  const spinner = L.loading.map(word => '<span class="w">' + [...word].map((ch, i) => `<i style="animation-delay:${(i * .12).toFixed(2)}s">${ch}</i>`).join('') + '</span>').join('');
  return translate(html.replace(/(<div id="bootSpin"[^>]*>)[\s\S]*?(<\/div>)/, '$1' + spinner + '$2'), lang)
    .replace('<html lang="ru">', `<html lang="${L.html}">`)
    .replace('<head>', '<head>\n<base href="../">')
    .replace('nunito-sans-cyrillic-wght-normal.woff2" as="font"', 'nunito-sans-latin-wght-normal.woff2" as="font"')   // preload the Latin subset of the interface font
    .replace(/<title>[^<]*<\/title>/, `<title>${L.title}</title>`);
}
export const englishDocument = html => localizedDocument(html, 'en');

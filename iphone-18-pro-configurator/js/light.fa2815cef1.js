// Light customisation (11.11.2026): test procedural textures of the back panel — until the final assets are ready.
// Carbon (forged, with gold leaf), satin («brush» normal map), texture (milling: normal map from the relief),
// laser engraving (pattern mask). Everything is drawn on a canvas at the real panel scale (PX pixels per mm).
export const PX = 12;

// deterministic noise — the same pattern on every build
function rng(seed) { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
const smooth1d = (n, k, r) => { const a = Array.from({ length: n }, r), b = new Float32Array(n);
  for (let i = 0; i < n; i++) { let s = 0, c = 0; for (let j = -k; j <= k; j++) { s += a[(i + j + n) % n]; c++; } b[i] = s / c; } return b; };

// height → normal map (OpenGL convention: green points up the image)
export function heightToNormal(H, w, h, strength) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'), im = g.createImageData(w, h), d = im.data;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const xl = H[y * w + Math.max(0, x - 1)], xr = H[y * w + Math.min(w - 1, x + 1)], yu = H[Math.max(0, y - 1) * w + x], yd = H[Math.min(h - 1, y + 1) * w + x];
    let nx = (xl - xr) * strength, ny = (yd - yu) * strength, nz = 1; const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
    const i = (y * w + x) * 4; d[i] = (nx * 0.5 + 0.5) * 255; d[i + 1] = (ny * 0.5 + 0.5) * 255; d[i + 2] = (nz * 0.5 + 0.5) * 255; d[i + 3] = 255; }
  g.putImageData(im, 0, 0); return c;
}

// satin: «brush» — fine strokes along the finishing direction
export function satinHeight(kind, wmm, hmm) {
  const w = Math.round(wmm * PX), h = Math.round(hmm * PX), H = new Float32Array(w * h), r = rng(7);
  const n1 = smooth1d(4096, 1, r), n2 = smooth1d(4096, 6, r), cx = w / 2, cy = h / 2, sx = w / 2, sy = h * 1.05;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let t;
    if (kind === 'vertical') t = x * 3.1;
    else if (kind === 'horizontal') t = y * 3.1;
    else if (kind === 'circular') t = Math.hypot(x - cx, y - cy) * 3.1;
    else t = (Math.atan2(y - sy, x - sx) + Math.PI) * 4096 / Math.PI;          // sunburst — from the centre of the bottom edge
    const i = Math.floor(t) & 4095; H[y * w + x] = n1[i] * 0.85 + n2[i] * 0.15 + (r() - 0.5) * 0.05; }
  return { H, w, h };
}

// texture: milled relief (0 — groove bottom, 1 — top), real pitch in mm
export function textureHeight(kind, wmm, hmm) {
  const w = Math.round(wmm * PX), h = Math.round(hmm * PX), H = new Float32Array(w * h);
  const tri = v => 1 - Math.abs(((v % 1) + 1) % 1 * 2 - 1);                       // triangle wave 0…1…0
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const X = x / PX, Y = y / PX; let v;
    if (kind === 'rays') { const a = Math.atan2(hmm + 8 - Y, X - wmm / 2); v = Math.min(1, tri(a * 48 / Math.PI) * 1.6); }
    else if (kind === 'weave') { const s = 6, i = Math.floor(X / s), j = Math.floor(Y / s), u = (X % s) / s, q = (Y % s) / s;
      const horiz = (i + j) % 2 === 0, k = horiz ? q : u; v = 0.5 + 0.5 * Math.cos((k * 3 % 1) * 2 * Math.PI) * 0.8 - (Math.min(u, 1 - u, q, 1 - q) < 0.04 ? 0.6 : 0); }
    else if (kind === 'waves') v = 0.5 + 0.5 * Math.sin(2 * Math.PI * (Y + 2.2 * Math.sin(2 * Math.PI * X / 18)) / 3.2);
    else { const s = 4.2; v = Math.min(tri((X + Y) / s), tri((X - Y) / s)) * 1.2; }  // diamond grid: V-grooves along both diagonals
    H[y * w + x] = Math.max(0, Math.min(1, v)); }
  return { H, w, h };
}

// laser engraving: white pattern on transparent (mask)
export function laserCanvas(kind, wmm, hmm) {
  const w = Math.round(wmm * PX), h = Math.round(hmm * PX), c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); g.strokeStyle = '#fff'; g.lineWidth = 0.16 * PX; g.lineCap = 'round';
  const L = (x0, y0, x1, y1) => { g.beginPath(); g.moveTo(x0 * PX, y0 * PX); g.lineTo(x1 * PX, y1 * PX); g.stroke(); };
  const C = (x, y, r, a0 = 0, a1 = Math.PI * 2) => { g.beginPath(); g.arc(x * PX, y * PX, r * PX, a0, a1); g.stroke(); };
  if (kind === 'lines') for (let s = -hmm; s < wmm + hmm; s += 1.4) L(s, 0, s + hmm, hmm);
  else if (kind === 'hex') { const r = 4, dx = r * Math.sqrt(3), dy = r * 1.5;
    for (let j = -1; j * dy < hmm + r; j++) for (let i = -1; i * dx < wmm + r; i++) { const cx = i * dx + (j % 2 ? dx / 2 : 0), cy = j * dy;
      g.beginPath(); for (let k = 0; k <= 6; k++) { const a = Math.PI / 6 + k * Math.PI / 3; g.lineTo((cx + r * Math.cos(a)) * PX, (cy + r * Math.sin(a)) * PX); } g.stroke();
      C(cx, cy, r * 0.42); } }
  else { const s = 7;                                                             // ornament: «flower of life» — intersecting circles
    for (let j = -1; j * s * 0.866 < hmm + s; j++) for (let i = -1; i * s < wmm + s; i++) { const cx = i * s + (j % 2 ? s / 2 : 0), cy = j * s * 0.866; C(cx, cy, s / 2); C(cx, cy, s * 0.16); } }
  return c;
}

// forged carbon: chaotic fibre «flakes»; gold leaf — golden flecks
export function carbonCanvas(def, mm = 40) {
  const n = Math.round(mm * 20), c = document.createElement('canvas'); c.width = c.height = n; const g = c.getContext('2d'), r = rng(31);
  g.fillStyle = def.hex; g.fillRect(0, 0, n, n);
  const blob = (col, alpha, size) => { const x = r() * n, y = r() * n, s = size * (0.4 + r()), k = 3 + Math.floor(r() * 4), a0 = r() * 6.3;
    g.globalAlpha = alpha; g.fillStyle = col; g.beginPath();
    for (let i = 0; i < k; i++) { const a = a0 + i * 6.283 / k, rr = s * (0.5 + r() * 0.8); g.lineTo(x + Math.cos(a) * rr * 1.8, y + Math.sin(a) * rr * 0.7); }
    g.fill(); };
  for (let i = 0; i < 1400; i++) blob(r() < 0.5 ? def.flake : def.hex, 0.25 + r() * 0.5, 0.12 * n * (0.3 + r() * 0.7) / 3);
  if (def.leaf) for (let i = 0; i < 160; i++) blob(def.leaf, 0.75 + r() * 0.25, 0.02 * n * (0.3 + r()));
  g.globalAlpha = 1; return c;
}

// radial satin (11.11.2026): strokes radiate from the centre of the circle — for the disc in the frame ring and for the symbol base.
// Normal map for an n × n square, the inscribed circle = the part (UV of the cylinder cap — planar projection)
export function radialSatinNormal(n = 1024) {
  const H = new Float32Array(n * n), r = rng(11), n1 = smooth1d(8192, 1, r), n2 = smooth1d(8192, 8, r), c = n / 2;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const a = Math.atan2(y - c, x - c), i = Math.floor((a + Math.PI) / (2 * Math.PI) * 8192) & 8191;
    H[y * n + x] = n1[i] * 0.8 + n2[i] * 0.2 + (r() - 0.5) * 0.015; }
  return heightToNormal(H, n, n, 0.75);
}

// classic sports carbon (11.11.2026): 2 × 2 twill — tows w mm wide, colour and height (for the normal map), tile of size mm
export function twillCanvas(size = 12.8, w = 1.6, px = 40) {
  const n = Math.round(size * px), c = document.createElement('canvas'); c.width = c.height = n; const g = c.getContext('2d');
  const H = new Float32Array(n * n), im = g.createImageData(n, n), d = im.data, k = Math.round(size / w), r = rng(5);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const i = Math.floor(x / (w * px)), j = Math.floor(y / (w * px));
    const warp = ((i + j) % 4) < 2;                                          // twill: two tows over, two under, shifted by one
    const u = (x / (w * px)) % 1, v = (y / (w * px)) % 1, t = warp ? v : u, bulge = Math.sin(Math.PI * (warp ? u : v));
    const fib = 0.5 + 0.5 * Math.sin((warp ? x : y) * 2.2 + r() * 0.3);       // fibres along the tow
    const lum = (warp ? 34 : 22) + 18 * bulge * (0.7 + 0.3 * fib);
    const p = (y * n + x) * 4; d[p] = d[p + 1] = d[p + 2] = lum; d[p + 3] = 255; H[y * n + x] = 0.4 + 0.6 * bulge - (Math.min(t, 1 - t) < 0.04 ? 0.3 : 0); }
  g.putImageData(im, 0, 0); return { color: c, normal: heightToNormal(H, n, n, 3) };
}

// contour fluting (11.11.2026): window mask (white) → distance to the edge (3-4 chamfer) → grooves parallel to the contour, spacing of pitch mm
export function contourFlutes(mask, pxmm, pitch = 0.8) {
  const w = mask.width, h = mask.height, m = mask.getContext('2d').getImageData(0, 0, w, h).data, D = new Float32Array(w * h), BIG = 1e9;
  for (let i = 0; i < w * h; i++) D[i] = m[i * 4] > 127 ? BIG : 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * w + x; if (!D[i]) continue; let v = D[i];
    if (x > 0) v = Math.min(v, D[i - 1] + 3); if (y > 0) { v = Math.min(v, D[i - w] + 3); if (x > 0) v = Math.min(v, D[i - w - 1] + 4); if (x < w - 1) v = Math.min(v, D[i - w + 1] + 4); } D[i] = v; }
  for (let y = h - 1; y >= 0; y--) for (let x = w - 1; x >= 0; x--) { const i = y * w + x; if (!D[i]) continue; let v = D[i];
    if (x < w - 1) v = Math.min(v, D[i + 1] + 3); if (y < h - 1) { v = Math.min(v, D[i + w] + 3); if (x < w - 1) v = Math.min(v, D[i + w + 1] + 4); if (x > 0) v = Math.min(v, D[i + w - 1] + 4); } D[i] = v; }
  const H = new Float32Array(w * h); for (let i = 0; i < w * h; i++) { const mm = D[i] / 3 / pxmm; H[i] = D[i] ? 0.5 + 0.5 * Math.cos(2 * Math.PI * mm / pitch) : 0.5; }
  return heightToNormal(H, w, h, 4);
}

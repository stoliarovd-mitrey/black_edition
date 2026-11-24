import { tr } from './i18n.js';
// 3D scene of the grey prototype: assembled from primitives at real size (mm = scene unit).
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { studioEnvironment } from './studio.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { frameWindow, frameOf, plaqueOf } from './rules.js';
import { fontMm, fontCss } from './engrave.js';

// Nameplate text (owner's change 12.11.2026): the font size is fitted to the width and height of the field (text_box, mm). If on one line the font size
// is below the minimum (catalog.plaque_font_min_mm), the text wraps by words onto 2, then 3 lines — only if with wrapping
// the font size is not below the minimum (the nameplate height allows it). Otherwise — the variant with the largest font size. Lines are centred, line spacing is 1.1 of the font size.
export const PLAQUE_LH = 1.1;
let plaqueCtx;
export function plaqueLayout(text, css, tw, th, minMm) {
  plaqueCtx ??= document.createElement('canvas').getContext('2d'); const g = plaqueCtx; g.font = `100px ${css}`;
  const w = s => g.measureText(s).width / 100;                                   // line width in font-size units
  // two lines from two input fields (fix 7 from the board 15.11.2026): the lines are set by the owner — no wrapping, shared font size, fitted to the longest
  if (text.includes('\n')) { const ls = text.split('\n').map(x => x.trim()).filter(Boolean);
    if (ls.length > 1) { const n = ls.length, fsW = tw * 0.86 / Math.max(...ls.map(w)), fsH = th * 0.86 / (1 + (n - 1) * PLAQUE_LH);
      return { lines: ls, fs: Math.min(fsW, fsH), n }; }
    text = ls[0] || ''; }
  const words = text.trim().split(/\s+/).filter(Boolean); if (!words.length) return { lines: [text], fs: th * 0.62, n: 1 };
  const split = n => {                                                           // split into n lines by words with the smallest longest line
    if (n === 1) return [words.join(' ')]; let best = null;
    const rec = (i, left, acc) => { if (left === 1) { const ls = [...acc, words.slice(i).join(' ')]; const m = Math.max(...ls.map(w));
        if (!best || m < best.m) best = { m, ls }; return; }
      for (let j = i + 1; j <= words.length - left + 1; j++) rec(j, left - 1, [...acc, words.slice(i, j).join(' ')]); };
    rec(0, n, []); return best.ls; };
  const opts = [];
  for (let n = 1; n <= Math.min(3, words.length); n++) {
    const ls = split(n), fsW = tw * 0.86 / Math.max(...ls.map(w));
    const fsH = n === 1 ? th * 0.62 : th * 0.86 / (1 + (n - 1) * PLAQUE_LH);
    opts.push({ lines: ls, fs: Math.min(fsW, fsH), n });
  }
  return opts.find(o => o.fs >= minMm) || opts.reduce((a, b) => (b.fs > a.fs ? b : a));
}
import { PX as LPX, heightToNormal, satinHeight, textureHeight, laserCanvas, radialSatinNormal, contourFlutes } from './light.js';
// AVIF: the insert material maps exist only as .avif (read by all browsers since 2023–2024: Chrome 85, Firefox 93, Safari 16.4,
// Edge 121). The source .jpg files were removed from the repository on 21.11.2026 (cleanup of unused files) — the catalog names the maps directly as .avif
// lightweight maps (audit, stage 4, T3): on phones and weak devices — half-size insert material maps from the lite/ folder
// (tools/lite_materials.sh): four leather maps ≈ 0.7 MB instead of ≈ 3 MB
let LITE = false;
// leather and carbon of the inserts (folders leather_*, carbon_*; before 21.11.2026 — test_*) — also with lightweight copies: lite/<folder>/<file>
const texUrl = u => { if (LITE) u = u.replace(/\/inserts\/materials\/((?:SK-[^/]*|(?:leather|carbon)_[^/]*\/[^/]*)\.avif)$/, '/inserts/materials/lite/$1');
  return u; };

// Parallax occlusion (POM) for the insert (owner's change 08.11.2026: "the leather looks flat"): grooves and wrinkles "sink" into the depth
// when the camera tilts. Flat surface, height from a map (1 — peak, 0 — bottom), depth in mm (1 scene unit = 1 mm).
// The tangent-space frame comes from the derivatives of position and UV (as for normalMap without tangents), so it works the same
// for GLB (flipY = false) and for the extruded shape (flipY = true, texture repeat/offset).
// disc with a polar UV layout (11.11.2026): u — around the circumference (one texture repeat per turn), v — along the radius in mm / 71.7, as on
// the "Ring" bezel. The strokes of the bezel satin maps run along v — on the disc they lie as rays from the centre. Group 0 — face, 1 — side
function polarDisc(R, z0, z1, segA = 256, segR = 24) {
  const pos = [], uv = [], nor = [], idx = [], g = new THREE.BufferGeometry();
  for (let i = 0; i <= segR; i++) for (let j = 0; j <= segA; j++) { const r = R * i / segR, a = 2 * Math.PI * j / segA;
    pos.push(r * Math.cos(a), r * Math.sin(a), z1); uv.push(j / segA, r / 71.7); nor.push(0, 0, 1); }
  for (let i = 0; i < segR; i++) for (let j = 0; j < segA; j++) { const a = i * (segA + 1) + j, b = a + segA + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
  const nTop = idx.length, base = pos.length / 3;
  for (let k = 0; k <= 1; k++) for (let j = 0; j <= segA; j++) { const a = 2 * Math.PI * j / segA; pos.push(R * Math.cos(a), R * Math.sin(a), k ? z1 : z0); uv.push(j / segA, k * (z1 - z0) / 71.7); nor.push(Math.cos(a), Math.sin(a), 0); }
  for (let j = 0; j < segA; j++) { const a = base + j, b = base + segA + 1 + j; idx.push(a, a + 1, b, a + 1, b + 1, b); }
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setIndex(idx); g.addGroup(0, nTop, 0); g.addGroup(nTop, idx.length - nTop, 1); return g;
}

function addParallax(mat, hmap, depth) {
  mat.userData.pomMap = hmap;
  mat.onBeforeCompile = sh => {
    sh.uniforms.pomMap = { value: hmap }; sh.uniforms.pomDepth = { value: depth };
    sh.fragmentShader = sh.fragmentShader.replace('#include <map_pars_fragment>', tr`#include <map_pars_fragment>
uniform sampler2D pomMap; uniform float pomDepth;
vec2 pomUV(vec2 uv0, vec3 pos) {
  vec3 dp1 = dFdx(pos), dp2 = dFdy(pos); vec2 d1 = dFdx(uv0), d2 = dFdy(uv0);
  vec3 N = normalize(cross(dp1, dp2)); vec3 V = normalize(-pos); if (dot(N, V) < 0.0) N = -N;
  float D = dot(cross(dp1, dp2), N); if (abs(D) < 1e-12) return uv0;
  vec3 gu = (cross(dp2, N) * d1.x + cross(N, dp1) * d2.x) / D, gv = (cross(dp2, N) * d1.y + cross(N, dp1) * d2.y) / D;
  float vn = max(dot(V, N), 0.15); vec3 P = -(V - N * dot(V, N)) / vn * pomDepth;   // сдвиг по плоскости на полную глубину, мм
  vec2 dUV = vec2(dot(gu, P), dot(gv, P));
  const int STEPS = 24; float stp = 1.0 / float(STEPS), cur = 0.0; vec2 uv = uv0;
  float h = 1.0 - texture2D(pomMap, uv).r, prevH = h, prevCur = 0.0;
  for (int i = 0; i < STEPS; i++) { if (cur >= h) break; prevCur = cur; prevH = h; cur += stp; uv = uv0 + dUV * cur; h = 1.0 - texture2D(pomMap, uv).r; }
  float a = h - cur, b = prevH - prevCur; float t = clamp(a / (a - b + 1e-6), 0.0, 1.0);
  return uv0 + dUV * mix(cur, prevCur, t);
}`).replace('#include <map_fragment>', `vec2 pomUv = pomUV(vMapUv, -vViewPosition);
` + THREE.ShaderChunk.map_fragment.replace(/vMapUv/g, 'pomUv'))
      .replace('#include <normal_fragment_maps>', THREE.ShaderChunk.normal_fragment_maps.replace(/vNormalMapUv/g, 'pomUv'));
  };
  mat.customProgramCacheKey = () => 'pom';
}

// new meshes (assets load asynchronously): shadows and the studio for non-metals — once per object and material
const studioize = envSoft => o => {
  if (!o.isMesh || o.userData.studio) return; o.userData.studio = true; o.castShadow = o.receiveShadow = true;
  // MeshBasic (the wallpaper on the screen) — left untouched: its envMap multiplies the image by the studio, and in front of the screen the studio is dark → black screen
  // (owner's change 15.11.2026 "the black wallpaper is not displayed": a wallpaper assigned before the first frame was getting an envMap)
  for (const m of [].concat(o.material)) if (m && !m.isMeshBasicMaterial && !m.envMap && (m.metalness ?? 0) < 0.5) { m.envMap = envSoft; m.needsUpdate = true; }
};

// shared resources (audit, stage 3, T1): assets from the cache and maps from the caches are not released when a part is rebuilt
const keep = t => { for (const x of [].concat(t)) if (x && x.userData) x.userData.shared = true; return t; };
function markShared(root) { root.traverse(o => { if (!o.isMesh) return; o.geometry.userData.shared = true;
  for (const m of [].concat(o.material)) { if (!m) continue; m.userData.shared = true; for (const v of Object.values(m)) if (v && v.isTexture) v.userData.shared = true; } }); }

export class PhoneScene {
  constructor(canvas, cat) {
    this.cat = cat;
    // preserveDrawingBuffer removed (audit, stage 3, T2): the snapshot for the specification is drawn into a separate target (snapshot), a copy of the frame is not needed
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    // quality levels (T2): pixel density and shadow map size. The starting level — by device (memory, number of cores, phone),
    // then — by measurement: if frames during motion take longer than 34 ms, the pixel density drops one step (it does not go back up)
    const weak = (navigator.deviceMemory && navigator.deviceMemory <= 4) || (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4);
    const phone = matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 700;
    this.PR_STEPS = [2, 1.5, 1.25, 1].filter(v => v <= Math.max(1, devicePixelRatio));
    if (!this.PR_STEPS.length || this.PR_STEPS[this.PR_STEPS.length - 1] > devicePixelRatio) this.PR_STEPS.push(Math.max(1, devicePixelRatio));
    this.quality = weak ? Math.min(2, this.PR_STEPS.length - 1) : phone ? Math.min(1, this.PR_STEPS.length - 1) : 0;
    this.SHADOW = weak || phone ? 1024 : 2048; LITE = !!(weak || phone);
    this.renderer.setPixelRatio(this.PR_STEPS[this.quality]);
    // studio: AgX tone as in Blender renders, background — a CSS gradient behind the transparent canvas (#viewport), reflections — studio.js
    this.renderer.toneMapping = THREE.AgXToneMapping; this.renderer.toneMappingExposure = 1.15;
    this.scene = new THREE.Scene(); this.scene.background = null;
    // two studios (owner's change 08.11.2026 "flat from the front, the gold isn't gold"): metals reflect the studio with a frontal
    // screen behind the camera (studio.js), non-metals (leather, G10, glass and camera optics) — the previous one, without the screen: their look does not change
    this.envMetal = studioEnvironment(this.renderer); this.envSoft = studioEnvironment(this.renderer, { front: { hi: 0 } });
    this.scene.environment = this.envMetal;
    const key = new THREE.DirectionalLight('#ffffff', 0.7); key.position.set(-60, 120, 200); this.scene.add(key);   // for non-metals only (G10, leather)
    this.scene.add(new THREE.HemisphereLight('#ffffff', '#202024', 0.35));
    // raking light (owner's change 08.11.2026: the leather is "flat"): low angle to the back, from the upper left — emphasises the wrinkles and grain
    // of the insert. Metals are lit mainly by the studio environment; on them this light gives only a narrow highlight
    const rake = new THREE.DirectionalLight('#fff4e8', 0.8); rake.position.set(-220, 140, 70); this.scene.add(rake);
    // shadows from the raking light: the frame onto the recessed insert, the camera plate and the plate onto the frame — layer depth in the front view.
    // A 2048 map over a ±110 mm field — ≈ 0.1 mm per texel
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    rake.castShadow = true; rake.shadow.mapSize.set(this.SHADOW, this.SHADOW); Object.assign(rake.shadow.camera, { left: -110, right: 110, top: 110, bottom: -110, near: 50, far: 600 });
    rake.shadow.bias = -0.0004; rake.shadow.normalBias = 0.04; rake.shadow.radius = 2;
    this.camera = new THREE.PerspectiveCamera(30, 1, 1, 3000); this.camera.position.set(0, 0, 420);
    this.controls = new OrbitControls(this.camera, canvas);
    Object.assign(this.controls, { enableDamping: true, dampingFactor: 0.08, minDistance: 60, maxDistance: 1100, enablePan: true });
    this.controls.addEventListener('start', () => { this.userMoved = true; });   // the user rotated the model themselves — the view is no longer re-fitted to the window (E6)
    this.inset = 0; this.insetCur = 0; this.lastView = null;
    this.root = new THREE.Group(); this.scene.add(this.root);
    // panel cut uniforms (see baseGlass) — created before the first frame: the body shaders are compiled as early as the start screen,
    // and a program compiled without these uniforms never receives them — the body then covered the grooves of the light customisation panel (23.11.2026)
    this.cutU = { uCutOn: { value: 0 }, uCutBox: { value: new THREE.Vector4() }, uCutR: { value: new THREE.Vector2() }, uCutZ: { value: new THREE.Vector2(-0.8, 0.06) }, uCutRootInv: { value: new THREE.Matrix4() } };
    // base device: real iPhone model (https://teatromisterio.github.io/Test-Constructor-iPhone-18-Pro/assets/base/*.glb), colours — data/body_colors.json
    this.base = new THREE.Group(); this.scene.add(this.base); this.baseCache = {}; this.baseKey = null;
    const draco = new DRACOLoader().setDecoderPath(new URL('https://teatromisterio.github.io/Test-Constructor-iPhone-18-Pro/vendor/three/addons/libs/draco/gltf/', import.meta.url).href);
    this.loader = new GLTFLoader().setDRACOLoader(draco);
    // assets from the cache are shared by all builds: their geometry, materials and maps are marked shared and are not released on rebuild (T1);
    // after loading — a redraw (T2: frames are drawn only on demand)
    { const load = this.loader.loadAsync.bind(this.loader);
      this.loader.loadAsync = (...a) => load(...a).then(r => { markShared(r.scene); setTimeout(() => this.invalidate(), 0); return r; }); }
    // loading (audit, stage 4, B6): any map or model that finishes loading — a redraw; start and end of loading, and a failure — reported outside (app.js:
    // the "Loading details" indicator, a message with a "Retry" button). onBusy(true|false), onLoadError(url) are assigned by the application
    const LM = THREE.DefaultLoadingManager; this.onBusy = this.onLoadError = null; this.failed = new Set();
    LM.onStart = () => this.onBusy?.(true);
    LM.onProgress = () => this.invalidate();
    LM.onLoad = () => { this.invalidate(); this.onBusy?.(false); };
    LM.onError = url => { this.failed.add(url); this.onLoadError?.(url); };
    // loss of the graphics context (the phone evicted the browser tab from video memory): a message to the outside; the build state is in the page address
    canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); this.onContextLost?.(); });
    canvas.addEventListener('webglcontextrestored', () => this.onContextRestored?.());
    this.ready = new Promise(r => { this.readyDone = r; });                         // the phone model is loaded and shown
    this.controls.addEventListener('change', () => this.invalidate());
    this.bodyColors = fetch('data/body_colors.e469690860.json').then(r => r.json());
    // plate assets (https://teatromisterio.github.io/Test-Constructor-iPhone-18-Pro/assets/plates/<name>/<model>.glb): real geometry from the "Fragment Library", the metal is substituted
    this.plate = new THREE.Group(); this.scene.add(this.plate); this.plateCache = {}; this.plateKey = null;
    this.g10 = new THREE.Group(); this.scene.add(this.g10); this.g10Cache = {}; this.g10Key = null;
    // frame assets (https://teatromisterio.github.io/Test-Constructor-iPhone-18-Pro/assets/frames/<name>/<model>.glb): real frame geometry, the metal is substituted as for the plate
    this.frame = new THREE.Group(); this.scene.add(this.frame); this.frameCache = {}; this.frameKey = null;
    // insert assets (https://teatromisterio.github.io/Test-Constructor-iPhone-18-Pro/assets/inserts/<frame>/<model>.glb) + SK-xx materials (https://teatromisterio.github.io/Test-Constructor-iPhone-18-Pro/assets/inserts/materials/<SK>.avif, 22.25 px/mm)
    this.LEATHER_SPEC = 0.3;                                                           // leather highlight strength (1 — full highlight, was paler than the sample photo)
    this.LEATHER_GAIN = 1.7;                                                           // leather bypasses tone mapping: levels the illumination of the insert face to the photo colour
    this.METAL_COMP = 1.3;                                                             // metalness per the designer's sample (≈ 0.3) dims the diffuse — for maps with metalness the colour is ×1.3
    this.POM_K = 1.6;                                                                // parallax depth = relief depth (mm) × POM_K (like normal amplification)
    this.symbolCache = {}; this.plaqueCache = {};                                                             // symbol assets (https://teatromisterio.github.io/Test-Constructor-iPhone-18-Pro/assets/symbols/<name>/*.glb)
    this.insert = new THREE.Group(); this.scene.add(this.insert); this.insertCache = {}; this.insertKey = null; this.skCache = {};
    this.panels = new THREE.Group(); this.scene.add(this.panels); this.panelKey = null;   // panels in the windows of the "Ring" frame (true relief geometry)
    this.pack = new THREE.Group(); this.pack.visible = false; this.pack.matrixAutoUpdate = false; this.scene.add(this.pack);   // packaging: case and slipcase
    this.parts = {}; this.hot = 0; this.frames = 0; this.slow = 0;
    // any change to the scene from outside — a redraw; for asynchronous methods (waiting for an asset) — once more when ready (T2)
    for (const n of ['setBase', 'setPlate', 'setFrame', 'setInsert', 'setPanels', 'setG10', 'setWallpaper', 'bezelSatin', 'showPack', 'setLid', 'orbitUp', 'lockPolar', 'focus', 'focusSide', 'setNav', 'zoomBy', 'resetView']) {
      const f = this[n].bind(this); this[n] = (...a) => { const r = f(...a); this.invalidate(); if (r && r.then) r.then(() => this.invalidate(), () => {}); return r; }; }
    this.fly = null; this.resize(); this.loop();
    new ResizeObserver(() => this.resize()).observe(canvas.parentElement);
  }
  resize() {
    const el = this.renderer.domElement.parentElement; const w = el.clientWidth, h = el.clientHeight;
    if (!w || !h) return; const changed = w !== this.vw || h !== this.vh; this.vw = w; this.vh = h;
    this.renderer.setSize(w, h, false); this.camera.aspect = w / h; this.applyInset(); this.invalidate();
    if (changed) this.refit();
  }
  // Fitting the view to the window (audit, stage 6, E9 and E6). On a phone the bottom of the viewport is covered by the menu sheet: inset is its height in px.
  // The image shifts up by half that height (the camera target is in the centre of the visible part), and the camera distance is computed
  // so that the step's displayed area fits into the visible part of a window of any shape
  applyInset() { const w = this.vw, h = this.vh, c = this.camera; if (!w || !h) return; const y = Math.round(this.insetCur / 2);
    if (y > 0) c.setViewOffset(w, h, 0, y, w, h); else { if (c.view) c.clearViewOffset(); c.updateProjectionMatrix(); } }
  setInset(px, live) { px = Math.max(0, Math.round(px)); if (px === this.inset && !live) return; this.inset = px;
    if (live) { this.insetCur = px; this.applyInset(); } else this.refit(); this.invalidate(); }
  refit(ms = 420) { if (this.lastView && !this.userMoved) this.lastView(ms); }
  // camera for an area: pts — points that must be in view, dir — direction from the target to the camera; the target is the centre of the area
  aim(pts, dir, ms = 900, done) { const w = this.vw || 1, h = this.vh || 1, hv = Math.max(h * 0.2, h - this.inset), cam = this.camera, c = this.controls;
    const box = new THREE.Box3().setFromPoints(pts), q = box.getCenter(new THREE.Vector3()), d = dir.clone().normalize();
    const right = new THREE.Vector3().crossVectors(cam.up, d).normalize(), up = new THREE.Vector3().crossVectors(d, right);
    const t = Math.tan(cam.fov * Math.PI / 360), th = t * w / h, tv = t * hv / h, K = 0.88, r = new THREE.Vector3(); let D = 0;   // K — margins around the area
    const dist = () => { D = 0; for (const p of pts) { r.subVectors(p, q); D = Math.max(D, r.dot(d) + Math.max(Math.abs(r.dot(right)) / th, Math.abs(r.dot(up)) / tv) / K); } };
    dist();
    for (let i = 0; i < 3; i++) { let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;                     // at an angle the area is asymmetric in view — the target shifts to its visible centre
      for (const p of pts) { r.subVectors(p, q); const z = D - r.dot(d), u = r.dot(right) / z, v = r.dot(up) / z; u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); }
      q.addScaledVector(right, (u0 + u1) / 2 * D).addScaledVector(up, (v0 + v1) / 2 * D); dist(); }
    D = Math.min(c.maxDistance - 1, Math.max(c.minDistance + 1, D));
    const p1 = q.clone().addScaledVector(d, D), now = performance.now(), soft = this.softFly();
    if (!soft) { this.fly = { t0: now, ms, p0: cam.position.clone(), p1, q0: c.target.clone(), q1: q, done }; return; }
    // phone (owner's change 15.11.2026 "camera movement not so abrupt when the menu category changes"): the flight is longer and softer
    // (sine curve), along an arc around the target rather than straight through the phone. A new target mid-flight (right after a step
    // change the sheet height changes and the view is recomputed) — the flight is not restarted: same progress and time, only
    // the end point changes (restarting from zero gave a stop and a new acceleration — a jerk)
    const f = this.fly;
    if (f && f.arc && now - f.t0 < f.ms * 0.6) { f.p1 = p1; f.q1 = q; f.done = done || f.done; return; }
    this.fly = { t0: now, ms: ms * 1.45, p0: cam.position.clone(), p1, q0: c.target.clone(), q1: q, done, arc: true, ease: 'sine' }; }
  softFly() { return !matchMedia('(min-width: 900px)').matches; }   // mobile version — the same criterion as isMobile() in app.js
  // Render on demand (audit, stage 3, T2): frames are drawn while a camera flight, the lid animation or finger-driven camera motion
  // (with damping) is in progress, and for HOT_MS more after any scene change — enough for assets to finish loading from the cache. At rest there are no frames.
  invalidate(ms = 400) { this.hot = Math.max(this.hot, performance.now() + ms); }
  // release the resources of a removed part (T1): geometry, materials and maps, except shared ones (shared — assets and maps from the caches)
  dispose(obj) {
    obj.traverse(o => { if (!o.isMesh) return;
      if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose();
      for (const m of [].concat(o.material)) { if (!m || m.userData.shared) continue;
        for (const v of Object.values(m)) if (v && v.isTexture && !v.userData.shared) v.dispose();
        if (m.userData.pomMap && !m.userData.pomMap.userData.shared) m.userData.pomMap.dispose();
        m.dispose(); } });
  }
  // build part (symbol, nameplate, engraving, panel): its own group with a state key. Key unchanged — the part is not rebuilt (T1)
  part(name, key) {
    const old = this.parts[name]; if (old && old.userData.key === key) return null;
    if (old) { this.root.remove(old); this.dispose(old); }
    const g = new THREE.Group(); g.name = 'PART_' + name; g.userData.key = key; this.root.add(g); this.parts[name] = g; this.cur = g; return g;
  }
  alive(o) { while (o.parent) o = o.parent; return o === this.scene; }
  // retry loading after a network failure (B6): the asset and map caches are reset (failed loads remained in them), the build is constructed anew;
  // whatever managed to load, the browser will serve from its own cache
  retry() {
    for (const k of ['baseCache', 'plateCache', 'frameCache', 'insertCache', 'g10Cache', 'symbolCache', 'plaqueCache', 'lightPanelCache', 'skCache', 'forgedCache', 'lightCache', 'wallCache', 'panelCache']) if (this[k]) this[k] = {};
    for (const k of ['baseKey', 'plateKey', 'frameKey', 'insertKey', 'panelKey', 'g10Key', 'wallKey']) this[k] = null;
    this.packReady = null; this.packCache = {}; this.packId = undefined; this.failed.clear();
    for (const g of Object.values(this.parts)) { this.root.remove(g); this.dispose(g); } this.parts = {};
    if (this.st) this.build(this.st);
  }
  loop() {
    requestAnimationFrame(() => this.loop());
    if (this.fly) {
      const F = this.fly, t = Math.min(1, (performance.now() - F.t0) / F.ms);
      const e = F.ease === 'sine' ? (1 - Math.cos(Math.PI * t)) / 2 : F.ease === 'out' ? 1 - Math.pow(1 - t, 3) : t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      this.controls.target.lerpVectors(F.q0, F.q1, e);
      if (F.arc) {   // arc: direction from the target to the camera — spherical interpolation, distance — linear
        const a = F.p0.clone().sub(F.q0), b = F.p1.clone().sub(F.q1), la = a.length(), lb = b.length();
        const dir = new THREE.Vector3().copy(a).normalize(), qa = new THREE.Quaternion().setFromUnitVectors(dir, b.clone().normalize());
        dir.applyQuaternion(new THREE.Quaternion().slerp(qa, e)); this.camera.position.copy(this.controls.target).addScaledVector(dir, la + (lb - la) * e);
      } else this.camera.position.lerpVectors(F.p0, F.p1, e);
      if (t >= 1) { const done = this.fly.done; this.fly = null; done?.(); }
    }
    if (this.lidAnim) { const a = this.lidAnim, t = Math.min(1, (performance.now() - a.t0) / a.ms), e = t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      this.lid.quaternion.slerpQuaternions(a.from, a.to, e); if (t >= 1) this.lidAnim = null; }
    if (this.insetCur !== this.inset) { const dd = this.inset - this.insetCur; this.insetCur = Math.abs(dd) < 1 ? this.inset : this.insetCur + dd * 0.22; this.applyInset(); this.invalidate(120); }   // the view shift follows the sheet smoothly
    const now = performance.now(), moving = this.controls.update();
    if (!(this.fly || this.lidAnim || moving || now < this.hot)) { this.lastT = 0; return; }   // the scene has not changed — no frame is drawn
    // measurement (T2): 40 frames in a row averaging longer than 34 ms — pixel density one step lower
    if (this.lastT && now - this.lastT < 250) { this.slow += now - this.lastT; if (++this.frames >= 40) {
      if (this.slow / this.frames > 34 && this.quality < this.PR_STEPS.length - 1) { this.renderer.setPixelRatio(this.PR_STEPS[++this.quality]); this.resize(); }
      this.frames = 0; this.slow = 0; } }
    this.lastT = now; this.rendered = (this.rendered || 0) + 1;
    // against flicker: the camera's near and far planes follow the distance to the target. Depth precision depends on near:
    // with near = 1 mm at the 400 mm overview distance the depth step is ≈ 0.01 mm, and lens details 0.05 mm apart were z-fighting.
    const dist = this.camera.position.distanceTo(this.controls.target);
    const pk = this.pack?.visible, near = Math.max(1, dist - (pk ? 450 : 120)), far = dist + (pk ? 600 : 200);   // packaging — the scene is ≈ 0.5 m
    if (Math.abs(this.camera.near - near) > 0.5 || Math.abs(this.camera.far - far) > 1) { this.camera.near = near; this.camera.far = far; this.camera.updateProjectionMatrix(); }
    this.scene.traverse(studioize(this.envSoft));
    this.renderer.render(this.scene, this.camera);
  }
  // ---------- build ----------
  build(st) {
    const cat = this.cat, m = cat.models[st.model], d = cat.dims; this.m = m; this.st = st;
    if (this.pack?.visible && this.packId !== undefined && (st.pack || '0') !== this.packId) this.showPack(true);   // packaging change on the "Packaging" step
    this.cur = this.root; this.invalidate();
    const X = x => x - m.W / 2, Y = y => m.H / 2 - y;
    const rr = (x0, y0, x1, y1, r) => { const s = new THREE.Shape(); r = Math.min(r, (x1 - x0) / 2, (y1 - y0) / 2);
      s.moveTo(X(x0 + r), Y(y0)); s.lineTo(X(x1 - r), Y(y0)); s.quadraticCurveTo(X(x1), Y(y0), X(x1), Y(y0 + r)); s.lineTo(X(x1), Y(y1 - r));
      s.quadraticCurveTo(X(x1), Y(y1), X(x1 - r), Y(y1)); s.lineTo(X(x0 + r), Y(y1)); s.quadraticCurveTo(X(x0), Y(y1), X(x0), Y(y1 - r)); s.lineTo(X(x0), Y(y0 + r));
      s.quadraticCurveTo(X(x0), Y(y0), X(x0 + r), Y(y0)); return s; };
    const circ = (x, y, r) => { const p = new THREE.Path(); p.absarc(X(x), Y(y), r, 0, Math.PI * 2, true); return p; };
    const ext = (shape, depth, z, mat, bevel = 0.15) => { const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 24 });
      const mesh = new THREE.Mesh(g, mat); mesh.position.z = z; this.cur.add(mesh); return mesh; };
    const metal = id => { const mt = cat.metals.find(x => x.id === id) || cat.metals[0]; return new THREE.MeshStandardMaterial({ color: mt.hex, metalness: 1, roughness: 0.32 }); };
    const color = st.color && cat.colors.find(c => c.id === st.color);
    // body — the real base model (loads asynchronously; lenses, flash, LiDAR and buttons come from it)
    this.setBase(st.model, color); this.setWallpaper(st.wall);
    // customisation type not chosen yet (start screen): only the phone is loaded — the build parts are downloaded after the choice (audit, stage 4, T3)
    if (!st.mode) { this.win = frameWindow(cat, st); for (const gp of [this.g10, this.plate, this.frame, this.insert, this.panels, this.root]) gp.visible = false; return; }
    this.root.visible = true;
    // light customisation (11.11.2026): its own panel instead of the ceramic back panel; no G10, plate, frame or insert
    const light = st.mode === 'light'; let win, insTop;
    for (const gp of [this.g10, this.plate, this.frame, this.insert, this.panels]) gp.visible = !light;
    this.lightMode = light;
    this.cutU.uCutOn.value = light ? 1 : 0;
    if (light) { const [px0, py0, px1, py1, prt, prb] = cat.light.panel[st.model]; this.cutU.uCutBox.value.set(X(px0), Y(py1), X(px1), Y(py0)); this.cutU.uCutR.value.set(prt, prb);
      this.root.updateMatrixWorld(true); this.cutU.uCutRootInv.value.copy(this.root.matrixWorld).invert(); }
    this.baseGlass();
    // the light customisation panel and procedural parts — the body part: rebuilt only when its own parameters change
    const scratch = new THREE.Group();
    const bodyNew = this.part('body', JSON.stringify([st.mode, st.model, light ? st.light : [st.g10, st.plate, st.frame, st.insert]]));
    if (!bodyNew) this.cur = scratch;                                              // unchanged: the window and insert level calculation is the same, no meshes needed
    if (light) { win = frameWindow(cat, st); this.win = win; insTop = bodyNew ? this.buildLight(st, { X, Y, ext }) : this.lightTop; this.lightTop = insTop; } else {
    // G10
    const g10 = cat.g10.find(x => x.id === st.g10) || cat.g10[0];
    // real G10 base (https://teatromisterio.github.io/Test-Constructor-iPhone-18-Pro/assets/g10/emperor): face at Z 3.0, pocket for the frame and insert at Z 1.0 — the frame and insert sit on it
    const g10asset = !!cat.g10_asset; let zt;
    if (g10asset) { this.setG10(st.model, g10.hex); zt = 1.0; }
    else { const z0 = 0.05; ext(rr(1.0, 1.0, m.W - 1.0, m.H - 1.0, m.R - 1), d.g10_t, z0, new THREE.MeshStandardMaterial({ color: g10.hex, roughness: 0.85 }), 0.05); zt = z0 + d.g10_t; }
    // window and insert
    win = frameWindow(cat, st); this.win = win;
    const ins = cat.inserts.find(x => x.id === st.insert) || cat.inserts[0];
    const frA = frameOf(cat, st);
    // insert: SK-xx material from the library as is, at real scale (22.25 px/mm), texture centre = frame centre
    insTop = frA.insert_asset ? (frA.insert_top ?? 2.5) : zt + d.insert_t;   // insert_top: for the "Ring" frame the insert is 1.3 — face at 2.3
    this.setInsert(st.model, frA, ins);
    if (!frA.insert_asset) {                                                                                             // procedural frames: the insert is extruded
      const [qx0, qy0, qx1, qy1] = m.frame; const fcx = (qx0 + qx1) / 2 - m.W / 2, fcy = m.H / 2 - (qy0 + qy1) / 2;
      const mat = this.insertMaterial(ins, false); for (const t of [mat.map, mat.normalMap, mat.aoMap, mat.userData.pomMap, ...(ins.type === 'carbon' ? [mat.roughnessMap, mat.metalnessMap, mat.anisotropyMap] : [])]) if (t) { t.repeat.set(1 / 71.7, 1 / 165.3); t.offset.set(0.5 - fcx / 71.7, 0.5 - fcy / 165.3); }
      this.insertMesh = ext(rr(win.x0 - 1.5, win.y0 - 1.5, win.x1 + 1.5, win.y1 + 1.5, frA.win_r ? frA.win_r + 1.5 : 3), d.insert_t, zt, mat, 0.05);
    }
    // frame
    const fr = frameOf(cat, st);
    this.setFrame(st.model, fr, st.frame.metal, st.frame.opts || {});
    // plate
    const pl = cat.plates.find(x => x.id === st.plate.id) || cat.plates[0];
    this.setPlate(st.model, pl, st.plate.metal);
    }
    this.dispose(scratch);
    const place = [st.model, st.mode, +win.cx.toFixed(3), +win.cy.toFixed(3), insTop];
    // symbol
    if (this.part('symbol', JSON.stringify([st.symbol, place]))) {
    this.symbolMesh = null;
    if (st.symbol.id !== '0') {
      const sy = cat.symbols.find(x => x.id === st.symbol.id); const cx = win.cx + st.symbol.x, cy = win.cy + st.symbol.y;
      const smat = metal(st.symbol.metal);   // "Custom symbol" — a 3D medallion in the symbol's metal (stage 7, L5), like the other asset symbols
      if (sy.asset) {
        // asset symbol (08.11.2026): the master from the working folder 10_Symbol/<name>/source (https://teatromisterio.github.io/Test-Constructor-iPhone-18-Pro/assets/symbols/). Back on the insert face, the centre
        // of the silhouette's bounding box — at the symbol point. Scale in X, Y — d / asset_h (master silhouette height = default d), in Z — no more than
        // 1: the master is already squashed so that on an insert at Z 2.5 its top is 4.89 — flush with the lens glass (canon); larger does not make it thicker
        const g = new THREE.Group(), k = st.symbol.d / sy.asset_h; g.position.set(X(cx), Y(cy), insTop); g.scale.set(k, k, Math.min(1, k));
        this.cur.add(g); this.symbolMesh = g; smat.roughness = 0.18;                                                    // polished relief
        this.symbolCache[sy.asset] ??= this.loader.loadAsync(sy.asset).then(r => r.scene);
        // metal base of the symbol (Mercedes, 11.11.2026): a radial satin disc under the master, the master sits on it
        // enamel recolouring (zodiac, 13.11.2026 "enamel colour change option"): base.recolor — no base disc, the asset's enamel (ENAMEL_*) is painted in the chosen colour
        const rc = sy.base?.recolor ? (sy.base.enamel.find(c => c.id === (st.symbol.base || {}).e) || sy.base.enamel[0]).hex : null;
        const bz = sy.base && !rc ? sy.base.t : 0;
        // base options (11.11.2026): satin with a choice of metal (0 — the symbol's metal) or enamel of the chosen colour (polished, the side is the symbol's metal)
        if (sy.base && !rc) { const b = sy.base, bs = { f: 'S', m: '0', e: '1', ...(st.symbol.base || {}) };
          if (b.finishes && !b.finishes.some(x => x.id === 'S')) bs.f = 'E';   // enamel-only base (St George the Victorious, 13.11.2026)
          if (bs.f === 'E' && b.enamel) { const ec = b.enamel.find(c => c.id === bs.e) || b.enamel[0], side = this.radialMat(st.symbol.metal)[0];
            const em = new THREE.MeshPhysicalMaterial({ color: ec.hex, metalness: 0, roughness: 0.2, clearcoat: 0.7, clearcoatRoughness: 0.06, envMap: this.envSoft });   // soft studio: no washout from the front screen
            g.add(new THREE.Mesh(polarDisc(b.r, 0, b.t), [em, side])); }
          else { const rm = this.radialMat(bs.m !== '0' ? bs.m : st.symbol.metal), disc = new THREE.Mesh(polarDisc(b.r, 0, b.t), [rm[1], rm[0]]); g.add(disc);
            this.bezelSatin().then(bm => { if (!bm) return; const m2 = bm.clone(); m2.color.copy(rm[1].color); disc.material = [m2, m2]; }); } }   // satin of the "Ring" bezel, radial
        this.symbolCache[sy.asset].then(obj => { if (!this.alive(g)) return;
          // MILL ("Bitcoin" medallion, 17.11.2026) — walls and floor of the engraving: the symbol's metal, darker and more matte, like the grooves of the plate and panels
          const mill = () => { const m = smat.clone(); m.color.multiplyScalar(0.62); m.roughness = 0.38; return m; };
          const c = obj.clone(); c.position.z = bz; c.traverse(o => { if (!o.isMesh) return; if (o.material.name === 'MILL') o.material = mill(); else if (!/^ENAMEL/.test(o.material.name)) o.material = smat; else if (rc) { o.material = o.material.clone(); o.material.color.set(rc); } }); g.add(c); });   // enamel (ENAMEL_*) — its own colour and glossy layer from the asset, metal — the symbol's metal
      }
    } }
    // nameplate
    // side engraving (11.11.2026): text on the flat part of the body edge (button axis, catalogue z), centred in its zone.
    // The bottom of the letters faces the screen on both edges (owner's change 11.11.2026): on the left edge the text runs bottom to top, on the right — top to bottom. Laser engraving (owner's change 11.11.2026 "lighter"): the laser removes the anodised layer — the text is
    // lighter than the body, matte "bare" aluminium with a slight tint of the body colour (a decal over the edge)
    const se = cat.side_engraving;
    if (this.part('side', JSON.stringify([st.side, st.model, (color || {}).hex])))
    for (const s of ['l', 'r']) { const txt = (st.side?.[s] || '').trim(); if (!se || !txt) continue;
      const [y0, y1] = se.zones[st.model][s], L = y1 - y0, HB = 3.2, PX = 48;            // decal L × 3.2 mm, 48 px/mm
      const cv = document.createElement('canvas'); cv.width = Math.round(L * PX); cv.height = Math.round(HB * PX); const g = cv.getContext('2d');
      const fpx = fontMm(se) * PX; g.font = fontCss(se, fpx); g.fillStyle = '#fff'; g.textAlign = 'left'; g.textBaseline = 'alphabetic';
      const tr = se.tracking_em * fpx, chars = [...txt], tw = g.measureText(txt).width + tr * (chars.length - 1);   // width — as in engrave.widthMm
      const capPx = se.cap_mm * PX, base = cv.height / 2 + capPx / 2; let x = (cv.width - tw) / 2;
      const put = (dx, dy) => { let xx = x + dx; if ('letterSpacing' in g) { g.letterSpacing = `${tr}px`; g.fillText(txt, xx, base + dy); }   // letter-spacing with the font's kerning
        else chars.forEach(c => { g.fillText(c, xx, base + dy); xx += g.measureText(c).width + tr; }); };
      // Engraving in metal (audit, stage 7, E7): the letter is recessed — a dark edge on one side, a light highlight on the other,
      // the floor — light matte metal with a fine raster of the laser pass
      const bev = Math.max(1, PX * 0.035); g.fillStyle = 'rgba(12,12,14,.78)'; put(-bev, -bev); g.fillStyle = 'rgba(255,255,255,.95)'; put(bev, bev);
      g.fillStyle = '#d6d6d2'; put(0, 0);
      g.globalCompositeOperation = 'source-atop'; g.fillStyle = 'rgba(0,0,0,.13)'; for (let yy = 0; yy < cv.height; yy += 3) g.fillRect(0, yy, cv.width, 1); g.globalCompositeOperation = 'source-over';
      const tex = new THREE.CanvasTexture(cv); tex.anisotropy = 8; tex.colorSpace = THREE.SRGBColorSpace;
      const body = new THREE.Color((color || {}).hex || '#2B2B2D').lerp(new THREE.Color('#e8e8e6'), 0.85).multiplyScalar(1.35);   // bypasses tone mapping: lighter than even the silver body
      const emat = new THREE.MeshStandardMaterial({ color: body, map: tex, transparent: true, toneMapped: false, metalness: 0.1, roughness: 0.85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(L, HB), emat), sg = s === 'l' ? 1 : -1;
      mesh.matrixAutoUpdate = false; mesh.matrix.makeBasis(new THREE.Vector3(0, sg, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(sg, 0, 0));   // bottom of the letters — towards the screen on both edges
      mesh.matrix.setPosition(sg * (m.W / 2 + 0.02), (y0 + y1) / 2, se.z); mesh.name = 'SIDE_ENGRAVING_' + s; this.cur.add(mesh); }
    // nameplate font — a self-hosted web font (T6): loaded on first use, the nameplate is redrawn when it is ready
    if (st.plaque.id !== '0' && st.plaque.text) { const f = cat.fonts.find(x => x.id === st.plaque.font) || cat.fonts[0], t = st.plaque.text;
      const k = f.id + (/[А-яЁё№]/.test(t) ? 'c' : '') + (/[\x00-\xff]/.test(t.replace(/\s/g, '')) ? 'l' : ''); this.fontAsked ??= new Set(); this.fontEpoch ??= 0;
      if (!this.fontAsked.has(k)) { this.fontAsked.add(k);
        document.fonts.load(`40px ${f.css}`, t).then(faces => { if (faces.length && this.st) { this.fontEpoch++; this.build(this.st); } }, () => {}); } }
    if (!this.part('plaque', JSON.stringify([st.plaque, place, this.fontEpoch || 0]))) return;
    this.plaqueMesh = null;
    if (st.plaque.id !== '0') {
      const pq = plaqueOf(cat, st); const cx = win.cx + st.plaque.x, cy = win.cy + st.plaque.y, hw = pq.w / 2, hh = pq.h / 2;   // size — st.plaque.w (rules.js, plaqueOf)
      let sh; if (pq.shape === 'oval') { sh = new THREE.Shape(); sh.absellipse(X(cx), Y(cy), hw, hh, 0, Math.PI * 2, false); }
      else if (pq.shape === 'octa') { const c = hh * 0.6; sh = new THREE.Shape(); [[cx - hw + c, cy - hh], [cx + hw - c, cy - hh], [cx + hw, cy - hh + c], [cx + hw, cy + hh - c], [cx + hw - c, cy + hh], [cx - hw + c, cy + hh], [cx - hw, cy + hh - c], [cx - hw, cy - hh + c]].forEach(([x, y], i) => i ? sh.lineTo(X(x), Y(y)) : sh.moveTo(X(x), Y(y))); sh.closePath(); }
      else sh = rr(cx - hw, cy - hh, cx + hw, cy + hh, 1.2);
      // text engraving (−0.15): a height map (bump) + a dark matte floor (colour and roughness) directly on the nameplate metal
      const font = cat.fonts.find(f => f.id === st.plaque.font) || cat.fonts[0];
      // text field: for asset nameplates — text_box (the field inside the rim, without rivets), centred at the asset origin; for procedural ones — the whole nameplate
      const [tw, th] = pq.text_box || [pq.w, pq.h];
      const W = 2048, H = Math.round(W * th / tw);
      const mk = (bg, fg, blur) => { const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
        g.fillStyle = bg; g.fillRect(0, 0, W, H); g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle'; if (blur) g.filter = `blur(${blur}px)`;
        const L = plaqueLayout(st.plaque.text || '', font.css, tw, th, cat.plaque_font_min_mm || 2), fs = L.fs * W / tw; g.font = `${fs}px ${font.css}`;
        L.lines.forEach((ln, i) => g.fillText(ln, W / 2, H / 2 + (i - (L.lines.length - 1) / 2) * PLAQUE_LH * fs + fs * 0.05));
        // canvas edge filled with the background (board fix 6, 15.11.2026: "an artefact sticks out"): outside the text field the texture repeats the edge pixel (Clamp),
        // and a letter touching the edge (bottom line, descenders) was stretched as a stripe across the whole nameplate
        g.filter = 'none'; g.fillStyle = bg; const e = 6; g.fillRect(0, 0, W, e); g.fillRect(0, H - e, W, e); g.fillRect(0, 0, e, H); g.fillRect(W - e, 0, e, H);
        const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
        t.repeat.set(1 / tw, 1 / th); if (pq.asset) t.offset.set(0.5, 0.5); else t.offset.set(-(X(cx) - hw) / pq.w, -(Y(cy) - hh) / pq.h); t.anisotropy = 8; return t; };
      const qmat = metal(st.plaque.metal);
      if (st.plaque.text) {
        const col = mk('#ffffff', '#4a4a4a', 1.5); col.colorSpace = THREE.SRGBColorSpace;
        Object.assign(qmat, { map: col, bumpMap: mk('#ffffff', '#000000', 3), bumpScale: 3.0, roughnessMap: mk(pq.asset ? '#1a1a1a' : '#525252', '#c8c8c8', 1.5), roughness: 1 });   // field: for asset nameplates polish 0.10, like the rim (change 09.11.2026: "field without highlights"), for procedural ones — 0.32; the engraving floor is matte 0.78
      }
      if (pq.asset) {
        // asset nameplate (12.11.2026, the owner's new format: a flat slab 0.8, lines and patterns — milled grooves 0.35 × 0.35; source 11_Nameplate/flat):
        // bottom on the insert face, centre — at the nameplate point. FIELD — the face with the engraved text (UV = asset X, Y in mm), MILL — grooves and dimples, POLISH/EDGE — edges
        const g = new THREE.Group(); g.position.set(X(cx), Y(cy), insTop); g.scale.set(pq.k, pq.k, 1); this.cur.add(g); this.plaqueMesh = g;   // asset — scaled by width, thickness unchanged
        const pmat = metal(st.plaque.metal); pmat.roughness = 0.1; if (!st.plaque.text) qmat.roughness = 0.1;
        const mmat = metal(st.plaque.metal); mmat.color.multiplyScalar(0.62); mmat.roughness = 0.38;                // MILL — walls and floor of the milled grooves (darker and more matte, as on the plate and frames)
        this.plaqueCache[pq.asset] ??= this.loader.loadAsync(pq.asset).then(r => { r.scene.traverse(o => { if (!o.isMesh) return;
          const P = o.geometry.attributes.position, uv = new Float32Array(P.count * 2); for (let i = 0; i < P.count; i++) { uv[2 * i] = P.getX(i); uv[2 * i + 1] = P.getY(i); }
          o.geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); }); return r.scene; });
        this.plaqueCache[pq.asset].then(obj => { if (!this.alive(g)) return;
          const c = obj.clone(); c.traverse(o => { if (o.isMesh) o.material = o.material.name === 'FIELD' ? qmat : o.material.name === 'MILL' ? mmat : pmat; }); g.add(c); });
      } else this.plaqueMesh = ext(sh, d.plaque_t, insTop, qmat, 0.2);
    }
  }
  // light customisation panel: physically replaces the back glass (which is hidden) — the glass outline, thickness panel_t, face flush with the body
  // at the glass level Z 0.05 (owner's change 11.11.2026: "must not protrude"). Only applied elements rise above the body. Metal or carbon.
  // Test procedural textures (js/light.js) — at the panel's real scale; UV of the extrusion cap = scene mm
  buildLight(st, { X, Y, ext }) {
    const L = this.cat.light, [x0, y0, x1, y1, rt, rb] = L.panel[st.model], o = st.light, FACE = 0.05, BEV = 0.08, t = L.panel_t, z0 = FACE - t - BEV;   // face (with the bevel) = glass Z
    const s = new THREE.Shape(), H = Math.PI / 2;                                   // glass outline: a rectangle with arcs of radii rt (top) and rb (bottom)
    s.moveTo(X(x0 + rt), Y(y0)); s.lineTo(X(x1 - rt), Y(y0)); s.absarc(X(x1 - rt), Y(y0 + rt), rt, H, 0, true);
    s.lineTo(X(x1), Y(y1 - rb)); s.absarc(X(x1 - rb), Y(y1 - rb), rb, 0, -H, true); s.lineTo(X(x0 + rb), Y(y1));
    s.absarc(X(x0 + rb), Y(y1 - rb), rb, -H, -2 * H, true); s.lineTo(X(x0), Y(y0 + rt)); s.absarc(X(x0 + rt), Y(y0 + rt), rt, Math.PI, H, true);
    const wmm = x1 - x0, hmm = y1 - y0;
    const fitTex = (tx, tile) => { tx.wrapS = tx.wrapT = THREE.RepeatWrapping; tx.anisotropy = 8;
      if (tile) { tx.repeat.set(1 / tile, 1 / tile); } else { tx.repeat.set(1 / wmm, 1 / hmm); tx.offset.set(-X(x0) / wmm, -Y(y1) / hmm); } return tx; };
    this.lightCache ??= {}; const cached = (k, f) => this.lightCache[k] ??= keep(f());
    let mat;
    if (o.mat === 'C') { const cc = L.carbon.colors.find(c => c.id === o.carbon) || L.carbon.colors[0];
      if (cc.tex) {   // 2 × 2 twill (14.11.2026, ambientCG Fabric004, CC0): normal and roughness maps, tile cc.tile mm, tone — cc.hex, lacquer on top
        const TL = new THREE.TextureLoader(), ld = n => cached(`c${cc.id}${n}`, () => fitTex(TL.load(`${cc.tex}${n}.avif`, () => this.invalidate()), cc.tile || 36));
        mat = new THREE.MeshPhysicalMaterial({ color: cc.hex, normalMap: ld('normal'), normalScale: new THREE.Vector2(1, 1), roughnessMap: ld('roughness'), roughness: 1, metalness: 0.25, clearcoat: 1, clearcoatRoughness: 0.04 }); }
      else mat = this.forgedMaterial(cc, 'light'); }   // forged (14.11.2026): the real library photo SK-24 + maps derived from it
    else { const mt = this.cat.metals.find(x => x.id === o.metal) || this.cat.metals[0];
      mat = new THREE.MeshStandardMaterial({ color: mt.hex, metalness: 1, roughness: 0.2 });
      const tex = L.textures.find(x => x.id === o.tex), sat = L.satin.find(x => x.id === o.satin) || (!tex && L.satin[0]);   // no texture — always satin
      if (tex && !tex.overlay) { mat.normalMap = cached(`t${tex.kind}/${st.model}`, () => { const { H, w, h } = textureHeight(tex.kind, wmm, hmm); return fitTex(new THREE.CanvasTexture(heightToNormal(H, w, h, 9))); });
        mat.roughness = 0.24; }
      else if (sat) { mat.normalMap = cached(`s${sat.kind}/${st.model}`, () => { const { H, w, h } = satinHeight(sat.kind, wmm, hmm); return fitTex(new THREE.CanvasTexture(heightToNormal(H, w, h, 0.9))); });
        mat.roughness = 0.36; }
      else if (tex && tex.overlay) mat.roughness = 0.1; }   // layered texture without satin — polished
    // textures (14.11.2026, owner's change "not with primitives but with proper 3D panels"): a true mesh following the plate texture canon —
    // grooves 0.35 × 0.35, pitch ≈ 1.0, a border groove around the field (plate generator, 12_Panel_light → https://teatromisterio.github.io/Test-Constructor-iPhone-18-Pro/assets/light_panels/<texture>/<model>.glb).
    // The GLOSS face — polished metal, POLISH — bevels and edge face, MILL — grooves and bottom (darker and more matte, as on the plate and frames)
    const tex3 = o.mat !== 'C' && L.textures.find(x => x.id === o.tex && !x.overlay);
    if (tex3) { const mt = this.cat.metals.find(x => x.id === o.metal) || this.cat.metals[0], col = new THREE.Color(mt.hex);
      // finish (board fix 2, 15.11.2026): vertical satin over the texture — the same stroke map as on the smooth panel, on the GLOSS face
      // owner's change 15.11.2026 "the satin must not be on the panel's frame, only inside": the satin map and matteness — only in the field
      // inside the border groove (its outer edge is taken from the mesh: MILL groove walls and floor above the panel bottom), the rim beyond the groove is polished
      const sat = L.satin.find(x => x.id === o.satin);
      const satMaps = box => cached(`sm${sat.kind}/${st.model}/${tex3.kind}`, () => { const { H, w, h } = satinHeight(sat.kind, wmm, hmm), nc = heightToNormal(H, w, h, 0.9);
        const px = x => (x - X(x0)) / wmm * w, py = y => (Y(y0) - y) / hmm * h, [bx0, by0, bx1, by1] = box, ins = bx0 - X(x0);
        const clip = (g, r) => { g.beginPath(); g.roundRect(px(bx0), py(by1), px(bx1) - px(bx0), py(by0) - py(by1), [Math.max(0, rt - ins) / wmm * w, Math.max(0, rt - ins) / wmm * w, Math.max(0, rb - ins) / wmm * w, Math.max(0, rb - ins) / wmm * w]); };
        const g = nc.getContext('2d'); g.save(); clip(g); g.rect(0, 0, w, h); g.fillStyle = 'rgb(128,128,255)'; g.fill('evenodd'); g.restore();   // outside the field — a flat normal
        const rc = document.createElement('canvas'); rc.width = w; rc.height = h; const q = rc.getContext('2d'); q.fillStyle = 'rgb(26,26,26)'; q.fillRect(0, 0, w, h);   // roughness: rim 0.10
        clip(q); q.fillStyle = 'rgb(92,92,92)'; q.fill();                                                                                                      // field 0.36
        return [fitTex(new THREE.CanvasTexture(nc)), fitTex(new THREE.CanvasTexture(rc))]; });
      const M = { GLOSS: new THREE.MeshStandardMaterial({ color: col, metalness: 1, roughness: 0.1 }), POLISH: new THREE.MeshStandardMaterial({ color: col, metalness: 1, roughness: 0.06 }),
                  MILL: new THREE.MeshStandardMaterial({ color: col.clone().multiplyScalar(0.62), metalness: 1, roughness: 0.38 }) };
      const g = new THREE.Group(); g.name = 'LIGHT_PANEL'; this.cur.add(g); const file = `https://teatromisterio.github.io/Test-Constructor-iPhone-18-Pro/assets/light_panels/${tex3.kind}/${st.model}.glb`;
      this.lightPanelCache ??= {}; this.lightPanelCache[file] ??= this.loader.loadAsync(file).then(r => { r.scene.traverse(q => { if (!q.isMesh) return;   // UV = X, Y in scene mm (satin map)
          const P = q.geometry.attributes.position, uv = new Float32Array(P.count * 2); for (let i = 0; i < P.count; i++) { uv[2 * i] = P.getX(i); uv[2 * i + 1] = P.getY(i); }
          q.geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); }); return r.scene; });
      this.lightPanelCache[file].then(obj => { if (!this.alive(g)) return; const c = obj.clone();
        if (sat) { obj.userData.grooveBox ??= (() => { const b = [1e9, 1e9, -1e9, -1e9]; obj.traverse(q => { if (!q.isMesh || q.material.name !== 'MILL') return; const P = q.geometry.attributes.position;
            for (let i = 0; i < P.count; i++) { const z = P.getZ(i); if (z > FACE - 0.55 && z < FACE - 0.02) { const x = P.getX(i), y = P.getY(i); b[0] = Math.min(b[0], x); b[1] = Math.min(b[1], y); b[2] = Math.max(b[2], x); b[3] = Math.max(b[3], y); } } }); return b; })();
          const [nm, rm] = satMaps(obj.userData.grooveBox); Object.assign(M.GLOSS, { normalMap: nm, roughnessMap: rm, roughness: 1 }); M.GLOSS.needsUpdate = true; }
        c.traverse(q => { if (q.isMesh) { q.material = M[q.material.name] || M.POLISH; q.castShadow = q.receiveShadow = true; } }); g.add(c); this.invalidate(); });
      return FACE; }
    const panel = ext(s, t, z0, mat, BEV); panel.name = 'LIGHT_PANEL';
    // texture in coloured layers (16.11.2026, "Dark Roses" from the Soft Custom drawing): engraving (outlines and branches, colour — light.lc) and the enamel of the roses
    // (colour — light.ec, polished under lacquer) — full-panel masks for each model, mask edge = panel edge, layers on top of the metal
    const ov = o.mat === 'M' && (L.textures.find(x => x.id === o.tex) || {}).overlay;
    if (ov) { const pw = X(x1) - X(x0), ph = Y(y0) - Y(y1);
      const tex = file => { const a = cached(`ov${file}`, () => new THREE.TextureLoader().load(file, () => this.invalidate()));
        a.wrapS = a.wrapT = THREE.ClampToEdgeWrapping; a.anisotropy = 8; a.repeat.set(1 / pw, 1 / ph); a.offset.set(-X(x0) / pw, -Y(y1) / ph); return a; };
      // the enamel cell is recessed (owner's change 16.11.2026 "the enamel must not protrude forward, it must be embossed", tools/enamel_recess_maps.py):
      // the cell wall — metal bevelled inwards, on the floor the enamel with a meniscus at the wall and the shadow of the step; a shared normal map cell_n
      const layer = (key, m, dz, extra = {}) => { const a = tex(ov[key][st.model]);
        if (extra.n && ov[extra.n]) { m.normalMap = tex(ov[extra.n][st.model]); m.normalScale.set(1, 1); }
        if (extra.ao && ov[extra.ao]) m.map = tex(ov[extra.ao][st.model]);
        Object.assign(m, { alphaMap: a, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 - dz });
        const g = new THREE.Mesh(new THREE.ShapeGeometry(s, 24), m); g.position.z = FACE + 0.003 * dz; this.cur.add(g); };
      const lc = L.laser_colors.find(c => c.id === o.lc) || L.laser_colors[0], ec = (L.enamel_colors || []).find(c => c.id === o.ec) || (L.enamel_colors || [])[0];
      layer('engrave', new THREE.MeshStandardMaterial({ color: lc.hex, metalness: lc.id === 'B' ? 0.2 : 1, roughness: 0.55 }), 1);
      if (ov.wall) layer('wall', new THREE.MeshStandardMaterial({ color: mat.color.clone().multiplyScalar(0.82), metalness: 1, roughness: 0.2 }), 2, { n: 'cell_n' });
      // enamel (owner's change 16.11.2026 "must shimmer like enamel"): a vitreous layer — an almost mirror-like lacquer over the colour,
      // reflections of the metals studio, glass refraction; the meniscus at the cell wall carries the highlight along the petal edges when rotating
      if (ec) layer('enamel', new THREE.MeshPhysicalMaterial({ color: ec.hex, metalness: 0, roughness: 0.06, ior: 1.6, specularIntensity: 1, clearcoat: 1, clearcoatRoughness: 0.015,
        envMap: this.envMetal, envMapIntensity: 1.6 }), 3, { n: 'cell_n', ao: 'enamel_ao' }); }
    // laser pattern — a thin layer on top of the metal (golden or silvery)
    const lz = o.mat === 'M' && !L.textures.find(x => x.id === o.tex) && L.lasers.find(x => x.id === o.laser);
    if (lz) { const lc = L.laser_colors.find(c => c.id === o.lc) || L.laser_colors[0];
      // tile patterns (14.11.2026, the "Geometric seamless patterns" set): a seamless tile mask, tile size tile_mm in mm, the pattern centred on the panel
      // full-panel pattern (16.11.2026, "God Is with Us"): each model has its own mask (image.PM / image.P), mask edge = panel edge, no repeat
      const img = lz.image && lz.image[st.model];
      const alpha = img ? cached(`l${lz.kind}/${st.model}`, () => new THREE.TextureLoader().load(img, () => this.invalidate()))
        : lz.tile ? cached(`l${lz.kind}`, () => new THREE.TextureLoader().load(lz.tile, () => this.invalidate()))
        : cached(`l${lz.kind}/${st.model}`, () => fitTex(new THREE.CanvasTexture(laserCanvas(lz.kind, wmm, hmm))));
      if (img) { alpha.wrapS = alpha.wrapT = THREE.ClampToEdgeWrapping; alpha.anisotropy = 8; const pw = X(x1) - X(x0), ph = Y(y0) - Y(y1);
        alpha.repeat.set(1 / pw, 1 / ph); alpha.offset.set(-X(x0) / pw, -Y(y1) / ph); }
      else if (lz.tile) { const [tw, th] = lz.tile_mm; alpha.wrapS = alpha.wrapT = THREE.RepeatWrapping; alpha.anisotropy = 8;
        alpha.repeat.set(1 / tw, 1 / th); alpha.offset.set(0.5 - X((x0 + x1) / 2) / tw, 0.5 - Y((y0 + y1) / 2) / th); }
      const lm = new THREE.MeshStandardMaterial({ color: lc.hex, metalness: 1, roughness: 0.5, alphaMap: alpha, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
      const lg = new THREE.Mesh(new THREE.ShapeGeometry(s, 24), lm); lg.position.z = FACE + 0.005; this.cur.add(lg); }
    return FACE;                                                                  // the symbol and nameplate sit on the panel face
  }
  // forged carbon (14.11.2026, owner's change "based on our real carbon photo"): colour — the library photo SK-24 unchanged
  // (https://teatromisterio.github.io/Test-Constructor-iPhone-18-Pro/assets/inserts/materials/SK-24.avif, 71.7 × 165.3 mm — the whole frame, 22.25 px/mm; no repeats — cropping only, one scale
  // for Pro and Pro Max), relief and gloss — maps from the lightness of the same photo (tools/forged_photo_maps.py → https://teatromisterio.github.io/Test-Constructor-iPhone-18-Pro/assets/light_carbon/forged_photo).
  // Catalogue colours — a tint multiplier on the photo; gold leaf — a photo with gold flakes and a metallic mask. Under lacquer.
  // mode 'light' — UV in scene mm (light customisation panel: photo centre — phone centre, flipY true); 'mm' — the same, texture copies (insert); 'planar' — the same via the second UV set uv1 (bezel);
  // 'glb' — the UV layout of the frame assets (u = X / 71.7, v = Y / 165.3, flipY false, as for the insert) — the normal is flipped along v
  forgedMaterial(cc, mode = 'light') { this.forgedCache ??= {}; const TL = new THREE.TextureLoader(), F = 'https://teatromisterio.github.io/Test-Constructor-iPhone-18-Pro/assets/light_carbon/forged_photo/', glb = mode === 'glb';
    const ld0 = (url, srgb) => this.forgedCache[`${mode === 'mm' ? 'light' : mode}/${url}`] ??= (() => { const t = TL.load(texUrl(url), () => this.invalidate());
      t.flipY = !glb; t.anisotropy = 8; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; if (srgb) t.colorSpace = THREE.SRGBColorSpace;
      if (mode === 'planar') t.channel = 1;                                             // bezel: planar projection in the second UV set (uv1, mm)
      if (!glb) { t.repeat.set(1 / 71.7, 1 / 165.3); t.offset.set(0.5, 0.5); } return keep(t); })();
    const ld = (url, srgb) => mode === 'mm' ? ld0(url, srgb).clone() : ld0(url, srgb);   // 'mm' — extruded insert: repeat and offset are set by the caller
    const leaf = !!cc.leaf, tint = cc.tint || [1, 1, 1];
    // owner's changes 14.11.2026 "the carbon plane is smooth, the surface itself is matte, only the inner elements shimmer"
    // and "the surface is still not smooth": there is no relief map at all — the normal is strictly flat, no ripple highlights. The lacquer (clearcoat)
    // is even and matte (0.42); the shimmer is only inside: fibre bundles with a metallic sheen and their own roughness
    // (0.13…0.33 from the gloss map derived from the photo) — when rotating, individual bundles flash while the surface stays flat
    const m = new THREE.MeshPhysicalMaterial({ color: new THREE.Color(...tint), map: ld(leaf ? F + 'albedo_leaf.avif' : 'https://teatromisterio.github.io/Test-Constructor-iPhone-18-Pro/assets/inserts/materials/SK-24.avif', true),
      roughnessMap: ld(F + 'roughness.avif'), roughness: 0.75, metalness: leaf ? 1 : 0.35,
      ...(leaf ? { metalnessMap: ld(F + 'leaf_full.avif') } : {}), clearcoat: 0.45, clearcoatRoughness: 0.62 });
    // owner's changes 14.11.2026 "more matte and slightly more contrast" and "in hue and contrast — like twill carbon": lacquer 0.62,
    // bundles 0.75 (× the gloss map). The tone is applied only at render time (the library photo file is not changed), to the photo texel before multiplying by the catalogue
    // colour: the warm tint of the photo is removed (saturation 0.35, a slight cool shift, as in the twill #1d1d22), a power curve 1.66 × 1.37
    // in linear space: the photo's mid-tone (≈ 0.066) → ≈ 0.015 — almost black, like the twill base, while the shiny bundles
    // (≈ 0.4) stay bright (≈ 0.3) — contrast as in the twill. For gold leaf the saturation is not removed (the gold of the flakes)
    // change "the carbon panels are light too" (14.11.2026): lightness measured in the frame — bezel twill 57.8, forged 73–74. The lightness came from
    // the haze of the matte lacquer: lacquer strength 1 → 0.45, curve multiplier 1.37 → 1.0 — forged ≈ 58–60, like the twill next to it
    const sat = leaf ? '1.0' : '0.35';
    m.onBeforeCompile = sh => { sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', `#ifdef USE_MAP
	vec4 sampledDiffuseColor = texture2D( map, vMapUv );
	vec3 fc = sampledDiffuseColor.rgb; float fl = dot( fc, vec3( 0.2126, 0.7152, 0.0722 ) );
	fc = mix( vec3( fl ), fc, ${sat} ) * vec3( 0.95, 0.97, 1.1 );
	fc = pow( max( fc, vec3( 0.0 ) ), vec3( 1.66 ) ) * 1.0;
	diffuseColor *= vec4( fc, sampledDiffuseColor.a );
#endif`); };
    m.customProgramCacheKey = () => 'forgedTone' + sat; return m; }
  // satin of the "Ring" frame bezel (asset maps + anisotropy) — the reference radial satin for the symbol base
  bezelSatin() { const fr = this.cat.frames.find(f => f.ring_disc && f.parts_asset); if (!fr) return Promise.resolve(null);
    const file = `${fr.parts_asset}/${this.cat.models.PM.base.split('/').pop()}`;
    this.frameCache[file] ??= this.loader.loadAsync(file).then(g => g.scene);
    // original bezel material (14.11.2026): with a carbon bezel (BP 3/4) setFrame swaps the BEZEL material, the original is in userData.mat0;
    // without this the satin of the panels in the windows lost its maps and came out as smooth dark metal
    return this.frameCache[file].then(s => { let m = null; s.traverse(o => { const mm = o.isMesh && (o.userData.mat0 || o.material); if (!m && mm && mm.name === 'BEZEL') m = mm; }); return m; }); }
  // metal with radial satin: the cylinder caps — a "brush" normal map radiating from the centre, the side — polished
  radialMat(metalId) { const mt = this.cat.metals.find(x => x.id === metalId) || this.cat.metals[0];
    this.radialTex ??= (() => { const t = new THREE.CanvasTexture(radialSatinNormal(1024)); t.anisotropy = 8; return keep(t); })();
    const cap = new THREE.MeshStandardMaterial({ color: mt.hex, metalness: 1, roughness: 0.34, normalMap: this.radialTex });
    const side = new THREE.MeshStandardMaterial({ color: mt.hex, metalness: 1, roughness: 0.18 });
    return [side, cap, cap]; }
  // base device: loading the model (cached) and recolouring the materials to the body colour
  async setBase(modelId, color) {
    const key = modelId + '/' + (color ? color.key : '');
    if (key === this.baseKey) return; this.baseKey = key;
    const url = this.cat.models[modelId].base; if (!url) return;
    this.baseCache[modelId] ??= this.loader.loadAsync(url).then(g => g.scene);
    const [obj, bc] = await Promise.all([this.baseCache[modelId], this.bodyColors]);
    if (this.baseKey !== key) return;                                  // something else was chosen while loading
    const pal = bc.colors[color ? color.key : 'black'] || bc.colors.black;
    obj.traverse(o => { if (!o.isMesh) return; const p = pal.materials[o.material.name]; if (!p) return;
      o.material.color.setRGB(...p.color_linear); o.material.metalness = p.metalness; o.material.roughness = p.roughness; });
    // Camera Control (owner's change 12.11.2026): in the body colour — the tone of anodised aluminium, the gloss of sapphire (roughness 0.12)
    obj.traverse(o => { if (!o.isMesh || o.material.name !== 'CAMERA_CONTROL_sapphire') return; const p = pal.materials.AL_anodized; if (!p) return;
      o.material.color.setRGB(...p.color_linear); o.material.metalness = p.metalness; o.material.roughness = 0.12; });
    if (!obj.userData.flatFixed) { obj.userData.flatFixed = true; obj.traverse(o => { if (!o.isMesh) return;
      // flat parts (screen glass, active area, Dynamic Island, back glass): after mesh decimation some of the normals
      // at the rounded corners are tilted — there were dark wedges on the screen glass (owner's change 11.11.2026). The normal is strictly along the Z axis
      const P = o.geometry.attributes.position, N = o.geometry.attributes.normal; if (!N) return; let z0 = 1e9, z1 = -1e9, nz = 0;
      for (let i = 0; i < P.count; i++) { z0 = Math.min(z0, P.getZ(i)); z1 = Math.max(z1, P.getZ(i)); nz += N.getZ(i); }
      // screen glass (the bezel backing): mesh decimation pulled 15 vertices onto the screen plane (Z −8.76) — slanted triangles
      // crept over the active area (wedges at the corners, the screen covered). The glass is flat, at its own level, behind the screen
      // Dynamic Island is 0.003 mm from the screen — it flickered over the wallpaper; we move it 0.05 mm forward
      if (o.name === 'DYNAMIC_ISLAND') { for (let i = 0; i < P.count; i++) P.setZ(i, P.getZ(i) - 0.05); P.needsUpdate = true; o.geometry.computeBoundingBox(); o.geometry.computeBoundingSphere(); z0 -= 0.05; z1 -= 0.05; }
      if (o.material.name === 'GLASS_front') { for (let i = 0; i < P.count; i++) P.setZ(i, z1); P.needsUpdate = true; o.geometry.computeBoundingBox(); o.geometry.computeBoundingSphere(); z0 = z1; }
      if (z1 - z0 > 0.02) return; const s = Math.sign(nz) || -1, A = new Float32Array(N.count * 3); for (let i = 0; i < N.count; i++) A[3 * i + 2] = s;
      o.geometry.setAttribute('normal', new THREE.BufferAttribute(A, 3)); }); }
    if (obj.parent !== this.base) { this.base.clear(); this.base.add(obj); }
    this.baseGlass(); this.setWallpaper(this.st?.wall);
    this.readyDone?.();
  }
  // screen wallpaper (11.11.2026): an image on the active screen area, "cover" fit to its bounds, no tone mapping (the screen is self-lit)
  setWallpaper(id) {
    let scr; this.base.traverse(o => { if (o.name === 'SCREEN_active_area' && o.isMesh) scr = o; }); if (!scr) return;
    scr.userData.offMat ??= scr.material; const ws = this.cat.wallpapers || [], w = ws.find(x => x.id === id && x.src) || ws[0];   // there is always a wallpaper; an unknown one falls back to the first
    if (!w) { scr.material = scr.userData.offMat; return; }
    const g = scr.geometry; if (!g.attributes.uv) { g.computeBoundingBox(); const b = g.boundingBox, P = g.attributes.position, uv = new Float32Array(P.count * 2);
      for (let i = 0; i < P.count; i++) { uv[2 * i] = (P.getX(i) - b.min.x) / (b.max.x - b.min.x); uv[2 * i + 1] = (P.getY(i) - b.min.y) / (b.max.y - b.min.y); }
      g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); }
    this.wallCache ??= {}; const key = w.src;
    if (!this.wallCache[key]) { const t = new THREE.TextureLoader().load(w.src, tx => { const b = g.boundingBox, sa = (b.max.x - b.min.x) / (b.max.y - b.min.y), ia = tx.image.width / tx.image.height;
        if (ia > sa) { tx.repeat.set(sa / ia, 1); tx.offset.set((1 - sa / ia) / 2, 0); } else { tx.repeat.set(1, ia / sa); tx.offset.set(0, (1 - ia / sa) / 2); }
        this.invalidate(); });
      t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; this.wallCache[key] = new THREE.MeshBasicMaterial({ map: t, toneMapped: false }); }
    // the screen faces −Z: from outside the image is mirrored in X — we read the UVs from the reverse side
    if (!g.userData.uvFlip) { g.userData.uvFlip = true; const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setX(i, 1 - uv.getX(i)); uv.needsUpdate = true; }
    scr.material = this.wallCache[key];
  }
  // the back glass and the Apple logo are hidden in light customisation: the panel takes their place
  baseGlass() { this.base.traverse(o => { if (/^(BACK_GLASS|APPLE_LOGO)/.test(o.name)) o.visible = !this.lightMode; });
    // pocket for the panel (owner's change 14.11.2026 "the panel patterns must not be see-through"): the back of the body under the glass lies at Z ≈ 0,
    // while the panel (face 0.05, bottom −0.75) is recessed into the body — the groove floor (−0.30) ended up under the aluminium, and the body colour showed in the grooves.
    // We do not touch the source model: in light customisation the body materials do not draw fragments inside the panel outline within the layer of its thickness
    this.base.traverse(o => { if (!o.isMesh || o.material.userData.cutPatched) return; const mt = o.material; mt.userData.cutPatched = true;
      mt.onBeforeCompile = sh => { Object.assign(sh.uniforms, this.cutU);
        sh.vertexShader = 'varying vec3 vCutP;\n' + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\nvCutP = (uCutRootInv * modelMatrix * vec4(transformed, 1.0)).xyz;').replace('void main() {', 'uniform mat4 uCutRootInv;\nvoid main() {');
        sh.fragmentShader = 'varying vec3 vCutP;\nuniform float uCutOn; uniform vec4 uCutBox; uniform vec2 uCutR; uniform vec2 uCutZ;\n' + sh.fragmentShader.replace('void main() {', `void main() {
          if (uCutOn > 0.5 && vCutP.z > uCutZ.x && vCutP.z < uCutZ.y) { vec2 c = 0.5 * (uCutBox.xy + uCutBox.zw), h = 0.5 * (uCutBox.zw - uCutBox.xy);
            float r = vCutP.y > c.y ? uCutR.x : uCutR.y; vec2 q = abs(vCutP.xy - c) - (h - r); if (length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r < -0.02) discard; }`); };
      mt.customProgramCacheKey = () => 'panelCut'; mt.needsUpdate = true; }); }
  // plate asset: loading (cached), the metal tone is multiplied by the maps; MILL (groove floor) is darker
  async setPlate(modelId, pl, metalId) {
    const key = pl.asset ? `${pl.asset}/${modelId}/${metalId}` : null;
    if (key === this.plateKey) return; this.plateKey = key;
    if (!key) { this.plate.clear(); return; }
    const file = `${pl.asset}/${this.cat.models[modelId].base.split('/').pop()}`;
    this.plateCache[file] ??= this.loader.loadAsync(file).then(g => g.scene);
    const obj = await this.plateCache[file]; if (this.plateKey !== key) return;
    const mt = this.cat.metals.find(x => x.id === metalId) || this.cat.metals[0]; const c = new THREE.Color(mt.hex);
    obj.traverse(o => { if (!o.isMesh) return; const n = o.material.name; o.material.color.copy(c);
      if (n === 'MILL') o.material.color.multiplyScalar(0.62); });
    this.plate.clear(); this.plate.add(obj);
  }
  // frame asset: loading (cached), the metal tone is multiplied by the satin maps; MILL (groove, letters, back) is darker. Sits on the floor of the G10 pocket (Z 1.0)
  // separate frame parts (parts_asset, 08.11.2026: the "Ring" frame — bezel and screws): each frame option with metal_of has its own metal
  // (BEZEL* ← option BZ, SCREW* ← SM; "0" — in the frame colour)
  async setFrame(modelId, fr, metalId, opts = {}) {
    const po = (fr.options || []).filter(o => o.metal_of || o.variant_of || o.color_of || o.carbon_of).map(o => o.id + (opts[o.id] || '0')).join('');
    // part variant (variant_of, 08.11.2026: patterned bezel): a value with an asset replaces the part of that name from parts_asset
    const vo = (fr.options || []).find(o => o.variant_of && (o.values.find(v => v.id === (opts[o.id] || '0')) || {}).asset);
    const vv = vo ? vo.values.find(v => v.id === opts[vo.id]) : null;
    const key = fr.asset ? `${fr.asset}/${modelId}/${metalId}/${po}` : null;
    if (key === this.frameKey) return; this.frameKey = key;
    if (!key) { this.frame.clear(); return; }
    const fname = this.cat.models[modelId].base.split('/').pop(), file = `${fr.asset}/${fname}`;
    this.frameCache[file] ??= this.loader.loadAsync(file).then(g => g.scene);
    const pfile = fr.parts_asset ? `${fr.parts_asset}/${fname}` : null;
    if (pfile) this.frameCache[pfile] ??= this.loader.loadAsync(pfile).then(g => g.scene);
    const vfile = vv ? `${vv.asset}/${fname}` : null;
    if (vfile) this.frameCache[vfile] ??= this.loader.loadAsync(vfile).then(g => g.scene);
    const [obj, parts, vpart] = await Promise.all([this.frameCache[file], pfile ? this.frameCache[pfile] : null, vfile ? this.frameCache[vfile] : null]); if (this.frameKey !== key) return;
    const col = id => new THREE.Color((this.cat.metals.find(x => x.id === id) || this.cat.metals.find(x => x.id === metalId) || this.cat.metals[0]).hex);
    const c = col(metalId);
    // ENAMEL (enamel of the "Emperor" and "Golden Rose" frames, 09.11.2026) and STONE (stones) — their own colour from the asset, not recoloured by the metal
    const own = m => /^(ENAMEL|STONE)/.test(m.name);
    obj.traverse(o => { if (!o.isMesh || own(o.material)) return; o.material.color.copy(c); if (o.material.name === 'MILL') o.material.color.multiplyScalar(0.62); });
    // colour option (color_of, 09.11.2026: "Enamel colour" of the "Emperor" frame): the material with this name gets the colour of the chosen value
    for (const o of fr.options || []) if (o.color_of) { const v = o.values.find(x => x.id === (opts[o.id] || '0')) || o.values[0];
      obj.traverse(q => { if (q.isMesh && q.material.name.startsWith(o.color_of)) q.material.color.set(v.hex); }); }
    if (parts) parts.traverse(o => { if (o.isMesh && o.userData.mat0) o.material = o.userData.mat0; });   // parts cache: restore the metal after a carbon bezel
    if (parts) { const pick = {}; for (const o of fr.options || []) if (o.metal_of) pick[o.metal_of] = opts[o.id] && opts[o.id] !== '0' ? opts[o.id] : metalId;
      for (const p of [parts, vpart]) if (p) p.traverse(o => { if (!o.isMesh || own(o.material)) return; const k = Object.keys(pick).find(q => o.material.name.startsWith(q)); o.material.color.copy(col(k ? pick[k] : metalId)); });
      parts.traverse(o => { if (o.isMesh) o.visible = !(vo && o.name.startsWith(vo.variant_of)); }); }
    this.frame.clear(); this.frame.add(obj); if (parts) this.frame.add(parts); if (vpart) this.frame.add(vpart);
    // disc in the centre of the ring ("Ring" frames, owner's changes 11.11.2026): the ring is closed, the disc is recessed for the symbol (face at the
    // insert level). The satin is the same as the bezel's (its maps and anisotropy) but radial: polar UVs, strokes radiating from the centre
    if (fr.ring_disc && fr.symbol_ring?.[modelId]) { const m = this.cat.models[modelId], rs = fr.symbol_ring[modelId], rd = fr.ring_disc;
      let bm = null; if (parts) parts.traverse(o => { if (!bm && o.isMesh && o.material.name === 'BEZEL') bm = o.material; });
      const top = bm ? bm.clone() : this.radialMat(metalId)[1]; top.color.copy(c);
      const disc = new THREE.Mesh(polarDisc(rs.d / 2 + 0.3, rd.bottom, rd.top + 0.02), [top, top]);   // +0.02 — above the insert face, no flicker
      disc.position.set(rs.c[0] - m.W / 2, m.H / 2 - rs.c[1], 0); disc.name = 'RING_DISC'; this.frame.add(disc); }
    // carbon bezel (board 13.11.2026: bezel textures — satin, mesh, fluted, twill carbon, forged): for a value with carbon
    // the BEZEL part gets the carbon panel material; the disc in the centre of the ring stays metal (it was taken above)
    const bo = (fr.options || []).find(o => o.variant_of === 'BEZEL'), bc = bo ? (bo.values.find(v => v.id === (opts[bo.id] || '0')) || {}).carbon : null;
    // forged carbon on the bezel (owner's change 14.11.2026 "the carbon in the circle is poor quality"): the photo is laid without repeat, while the bezel's
    // UVs are made for satin (they run outside the photo frame — the bottom of the ring stretched the edge pixel). For carbon — its own planar projection:
    // the second UV set uv1 = X, Y in scene mm (as for the light customisation panel); the main UVs are not touched (satin, mesh)
    // insert carbon on the bezel (owner's change 19.11.2026): bc = 'I' — carbon from option BC (insert id, twill 196 by default), the same
    // material as the insert, via the planar UVs uv1 (scene mm) at the insert's scale
    const bco = (fr.options || []).find(o => o.carbon_of === 'BEZEL'), bIns = bc === 'I' ? (this.cat.inserts.find(x => x.id === (bco && opts[bco.id]) && x.type === 'carbon' && x.maps) || this.cat.inserts.find(x => x.id === '196')) : null;
    if (parts && bc) { const cm = bIns ? this.planarCarbon(bIns) : bc === 'F' ? this.forgedMaterial(this.cat.light.carbon.colors[0], 'planar') : this.panelMaterials('C' + bc).top;
      this.root.updateMatrixWorld(true); const inv = this.root.matrixWorld.clone().invert(), v = new THREE.Vector3();
      parts.traverse(o => { if (o.isMesh && /^BEZEL/.test(o.material.name)) { o.userData.mat0 = o.material; o.material = cm;
        if ((bc === 'F' || bIns) && !o.geometry.attributes.uv1) { o.updateMatrixWorld(true); const P = o.geometry.attributes.position, M = inv.clone().multiply(o.matrixWorld), U = new Float32Array(P.count * 2);
          for (let i = 0; i < P.count; i++) { v.fromBufferAttribute(P, i).applyMatrix4(M); U[2 * i] = v.x; U[2 * i + 1] = v.y; }
          o.geometry.setAttribute('uv1', new THREE.BufferAttribute(U, 2)); } } }); }
  }
  // insert carbon via the planar UVs uv1 (X, Y in scene mm): map copies on channel 1, the cloth square — the insert height in mm (as for insert_h)
  planarCarbon(ins) { const m = this.insertMaterial(ins, true, null), S = this.insertUvBox ? (this.insertUvBox[3] - this.insertUvBox[2]) * 165.3 : 165.3, done = new Map();
    for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'anisotropyMap']) { const t = m[k]; if (!t) continue;
      if (!done.has(t)) { const c = t.clone(); c.channel = 1; c.wrapS = c.wrapT = THREE.RepeatWrapping; c.repeat.set(1 / S, 1 / S); c.offset.set(0.5, 0.5); c.needsUpdate = true; done.set(t, c); }
      m[k] = done.get(t); }
    m.needsUpdate = true; return m; }
  // insert material: SK-xx texture from the library unchanged; roughness by leather type, carbon under lacquer.
  // flipY: in GLB the UVs follow the glTF convention (false), for the extruded shape — UV in scene mm (true, the repeat is set by build)
  // Bounded cache of insert maps (audit 18.11.2026, 1.6): previously the maps of every leather viewed stayed in video memory forever
  // (a designer leather at 3072² — about 150 MB), and long browsing ended with the loss of 3D graphics. Now the most recently accessed
  // maps are kept; the rest are freed. A map still applied to a part will reload into video memory by itself after being freed
  skTouch(key) { this.skTick = (this.skTick || 0) + 1; (this.skUsed ??= {})[key] = this.skTick; return this.skCache[key]; }
  skTrim() { const keep = LITE ? 8 : 12, keys = Object.keys(this.skCache); if (keys.length <= keep) return;
    keys.sort((a, b) => ((this.skUsed || {})[b] || 0) - ((this.skUsed || {})[a] || 0));
    for (const k of keys.slice(keep)) { this.skCache[k].dispose(); delete this.skCache[k]; if (this.skUsed) delete this.skUsed[k]; } }
  insertMaterial(ins, glb, uvBox) {
    // metal insert (11.11.2026): catalogue metal with vertical satin — the maps and anisotropy of the "Ring" bezel satin.
    // Insert UVs: u — X in mm / 71.7 (as for the bezel), the map strokes run along v — on the insert they are vertical
    if (ins.type === 'metal') { const mt = this.cat.metals.find(x => x.id === ins.metal) || this.cat.metals[0];
      // pattern engraving (16.11.2026, "Palmette"): groove normals and occlusion from maps in the insert's UVs (https://teatromisterio.github.io/Test-Constructor-iPhone-18-Pro/assets/inserts/materials/<pattern>_n|_ao,
      // tools/insert_pattern_maps.py); finish — satin (bezel strokes and anisotropy, pattern normals) or polished (mirror)
      const pat = ins.pattern, gloss = ins.finish === 'gloss';
      const mat = new THREE.MeshPhysicalMaterial({ color: mt.hex, metalness: 1, roughness: gloss ? 0.07 : 0.32, anisotropy: gloss ? 0 : 0.85, envMap: this.envMetal });
      // pattern maps — from the shared cache (audit 18.11.2026, 1.6): previously they were recreated on every insert selection and never freed
      if (pat) { const tx = (n, srgb) => { const key = `pat/${pat}_${n}/${glb ? 'g' : 'm'}`;
          if (!this.skCache[key]) { const t = new THREE.TextureLoader().load(`https://teatromisterio.github.io/Test-Constructor-iPhone-18-Pro/assets/inserts/materials/${pat}_${n}.${n === 'n' ? 'webp' : 'avif'}`, () => this.invalidate());   /* keep-webp: synthetic pattern normals — lossless WebP (23–800 KB), AVIF is 2–50 times heavier (audit 21.11.2026) */ t.flipY = !glb; t.anisotropy = 8; if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.userData.shared = true; this.skCache[key] = t; }
          return this.skTouch(key); };
        mat.normalMap = tx('n'); mat.normalScale.set(1, glb ? -1 : 1); mat.aoMap = tx('ao'); mat.aoMapIntensity = gloss ? 1 : 1.6;   // on satin the grooves read more weakly — stronger occlusion
        // against "ringing" (17.11.2026, owner's change "the textures on the inserts ring and jitter, bring them to the plate format"): on the plate the grooves are
        // geometry and are smoothed by MSAA, on the insert — a normal map, and sub-pixel groove edges give sparkles on the polished finish. The per-pixel
        // roughness is raised by the spread of the map's normals (three.js geometric specular anti-aliasing, but using the mapped normal):
        // up close the edges stay sharp, far away the fine relief quietly averages out instead of flickering
        // the groove floor and walls — like the plate's MILL (tone ×0.62, roughness 0.38): without this the flat floor shines like the face, and the groove reads
        // as two thin edge lines — the pattern looks twice as dense as the plate (owner's change "the pitch does not match the plate block", 17.11.2026).
        // The groove mask — the AO map (groove_maps.py: floor 0.58, walls 0.75, face 1)
        mat.onBeforeCompile = sh => { sh.fragmentShader = sh.fragmentShader.replace('#include <lights_physical_fragment>',
          THREE.ShaderChunk.lights_physical_fragment.replace('dFdx( nonPerturbedNormal ) ), abs( dFdy( nonPerturbedNormal ) )', 'dFdx( normal ) ), abs( dFdy( normal ) )'))
          .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nfloat millK = clamp( ( 1.0 - texture2D( aoMap, vAoMapUv ).r ) / 0.42, 0.0, 1.0 );\ndiffuseColor.rgb *= mix( 1.0, 0.62, millK );\nroughnessFactor = mix( roughnessFactor, 0.38, millK );'); };
        mat.customProgramCacheKey = () => 'insPatAA'; }
      if (!gloss) this.bezelSatin().then(bm => { if (!bm) return; for (const k of pat ? ['map', 'roughnessMap'] : ['map', 'normalMap', 'roughnessMap']) mat[k] = bm[k];
        if (!pat) mat.normalScale.copy(bm.normalScale); mat.roughness = bm.roughness; mat.anisotropy = bm.anisotropy; mat.needsUpdate = true; this.invalidate(); });
      return mat; }
    // forged carbon (owner's change 14.11.2026 "forged carbon must be the same in all elements"): the SK-24 insert is the same
    // shared material as the "Ring" panels, the bezel and the light customisation panel (SK-24 photo + gloss, twill tone, matte lacquer)
    // carbons with the designer's maps (Drive, 19.11.2026: carbon_fibers twill, forged with cherry flecks) — with their own maps below
    if (ins.type === 'carbon' && !ins.maps) return this.forgedMaterial(this.cat.light.carbon.colors[0], glb ? 'glb' : 'mm');
    const rough = { smooth: 0.6, fine: 0.68, pebbled: 0.72, croc: 0.55, python: 0.6, carbon: 0.35 }[ins.type] ?? 0.65;
    // leather (owner's change 11.11.2026 "paler than the original"): the sample photo already contains a highlight, and the full render highlight on top
    // whitened and desaturated the colour. The leather highlight is weakened (specularIntensity = LEATHER_SPEC), reflections — the soft studio without
    // the front screen (the insert loads after studioize and previously picked up the scene's metal studio)
    const mat = ins.type === 'carbon' ? new THREE.MeshPhysicalMaterial({ roughness: rough, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.05 })
                                      : new THREE.MeshPhysicalMaterial({ roughness: rough, metalness: 0, specularIntensity: this.LEATHER_SPEC, envMap: this.envSoft });
    // light leather (owner's change 11.11.2026 "bring it up"): AgX tone mapping (tuned for metals) compresses the highlights — white leather came out
    // 178 instead of 236 as in the photo. Leather bypasses tone mapping (the sample photo is already a finished image), and the illumination of the insert face
    // in the front view (≈ 0.57) is evened out by the LEATHER_GAIN multiplier — render colour ≈ photo colour for both white and dark leather
    const fin = m => { if (ins.type !== 'carbon' && ins.type !== 'metal') { m.toneMapped = false; m.color.multiplyScalar(this.LEATHER_GAIN * (m.metalnessMap ? this.METAL_COMP : 1)); } return m; };
    // the designer's PBR maps (texture brief, 11.11.2026): OpenGL normals, roughness and occlusion from maps, colour — from a map or hex
    if (ins.maps) {
      // layout "insert_h" (owner's changes 11.11.2026, black_croco-3): the designer's cloth fits the insert height in full
      // (from the top to the bottom edge of its face), centred on the insert in width, without tiling or distortion — part of the square at the sides
      // goes past the edge. The face bounds come from the insert's own UVs (UV: canvas 71.7 × 165.3 mm, build_insert_assets), so
      // it suits any frame and plate shape
      let rep = null;
      if (ins.layout === 'insert_h' && glb && uvBox) { const [u0, u1, v0, v1] = uvBox, dv = v1 - v0, S = dv * 165.3, uc = (u0 + u1) / 2;
        rep = [71.7 / S, 1 / dv, 0.5 - uc * 71.7 / S, -v0 / dv]; }
      const ld = (url, srgb) => { const key = url + (glb ? '/g' : '/m') + (rep ? '/' + rep.map(x => x.toFixed(4)).join(',') : '');
        if (!this.skCache[key]) { const t = new THREE.TextureLoader().load(texUrl(url), () => this.invalidate());
          if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; t.flipY = !glb; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
          if (rep) { t.repeat.set(rep[0], rep[1]); t.offset.set(rep[2], rep[3]); }
          this.skCache[key] = t; }
        return this.skTouch(key); };
      const m = ins.maps; mat.color.set(m.basecolor ? '#ffffff' : ins.hex || '#222'); if (m.basecolor) mat.map = ld(m.basecolor, true);
      if (m.normal) { mat.normalMap = ld(m.normal, false); mat.normalScale.set(1, glb ? -1 : 1); }
      if (m.roughness) { mat.roughnessMap = ld(m.roughness, false); mat.roughness = 1; }
      if (m.ao) { mat.aoMap = ld(m.ao, false); mat.aoMapIntensity = 1; }
      if (m.metallic) { mat.metalnessMap = ld(m.metallic, false); mat.metalness = 1; }   // metalness from the designer's map (black_croco-2)
      if (m.orm) { const o = ld(m.orm, false); mat.aoMap = mat.roughnessMap = mat.metalnessMap = o; mat.roughness = mat.metalness = 1; }   // R occlusion, G roughness, B metalness
      if (m.height && ins.relief_mm) addParallax(mat, ld(m.height, false), ins.relief_mm * this.POM_K);
      // directional highlight along the fibres (owner's change 19.11.2026, cherry carbon: "the grey veins shimmer like metal"):
      // anisotropy map — R, G fibre direction, B strength (tools/cherry_carbon_from_image.py); the flakes lie at different angles and
      // light up in turn when rotating
      if (m.aniso) { mat.anisotropyMap = ld(m.aniso, false); mat.anisotropy = ins.look?.anisotropy ?? 0.8; }
      // look settings from the catalogue (owner's change 19.11.2026, twill carbon "less glossy, slightly more contrast"): lacquer and normal strength
      const lk = ins.look; if (lk) { if (lk.clearcoat != null) mat.clearcoat = lk.clearcoat; if (lk.clearcoat_roughness != null) mat.clearcoatRoughness = lk.clearcoat_roughness;
        if (lk.normal_scale) mat.normalScale.multiplyScalar(lk.normal_scale);
        if (lk.roughness != null) mat.roughness = lk.roughness;                         // multiplier on the roughness map (metal sheen)
        if (lk.specular != null) mat.specularIntensity = lk.specular; }                 // leather highlight strength (glossy leather as in the sample photo, 21.11.2026)
      return fin(mat);
    }
    if (!ins.tex) { mat.color.set(ins.hex || '#222'); return fin(mat); }
    const tex = (url, srgb) => { const key = url + (glb ? '/g' : '/m');
      if (!this.skCache[key]) { const t = new THREE.TextureLoader().load(texUrl(url), () => this.invalidate());
        if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; t.flipY = !glb; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; this.skCache[key] = t; }
      this.skTouch(key); return glb ? this.skCache[key] : this.skCache[key].clone(); };
    mat.map = tex(ins.tex, true); mat.color.set('#ffffff');
    // leather relief (owner's changes 08.11.2026: "volume", then "flat"): a normal map + parallax from a height map
    // (both — tools/bake_leather_relief.py from the same texture). Normals follow the v-up-the-image convention: for GLB (flipY = false) — y × −1
    if (ins.relief) {
      mat.normalMap = tex(ins.relief.replace('_h.avif', '_n.avif'), false); mat.normalScale.set(1, glb ? -1 : 1);
      addParallax(mat, tex(ins.relief, false), ins.relief_mm * this.POM_K);
    }
    // occlusion, roughness and metalness modelled on the designer's settings (tools/bake_leather_orm.py, 11.11.2026):
    // a single map <SK>_orm.avif — R occlusion, G roughness, B metalness (exactly how three.js reads them)
    if (ins.orm) { const t = tex(ins.orm, false); mat.aoMap = mat.roughnessMap = mat.metalnessMap = t; mat.roughness = mat.metalness = 1; }
    return fin(mat);
  }
  // insert asset: geometry for the window and the frame ledge (Z 1.0–2.5), the SK material is substituted on the TOP face
  async setInsert(modelId, fr, ins) {
    let wp = fr.window_panels ? ((this.st?.frame?.opts || {}).WP || '0') : '0';              // panels in the windows of the "Ring" frame
    if (fr.window_panels && wp === '0') wp = 'M' + (this.st?.frame?.metal || 'GD') + 'S';     // "no panels" removed (17.11.2026): the default is the frame metal, satin
    const key = fr.insert_asset ? `${fr.insert_asset}/${modelId}/${ins.id}/${wp}` : null;
    if (key === this.insertKey) return; this.insertKey = key;
    if (!key) { this.insert.clear(); this.panels.clear(); this.panelKey = null; return; }
    const file = `${fr.insert_asset}/${this.cat.models[modelId].base.split('/').pop()}`;
    this.insertCache[file] ??= this.loader.loadAsync(file).then(g => g.scene);
    const obj = await this.insertCache[file]; if (this.insertKey !== key) return;
    let top = null, edge = null; obj.traverse(o => { if (!o.isMesh) return; o.userData.role ??= o.material.name; o.userData.mat0 ??= o.material;
      if (o.userData.role === 'TOP') top = o; if (o.userData.role === 'EDGE') edge = o; });
    if (top) { const uv = top.geometry.attributes.uv; let u0 = 1e9, u1 = -1e9, v0 = 1e9, v1 = -1e9;
      if (uv) for (let i = 0; i < uv.count; i++) { const u = uv.getX(i), v = uv.getY(i); u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); }
      this.insertUvBox = uv ? [u0, u1, v0, v1] : null;   // the same cloth layout — for the panels' carbon (setPanels)
      const m = this.insertMaterial(ins, true, this.insertUvBox); m.name = 'TOP';
      // the previous face material is freed, the maps — per the cache bound (audit 18.11.2026, 1.6)
      if (this.insertTopMat && this.insertTopMat !== m) this.insertTopMat.dispose(); this.insertTopMat = m; this.skTrim();
      // panels (11.11.2026): in the chosen windows, instead of the insert material — metal (satin, diamond mesh, fluting along the outline) or carbon
      const pick = wp !== '0' ? this.panelWindows(modelId, fr, top) : null;
      // in the panel windows the insert is hidden, in its place — a panel with real relief (https://teatromisterio.github.io/Test-Constructor-iPhone-18-Pro/assets/inserts/<frame>_panels_<relief>, 07_Insert/source)
      const HIDE = this.hideMat ??= new THREE.MeshBasicMaterial({ visible: false });
      if (pick) { this.splitWindows(top, pick); top.material = [m, HIDE]; if (edge) { this.splitWindows(edge, pick); edge.material = [edge.userData.mat0, HIDE]; } }
      else { top.material = m; if (top.geometry.groups.length) top.geometry.clearGroups(); if (edge) { edge.material = edge.userData.mat0; edge.geometry.clearGroups(); } }
      this.setPanels(modelId, fr, pick ? wp : '0'); }
    if (obj.parent !== this.insert) { this.insert.clear(); this.insert.add(obj); }
  }
  // panels: WP = M<metal><S|D|F> — metal with vertical satin, diamond mesh or fluting along the outline (geometry),
  // C<T|F> — carbon (twill or forged) on a smooth panel. Asset materials: TOP — face, POLISH — fillets, MILL — grooves, EDGE — edge face
  async setPanels(modelId, fr, wp) {
    const kind = wp === '0' ? null : wp[0] === 'C' ? 'satin' : { S: 'satin', D: 'diamond', F: 'flute' }[wp[3] || 'S'];
    const key = kind ? `${fr.insert_asset}/${modelId}/${wp}` : null; if (key === this.panelKey) return; this.panelKey = key;
    if (!key) { this.panels.clear(); return; }
    const file = `${fr.insert_asset}_panels_${kind}/${this.cat.models[modelId].base.split('/').pop()}`;
    this.insertCache[file] ??= this.loader.loadAsync(file).then(g => g.scene);
    const src = await this.insertCache[file]; if (this.panelKey !== key) return;
    const obj = src.clone(); let mats;
    if (wp[0] === 'C') { const pm = this.panelMaterials(wp); mats = { TOP: pm.top, POLISH: pm.edge, MILL: pm.edge, EDGE: pm.edge }; }
    else { const mt = this.cat.metals.find(x => x.id === wp.slice(1, 3)) || this.cat.metals[0], col = new THREE.Color(mt.hex);
      const pol = r => new THREE.MeshStandardMaterial({ color: col, metalness: 1, roughness: r });
      mats = { TOP: kind === 'satin' ? this.insertMaterial({ type: 'metal', metal: mt.id }, true) : pol(0.12), POLISH: pol(0.1),
               MILL: new THREE.MeshStandardMaterial({ color: col.clone().multiplyScalar(0.62), metalness: 1, roughness: 0.38 }), EDGE: pol(0.2) }; }
    obj.traverse(o => { if (o.isMesh) { o.material = mats[o.material.name] || mats.EDGE; o.castShadow = o.receiveShadow = true; } });
    this.panels.clear(); this.panels.add(obj); this.invalidate(); }
  // insert windows: connected mesh islands (union-find over coincident vertices), triangles sorted by island — once per mesh
  windowIslands(mesh) { const g = mesh.geometry; if (g.userData.isl) return g.userData.isl;
    const P = g.attributes.position, I = g.index, N = P.count, par = Int32Array.from({ length: N }, (_, i) => i), f = x => { while (par[x] !== x) { par[x] = par[par[x]]; x = par[x]; } return x; };
    const key = new Map(); for (let i = 0; i < N; i++) { const k = `${Math.round(P.getX(i) * 1000)},${Math.round(P.getY(i) * 1000)},${Math.round(P.getZ(i) * 1000)}`; if (key.has(k)) par[f(i)] = f(key.get(k)); else key.set(k, i); }
    for (let t = 0; t < I.count; t += 3) { const a = f(I.getX(t)), b = f(I.getX(t + 1)), c = f(I.getX(t + 2)); par[b] = a; par[f(c)] = a; }
    const tris = []; for (let t = 0; t < I.count; t += 3) tris.push([f(I.getX(t)), I.getX(t), I.getX(t + 1), I.getX(t + 2)]); tris.sort((p, q) => p[0] - q[0]);
    const idx = new Uint32Array(I.count), isl = []; let cur = -1;
    tris.forEach(([r, a, b, c], k) => { if (r !== cur) { cur = r; isl.push({ start: 3 * k, count: 0, mn: [1e9, 1e9], mx: [-1e9, -1e9] }); } const s = isl[isl.length - 1]; s.count += 3; idx.set([a, b, c], 3 * k);
      for (const v of [a, b, c]) { const x = P.getX(v), y = P.getY(v); s.mn[0] = Math.min(s.mn[0], x); s.mn[1] = Math.min(s.mn[1], y); s.mx[0] = Math.max(s.mx[0], x); s.mx[1] = Math.max(s.mx[1], y); } });
    g.setIndex(new THREE.BufferAttribute(idx, 1)); g.userData.isl = isl; return isl; }
  // which windows take panels: the two upper side ones (above the ring centre, to its sides) and the lower central one (below the ring), as in the owner's sketch
  panelWindows(modelId, fr, top) { const m = this.cat.models[modelId], rs = fr.symbol_ring?.[modelId]; if (!rs) return null;
    const cy = m.H / 2 - rs.c[1], r = rs.d / 2, isl = this.windowIslands(top);
    const box = s => ({ cx: (s.mn[0] + s.mx[0]) / 2, cy: (s.mn[1] + s.mx[1]) / 2, h: s.mx[1] - s.mn[1], mn: s.mn, mx: s.mx });
    return isl.map(box).map((b, i) => (Math.abs(b.cx) > r * 0.6 && b.cy > cy && b.h < 40) || (Math.abs(b.cx) < 2 && b.mx[1] < cy - r) ? i : -1).filter(i => i >= 0)
      .map(i => ({ ...box(isl[i]) })).map(b => [b.mn, b.mx]); }
  // material groups: 0 — insert, 1 — panels (by matching window bounds)
  splitWindows(mesh, pick) { const isl = this.windowIslands(mesh), g = mesh.geometry; g.clearGroups();
    const hit = s => pick.some(([mn, mx]) => Math.abs(s.mn[0] - mn[0]) < 0.6 && Math.abs(s.mx[1] - mx[1]) < 0.6 && Math.abs(s.mx[0] - mx[0]) < 0.6);
    for (const s of isl) g.addGroup(s.start, s.count, hit(s) ? 1 : 0); }
  // panel materials: WP = M<metal><S|D|F> (vertical satin, diamond mesh, fluting along the outline) or C<T|F> (twill carbon, forged)
  panelMaterials(wp, top, pick) { this.panelCache ??= {};
    // insert carbon on the panels (owner's change 19.11.2026): WP = C<id> — the same material as the insert (maps, metal, highlight along
    // the fibres), in the same cloth layout as this frame's insert — the panel pattern continues the insert pattern
    const cIns = wp[0] === 'C' && wp.length > 2 ? this.cat.inserts.find(x => x.id === wp.slice(1) && x.type === 'carbon' && x.maps) : null;
    if (cIns) return { top: this.insertMaterial(cIns, true, this.insertUvBox), edge: new THREE.MeshPhysicalMaterial({ color: '#141416', roughness: 0.4, clearcoat: 1 }) };
    if (wp[0] === 'C') { if (wp[1] === 'F') {   // forged — the SK-24 photo (like the insert) + relief and gloss maps derived from it, the same as for the light customisation panel (14.11.2026)
        const m = this.forgedMaterial(this.cat.light.carbon.colors[0], 'glb');
        return { top: m, edge: new THREE.MeshPhysicalMaterial({ color: '#1a1a1c', roughness: 0.4, clearcoat: 1 }) }; }
      // 2 × 2 twill — the same texture as the "Twill" carbon of light customisation (owner's change 14.11.2026, ambientCG Fabric004, CC0):
      // normal and roughness maps, 36 mm tile; UVs of the panels and bezel — u = X / 71.7, v = Y / 165.3 (glTF UVs, flipY false)
      const tw = this.panelCache.twill ??= (() => { const TL = new THREE.TextureLoader();
        return ['normal', 'roughness'].map(n => { const x = TL.load(`https://teatromisterio.github.io/Test-Constructor-iPhone-18-Pro/assets/light_carbon/twill/${n}.avif`, () => this.invalidate());
          x.wrapS = x.wrapT = THREE.RepeatWrapping; x.flipY = false; x.anisotropy = 8; x.repeat.set(71.7 / 36, 165.3 / 36); return x; }); })();
      const m = new THREE.MeshPhysicalMaterial({ color: '#1d1d22', normalMap: tw[0], roughnessMap: tw[1], roughness: 1, metalness: 0.25, clearcoat: 1, clearcoatRoughness: 0.04 }); m.normalScale.set(1, -1);
      return { top: m, edge: new THREE.MeshPhysicalMaterial({ color: '#1a1a1c', roughness: 0.4, clearcoat: 1 }) }; }
    // metal — asset geometry (setPanels); below — the previous maps, only as a fallback path without the asset
    const metal = wp.slice(1, 3), fin = wp[3] || 'S', mt = this.cat.metals.find(x => x.id === metal) || this.cat.metals[0];
    const edge = new THREE.MeshStandardMaterial({ color: mt.hex, metalness: 1, roughness: 0.18 });
    if (fin === 'S') return { top: this.insertMaterial({ type: 'metal', metal }, true), edge };
    const m = new THREE.MeshPhysicalMaterial({ color: mt.hex, metalness: 1, roughness: fin === 'D' ? 0.2 : 0.24 });
    if (fin === 'D') m.normalMap = this.panelCache.diamond ??= (() => { const { H, w, h } = textureHeight('diamond', 71.7, 165.3); const x = new THREE.CanvasTexture(heightToNormal(H, w, h, 9)); x.flipY = false; x.anisotropy = 8; return x; })();
    else { const k = 'flute/' + pick.map(p => p.flat().map(v => v.toFixed(1)).join(',')).join(';');
      m.normalMap = this.panelCache[k] ??= (() => { const px = 12, W = Math.round(71.7 * px), Hh = Math.round(165.3 * px), c = document.createElement('canvas'); c.width = W; c.height = Hh;
        const g = c.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, W, Hh); g.fillStyle = '#fff';
        const G = top.geometry, UV = G.attributes.uv, I = G.index, isl = this.windowIslands(top);
        for (const s of isl) if (pick.some(([mn, mx]) => Math.abs(s.mn[0] - mn[0]) < 0.6 && Math.abs(s.mx[1] - mx[1]) < 0.6)) for (let t = s.start; t < s.start + s.count; t += 3) { g.beginPath();
          for (let q = 0; q < 3; q++) { const v = I.getX(t + q); g.lineTo(UV.getX(v) * W, UV.getY(v) * Hh); } g.closePath(); g.fill(); }
        const x = new THREE.CanvasTexture(contourFlutes(c, px, 0.8)); x.flipY = false; x.anisotropy = 8; return x; })(); }
    m.normalScale.set(1, -1); return { top: m, edge }; }
  // G10: loading (cached) and tone: the factory surface — the G10 colour, milled areas lighter and greyer (exposed fibreglass), the edge face slightly lighter
  async setG10(modelId, hex) {
    const key = `${modelId}/${hex}`; if (key === this.g10Key) return; this.g10Key = key;
    const file = `${this.cat.g10_asset}/${this.cat.models[modelId].base.split('/').pop()}`;
    this.g10Cache[file] ??= this.loader.loadAsync(file).then(g => g.scene);
    const obj = await this.g10Cache[file]; if (this.g10Key !== key) return;
    const c = new THREE.Color(hex);
    obj.traverse(o => { if (!o.isMesh) return; const n = o.material.name; if (n === 'ADHESIVE') return; o.material.color.copy(c);   // adhesive layer — always dark
      if (n === 'MILLED') o.material.color.multiplyScalar(0.82).addScalar(0.035);
      if (n === 'EDGE') o.material.color.multiplyScalar(0.9).addScalar(0.02); });
    if (obj.parent !== this.g10) { this.g10.clear(); this.g10.add(obj); }
  }
  // ---------- camera by step ----------
  // view of the engraved edge: l — the left edge (volume buttons, X+ in the rear view), r — the right one (X−)
  focusSide(s, ms = 900) { const m = this.m, se = this.cat.side_engraving; if (!m || !se) return; const [y0, y1] = se.zones[this.st.model][s], sg = s === 'l' ? 1 : -1;
    this.userMoved = false; this.lastView = t => this.focusSide(s, t); const x = sg * m.W / 2;                              // the whole engraving zone, with margins
    this.aim([new THREE.Vector3(x, y0 - 4, se.z - 5), new THREE.Vector3(x, y1 + 4, se.z - 5), new THREE.Vector3(x, y0 - 4, se.z + 5), new THREE.Vector3(x, y1 + 4, se.z + 5)], new THREE.Vector3(sg * 95, -12, 38), ms); }
  // packaging (14.11.2026, Caviar_Box_Standart/Package_template1.blend → https://teatromisterio.github.io/Test-Constructor-iPhone-18-Pro/assets/package/caviar_box.glb, tools/package_export.py):
  // the case with its cradle and the slipcase next to it, the small gold boxes are not included. The phone does not move — the case is placed so that the cradle
  // lies under the phone, back side up. The position in the cradle follows the source's placeholder phone (placeholder.001): the length axis is rotated
  // by 20° (in glTF axes: (cos 20°, 0, −sin 20°)), bounding box centre (53.5; 12.45; 2.8) mm, mid-thickness = the middle of the iPhone body (z −4.4)
  // the packaging rotates strictly horizontally (owner's change 14.11.2026): the orbit axis is the case's vertical (scene Z, the phone's back),
  // the camera tilt is locked after the fly-in, panning is off; outside packaging — the previous free orbit around Y
  orbitUp(on) { const c = this.controls, up = on ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0);
    if (this.camera.up.equals(up)) return; this.camera.up.copy(up);
    c._quat.setFromUnitVectors(up, new THREE.Vector3(0, 1, 0)); c._quatInverse.copy(c._quat).invert();
    if (!on) { c.minPolarAngle = 0; c.maxPolarAngle = Math.PI; c.enablePan = true; } }
  lockPolar() { const c = this.controls, a = this.camera.position.clone().sub(c.target).angleTo(this.camera.up);   // tilt from the camera position (getPolarAngle is from the previous frame)
    c.minPolarAngle = c.maxPolarAngle = a; c.enablePan = false; }
  // packaging choice (16.11.2026): cat.packs[st.pack] — its own .glb and maps by material name (maps), materials on the second UV set (uv1),
  // gold (gold) and flat materials without maps (flat). All packaging uses one template, Package_template1: the seating and the lid hinge are shared
  showPack(on) {
    this.pack.visible = on; this.controls.maxDistance = on ? 2200 : 1100; this.orbitUp(on);
    if (!on) return this.packReady;
    const PK = this.cat.packs || [{ id: '0', asset: 'https://teatromisterio.github.io/Test-Constructor-iPhone-18-Pro/assets/package/caviar_box.glb', maps: { Leather_black: 'leather', Schuber_Black: 'shuber', Mat_insaide: 'inside' }, gold: ['Gold'] }];
    const pk = PK.find(x => x.id === this.st?.pack) || PK[0];
    if (this.packId === pk.id && this.packReady) return this.packReady;
    this.packId = pk.id;
    if (!this.packR) {
      const a = 20 * Math.PI / 180, L = new THREE.Vector3(Math.cos(a), 0, -Math.sin(a)), U = new THREE.Vector3(0, 1, 0), Lat = new THREE.Vector3().crossVectors(L, U);
      const R = new THREE.Matrix4().makeBasis(Lat, L, U).transpose(), C = new THREE.Vector3(53.48, 12.45, 2.80).applyMatrix4(R);
      const M = new THREE.Matrix4().makeTranslation(-C.x, -C.y, -4.375 - C.z).multiply(R).multiply(new THREE.Matrix4().makeScale(1000, 1000, 1000));
      this.pack.matrix.copy(M); this.packR = R; }
    this.packCache = this.packCache || {};
    const load = this.packCache[pk.id] || (this.packCache[pk.id] = this.loader.loadAsync(pk.asset).then(g => {
      // material maps — as separate WEBP files (tools/package_maps.py, tools/package15_maps.py); gold — the colour from the source's nodes
      const TL = new THREE.TextureLoader(), tx = (n, srgb, ch) => { const x = TL.load(`https://teatromisterio.github.io/Test-Constructor-iPhone-18-Pro/assets/package/${n}.avif`); x.flipY = false; x.anisotropy = 8; if (ch) x.channel = ch; if (srgb) x.colorSpace = THREE.SRGBColorSpace; return x; };
      const KEY = pk.maps || {}, GAIN = pk.gain || {}, UV1 = new Set(pk.uv1 || []),   // gain — material brightness on top of the map, bypassing tone mapping (the white case "looks grey", 16.11.2026; like the insert leather — LEATHER_GAIN)
       GOLD = new Set(pk.gold || []), FLAT = pk.flat || {}, done = {};
      g.scene.traverse(o => { if (!o.isMesh) return; o.castShadow = false; o.receiveShadow = true;
        const m = o.material, k = KEY[m.name];
        if (k && !done[m.name]) { done[m.name] = 1; const ch = UV1.has(m.name) ? 1 : 0;
          m.map = tx(k + '_base', true, ch); m.normalMap = tx(k + '_normal', false, ch); m.roughnessMap = m.metalnessMap = tx(k + '_orm', false, ch);
          m.color.set('#ffffff'); if (GAIN[m.name]) { m.color.setScalar(GAIN[m.name]); m.toneMapped = false; } m.roughness = 1; m.metalness = 1; m.envMap = this.envSoft; m.needsUpdate = true; }
        if (FLAT[m.name] && !done[m.name]) { done[m.name] = 1; m.color.set(FLAT[m.name][0]); m.roughness = FLAT[m.name][1]; m.metalness = 0; m.envMap = this.envSoft; m.needsUpdate = true; }
        if (GOLD.has(m.name) && !done[m.name]) { done[m.name] = 1; m.color.setRGB(1, 0.62, 0.33); m.metalness = 1; m.roughness = 0.22; } });
      // case lid (14.11.2026): the source's hinge node Empty.001 — open at −90° about its own X, closed at 0° (measured in Blender:
      // at 0° the lid lies exactly on the body). The position is stored as a pair of quaternions, the animation — setLid()
      const lid = g.scene.getObjectByName('Empty001') || g.scene.getObjectByName('Empty.001');
      const lidOpen = lid ? lid.quaternion.clone() : null, lidClosed = lid ? lidOpen.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2)) : null;
      return { scene: g.scene, lid, lidOpen, lidClosed }; }));
    return this.packReady = load.then(P => {
      if (this.packId !== pk.id) return true;                                     // another packaging was chosen while loading
      for (const c of [...this.pack.children]) this.pack.remove(c);
      this.pack.add(P.scene); this.lid = P.lid; this.lidOpen = P.lidOpen; this.lidClosed = P.lidClosed; this.lidAnim = null;
      this.pack.updateMatrixWorld(true); this.packBox = new THREE.Box3().setFromObject(this.pack);
      if (this.lid) this.setLid(!!this.lidWant, true); this.invalidate?.(); return true; });
  }
  // navigation panel in the viewport (16.11.2026, owner's change "not everyone will realise the smartphone can be moved with Shift — a
  // button or navigation is needed"): the mode of the left mouse button and one finger — rotate or pan; zoom in/out; reset the view.
  // Shift, the right mouse button and two fingers work as before
  setNav(mode) { const c = this.controls, pan = mode === 'pan';
    c.mouseButtons.LEFT = pan ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE; c.touches.ONE = pan ? THREE.TOUCH.PAN : THREE.TOUCH.ROTATE; this.navMode = mode; }
  zoomBy(f) { const c = this.controls, cam = this.camera, off = cam.position.clone().sub(c.target), d = this.zoomGoal ?? off.length();   // consecutive clicks add up
    const nd = Math.min(c.maxDistance, Math.max(c.minDistance, d * f)); if (Math.abs(nd - off.length()) < 1e-3) return;
    this.userMoved = true; this.zoomGoal = nd; const id = this.zoomId = (this.zoomId || 0) + 1, from = off.length(), t0 = performance.now(), ms = 260;
    const step = () => { if (id !== this.zoomId) return; const k = Math.min(1, (performance.now() - t0) / ms), e = 1 - (1 - k) ** 3;
      const o2 = cam.position.clone().sub(c.target); cam.position.copy(c.target).add(o2.setLength(from + (nd - from) * e)); c.update(); this.invalidate();
      if (k < 1) requestAnimationFrame(step); else this.zoomGoal = null; };
    requestAnimationFrame(step); }
  resetView() { this.userMoved = false; if (this.lastView) this.lastView(700); }
  setLid(closed, now) { this.lidWant = closed; if (!this.lid) return;
    const to = closed ? this.lidClosed : this.lidOpen; if (now) { this.lid.quaternion.copy(to); return; }
    this.lidAnim = { t0: performance.now(), ms: 1200, from: this.lid.quaternion.clone(), to }; }
  packView() { const b = this.packBox; if (!b) return null; const q = b.getCenter(new THREE.Vector3()), r = b.getSize(new THREE.Vector3()).length() / 2;
    const d = new THREE.Vector3(-0.12, -0.42, 0.9).normalize();                                        // from above, from the phone's bottom side — the case and the slipcase are visible
    void r; const pts = [0, 1, 2, 3, 4, 5, 6, 7].map(i => new THREE.Vector3(i & 1 ? b.max.x : b.min.x, i & 2 ? b.max.y : b.min.y, i & 4 ? b.max.z : b.min.z));
    return { pts, dir: d }; }
  focus(step, ms) {
    this.userMoved = false; this.lastView = t => this.focus(step, t);
    if (step === 'pack') { this.showPack(true).then(() => { const v = this.packView(); if (v) this.aim(v.pts, v.dir, ms ?? 1100, () => this.lockPolar()); }); return; }
    this.showPack(false);
    if (step === 'side') return this.focusSide((this.st.side?.r || '').trim() && !(this.st.side?.l || '').trim() ? 'r' : 'l', ms);
    const m = this.m; if (!m) return; const X = x => x - m.W / 2, Y = y => m.H / 2 - y; const win = this.win, st = this.st;
    // step zone — a rectangle in back-panel mm (x to the right, y down), z — height above the back; the screen is at z −8.7
    const rect = (x0, y0, x1, y1, z0 = 1, z1 = z0) => [z0, z1].flatMap(z => [[x0, y0], [x1, y0], [x0, y1], [x1, y1]].map(([x, y]) => new THREE.Vector3(X(x), Y(y), z)));
    const A = (ax = 0, ay = 0) => new THREE.Vector3(Math.sin(ax), Math.sin(ay), Math.cos(ax) * Math.cos(ay));   // direction to the camera: sideways and upward angles
    const phone = rect(0, 0, m.W, m.H, 3, -8.7), [px0, py0, px1, py1] = m.plate, sy = st.symbol, pq = st.plaque;
    const around = (cx, cy, hw, hh) => rect(cx - hw, cy - hh, cx + hw, cy + hh, 2);
    const views = {
      ready: [phone, A(0.14, 0.05)],                                                   // build examples: the whole back, almost head-on
      model: [phone, A(0.65, 0.12)],
      body: [phone, A(-0.9, 0.05)],
      g10: [rect(m.W - 46, m.H - 72, m.W + 2, m.H - 2, 0), A(0.9, -0.2)],
      plate: [rect(px0 - 8, py0 - 8, px1 + 8, py1 + 8, 2), A(0.25, 0.25)],
      frame: [phone, A(0.12, -0.08)],                                                  // frame — always the whole frame (owner's decision 15.11.2026: no zoom in on the camera plate)
      insert: [rect(win.x0 - 10, win.y0 - 10, win.x1 + 10, win.y1 + 10), A()],
      screen: [phone, new THREE.Vector3(-90, 30, -321)],                               // wallpaper: view of the screen
      panel: [phone, A(0.18, 0.06)],                                                   // light customisation: the back panel, slightly from the side — the play of the metal is visible
      symbol: sy.id !== '0' ? [around(win.cx + sy.x, win.cy + sy.y, Math.max(30, sy.d * 1.1), Math.max(30, sy.d * 1.1)), A(0.15, 0.1)] : [rect(win.x0 - 6, win.y0 - 6, win.x1 + 6, win.y1 + 6), A()],
      plaque: pq.id !== '0' ? [around(win.cx + pq.x, win.cy + pq.y, Math.max(30, (pq.w || 40) * 0.75), 24), A(0.1, 0.12)] : [rect(win.x0, win.y1 - 60, win.x1, win.y1 + 4), A()],
      summary: [phone, A()],
    };
    const v = views[step] || views.summary;
    this.aim(v[0], v[1], ms ?? 900);
  }
  // snapshots for the specification (owner's change 15.11.2026 "the render must not sink into dark areas, all the details must be
  // visible, as well as the two side edges"). The snapshot is drawn through the main canvas (audit, stage 8, B5): the same tone mapping as in
  // the viewport. The background is transparent — the backdrop is drawn by the specification.
  // Why the front was dark: in an orthographic snapshot every flat metal face reflects a single point — directly behind the camera, and the
  // viewport studio has a dark "window" there (front.hole: so that polished surfaces are not a solid mirror of the screen when rotating). For snapshots —
  // a dedicated studio: a front screen without the window and with a raised bottom, the metal is light and its texture reads. Non-metals (leather, G10,
  // glass) — as in the viewport. The side edges are shot with the same camera: the phone is rotated ±90° towards the same studio.
  // views: ['back', 'left', 'right'] → { back, left, right } at one scale (h — the phone height in pixels without margins)
  snapshots(h = 1020, views = ['back', 'left', 'right']) {
    const r = this.renderer, m = this.m, MARGIN = 6, k = h / (m.H + MARGIN * 2), out = {};
    this.envSpec ??= studioEnvironment(r, { front: { hole: 0, hi: 2.6, lo: 0.55, gamma: 1.3, w: 70, h: 40 } });
    const pr = r.getPixelRatio(), pack = this.pack.visible, env0 = this.scene.environment, swapped = [];
    // all the phone parts (groups at the scene root, except the packaging) go into a temporary group: rotating it shows the side edge
    const parts = this.scene.children.filter(o => o.isGroup && o !== this.pack), spin = new THREE.Group(); this.scene.add(spin); parts.forEach(o => spin.attach(o));
    this.pack.visible = false; this.scene.environment = this.envSpec;
    this.scene.traverse(studioize(this.envSoft));
    this.scene.traverse(o => { if (!o.isMesh) return; for (const mt of [].concat(o.material)) if (mt && !mt.isMeshBasicMaterial && (mt.metalness ?? 0) >= 0.5 && mt.envMap !== this.envSpec) { swapped.push([mt, mt.envMap]); mt.envMap = this.envSpec; mt.needsUpdate = true; } });
    r.setPixelRatio(1);
    const box = new THREE.Box3();
    for (const v of views) {
      spin.rotation.y = v === 'left' ? -Math.PI / 2 : v === 'right' ? Math.PI / 2 : 0;   // left — the edge with the "left edge" engraving spin.updateMatrixWorld(true);
      box.setFromObject(spin); const x0 = box.min.x - MARGIN, x1 = box.max.x + MARGIN, y0 = -m.H / 2 - MARGIN, y1 = m.H / 2 + MARGIN;
      const cam = new THREE.OrthographicCamera(x0, x1, y1, y0, 1, 2000); cam.position.set(0, 0, 500);
      const rw = Math.max(8, Math.round((x1 - x0) * k)), rh = Math.round((y1 - y0) * k);
      r.setSize(rw, rh, false); r.render(this.scene, cam);
      const c = document.createElement('canvas'); c.width = rw; c.height = rh; c.getContext('2d').drawImage(r.domElement, 0, 0); out[v] = c;
    }
    for (const [mt, e] of swapped) { mt.envMap = e; mt.needsUpdate = true; }
    spin.rotation.y = 0; spin.updateMatrixWorld(true); parts.forEach(o => this.scene.attach(o)); this.scene.remove(spin); this.scene.environment = env0; this.pack.visible = pack;
    r.setPixelRatio(pr); this.resize(); this.invalidate();
    return out;
  }
  snapshot(w = 900, h = 1600) { const m = this.m; return this.snapshots(Math.min(h, w * (m.H + 12) / (m.W + 12)), ['back']).back; }
}

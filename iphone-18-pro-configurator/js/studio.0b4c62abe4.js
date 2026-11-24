// Viewport studio: an environment for metal reflections (like product photography on a dark background).
// Metal is barely lit by lamps — it reflects the environment. So the textures (satin, milling, polishing)
// read only if the environment has bright softboxes on a dark background: the highlight runs along the strokes on rotation.
// The environment is assembled from simple planes and baked into PMREM once (no HDR files needed).
// Axes as in the scene: the phone's back faces +Z, the viewer is at +Z by default.
//
// Owner's change 08.11.2026 «in the front view the smartphone is flat, gold does not look like gold».
// Cause: a flat back viewed strictly from the front reflects what is behind the camera, and there was a dark dome there —
// the softboxes stood at 45° and only hit the edges. The metal reflected darkness and drifted into brown.
// The studio is set up as for jewellery photography:
//  • a front screen behind the camera with a vertical gradient (light top → dark bottom): the metal's flat surfaces
//    get a light reflection with a falloff — metal reads as metal, gold as gold, the back as a volume;
//  • dark flags at the sides of the screen: the frame's chamfers and fillets reflect light and blackness in turn — crisp edges;
//  • side strips and the top softbox — highlights on edges and rings on rotation (as before).
import * as THREE from 'three';

const DEF = {
  front: { w: 60, h: 26, pos: [0, 0, 46], hi: 3.4, lo: 0.03, gamma: 2.0, hole: 4.5 },   // screen behind the camera
  key: 7.0, rim: 3.5, top: 3.0, bottom: 1.2, back: 1.5, dome: [0.03, 0.14],
};

export function studioEnvironment(renderer, opt = {}) {
  const o = { ...DEF, ...opt, front: { ...DEF.front, ...(opt.front || {}) } };
  const s = new THREE.Scene();
  // dark dome: almost black at the bottom, slightly lighter towards the top — soft fill without grey «plastic»
  const dome = new THREE.Mesh(new THREE.SphereGeometry(60, 48, 24), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, uniforms: { A: { value: o.dome[0] }, B: { value: o.dome[1] } },
    vertexShader: 'varying vec3 p; void main(){ p = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
    fragmentShader: 'uniform float A, B; varying vec3 p; void main(){ float t = smoothstep(-0.4, 0.9, p.y); gl_FragColor = vec4(vec3(mix(A, B, t)), 1.); }',
  }));
  s.add(dome);
  // softbox: a plane with a soft falloff towards the edges, brightness > 1 (HDR) — this is what gives the highlight on metal
  const box = (w, h, pos, intensity, soft = 0.25) => {
    if (!intensity) return;
    const m = new THREE.ShaderMaterial({ side: THREE.DoubleSide, uniforms: { I: { value: intensity }, S: { value: soft } },
      vertexShader: 'varying vec2 u; void main(){ u = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
      fragmentShader: 'uniform float I, S; varying vec2 u; void main(){ vec2 d = min(u, 1.-u); float e = smoothstep(0., S, d.x) * smoothstep(0., S * .3, d.y); gl_FragColor = vec4(vec3(I * e), 1.); }' });
    const q = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m); q.position.set(...pos); q.lookAt(0, 0, 0); s.add(q); return q;
  };
  // front screen: vertical gradient, soft falloff towards the sides (beyond the edges — the dark flags of the dome)
  const f = o.front;
  if (f.hi) {
    const m = new THREE.ShaderMaterial({ side: THREE.DoubleSide, uniforms: { H: { value: f.hi }, L: { value: f.lo }, G: { value: f.gamma }, R: { value: f.hole }, D: { value: new THREE.Vector2(f.w, f.h) } },
      vertexShader: 'varying vec2 u; void main(){ u = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
      fragmentShader: 'uniform float H, L, G, R; uniform vec2 D; varying vec2 u; void main(){ float x = min(u.x, 1.-u.x); float e = smoothstep(0., .28, x) * smoothstep(0., .06, min(u.y, 1.-u.y));' +
        ' float k = R > 0. ? smoothstep(R, R * 1.7, length((u - .5) * D)) : 1.;' +
        ' gl_FragColor = vec4(vec3(mix(L, H, pow(u.y, G)) * e * k), 1.); }' });
    const q = new THREE.Mesh(new THREE.PlaneGeometry(f.w, f.h), m); q.position.set(...f.pos); q.lookAt(0, 0, 0); s.add(q);
  }
  box(7, 40, [-26, 14, 26], o.key);         // key: a tall strip top-left behind the viewer — highlight across the satin and the left chamfers
  box(5, 36, [30, 4, 18], o.rim);           // rim light on the right — highlight on the right chamfers and rings
  box(26, 14, [0, 38, 8], o.top, 0.35);     // top softbox — light top of chamfers and edges
  box(36, 3.5, [0, -14, 30], o.bottom);     // bottom strip — a thin line on the bottom edges
  box(8, 30, [-30, 0, -26], o.back);        // back left — for when the phone is turned screen-forward
  const pm = new THREE.PMREMGenerator(renderer);
  const env = pm.fromScene(s, 0.02, 0.1, 200).texture; pm.dispose();
  s.traverse(x => { x.geometry?.dispose(); x.material?.dispose(); });
  return env;
}

// ============================================================
//  ROLL RUSH — a 3D marble-rolling arcade game (three.js)
// ============================================================
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { EffectComposer } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/postprocessing/OutputPass.js';

const $ = (id) => document.getElementById(id);
const rand = (a, b) => a + Math.random() * (b - a);
const RI = (a, b) => Math.floor(rand(a, b + 1));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const pick = (a) => a[Math.floor(Math.random() * a.length)];

let best = 0;
try {
  best = parseInt(localStorage.getItem('rollrush-best') || '0', 10) || 0;
} catch (e) {}
const saveBest = () => {
  try {
    localStorage.setItem('rollrush-best', String(best));
  } catch (e) {}
};

// ---------- Audio (short effects only) ----------
let ac = null,
  muted = false;
function initAudio() {
  if (!ac) {
    try {
      ac = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) {}
  }
  if (ac && ac.state === 'suspended') ac.resume();
}
function beep(f, d = 0.1, type = 'triangle', v = 0.05, slide = 0, delay = 0) {
  if (!ac || muted) return;
  const t = ac.currentTime + delay,
    o = ac.createOscillator(),
    g = ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  if (slide)
    o.frequency.exponentialRampToValueAtTime(Math.max(40, f + slide), t + d);
  g.gain.setValueAtTime(v, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  o.connect(g).connect(ac.destination);
  o.start(t);
  o.stop(t + d);
}
const sfx = {
  gem: (n) => {
    beep(880 + n * 60, 0.09);
    beep(1320 + n * 60, 0.14, 'triangle', 0.05, 0, 0.06);
  },
  jump: () => beep(300, 0.16, 'square', 0.03, 300),
  land: () => beep(110, 0.08, 'sine', 0.08, -40),
  bump: () => beep(200, 0.12, 'square', 0.05, 200),
  pad: () => beep(260, 0.3, 'sawtooth', 0.04, 700),
  fall: () => beep(500, 0.6, 'sawtooth', 0.05, -420),
  clear: () =>
    [523, 659, 784, 1047].forEach((f, i) =>
      beep(f, 0.18, 'triangle', 0.06, 0, i * 0.09)
    ),
  over: () => {
    beep(400, 0.5, 'square', 0.05, -300);
    beep(260, 0.7, 'square', 0.05, -200, 0.3);
  },
};

// ---------- Three.js setup ----------
const canvas = $('game');
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: 'high-performance',
});
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b0830);
scene.fog = new THREE.Fog(0x0b0830, 40, 150);
const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 400);
scene.add(new THREE.HemisphereLight(0x9fb8ff, 0x24104a, 1.0));
const sun = new THREE.DirectionalLight(0xffffff, 1.3);
sun.position.set(8, 22, 12);
scene.add(sun);
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.5, 0.5, 0.72);
composer.addPass(bloom);
composer.addPass(new OutputPass());
function resize() {
  const w = innerWidth,
    h = innerHeight;
  renderer.setSize(w, h, false);
  composer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

// stars
const stars = (() => {
  const n = 500,
    p = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2,
      e = Math.random() * 1.2 + 0.05,
      r = 180 + Math.random() * 40;
    p[i * 3] = Math.cos(a) * Math.cos(e) * r;
    p[i * 3 + 1] = Math.sin(e) * r * 0.9;
    p[i * 3 + 2] = Math.sin(a) * Math.cos(e) * r;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(p, 3));
  const m = new THREE.Points(
    g,
    new THREE.PointsMaterial({
      color: 0xffffff,
      size: 1.6,
      sizeAttenuation: false,
      fog: false,
    })
  );
  scene.add(m);
  return m;
})();

const PALS = [
  {
    base: '#241a63',
    line: '#5b4bd6',
    edge: 0x22d3ee,
    sky: 0x0b0830,
    acc: 0x22d3ee,
  },
  {
    base: '#4a1a52',
    line: '#c040a0',
    edge: 0xff3ea5,
    sky: 0x1a0630,
    acc: 0xff3ea5,
  },
  {
    base: '#0f3d4a',
    line: '#26a69a',
    edge: 0x34d399,
    sky: 0x04202a,
    acc: 0x34d399,
  },
  {
    base: '#4a3210',
    line: '#c98a2a',
    edge: 0xffc83a,
    sky: 0x1f1204,
    acc: 0xffc83a,
  },
];
let pal = PALS[0];
function gridTexture(p) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = p.base;
  x.fillRect(0, 0, 128, 128);
  x.fillStyle = 'rgba(255,255,255,0.04)';
  x.fillRect(0, 0, 64, 64);
  x.fillRect(64, 64, 64, 64);
  x.strokeStyle = p.line;
  x.lineWidth = 4;
  x.strokeRect(2, 2, 124, 124);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
let topTex = gridTexture(pal);

// ball
const R = 0.5;
const ballTex = (() => {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = '#e9fbff';
  x.fillRect(0, 0, 256, 128);
  for (let i = 0; i < 8; i++) {
    x.fillStyle = i % 2 ? '#22d3ee' : '#ff3ea5';
    x.fillRect(i * 32, 0, 16, 128);
  }
  x.fillStyle = 'rgba(0,0,0,.18)';
  x.fillRect(0, 56, 256, 16);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
})();
const ball = new THREE.Mesh(
  new THREE.SphereGeometry(R, 32, 24),
  new THREE.MeshStandardMaterial({
    map: ballTex,
    roughness: 0.22,
    metalness: 0.25,
    emissive: 0x112244,
    emissiveIntensity: 0.6,
  })
);
scene.add(ball);
const blob = new THREE.Mesh(
  new THREE.CircleGeometry(0.62, 20),
  new THREE.MeshBasicMaterial({
    color: 0x000000,
    transparent: true,
    opacity: 0.4,
    depthWrite: false,
  })
);
blob.rotation.x = -Math.PI / 2;
scene.add(blob);

// shared geos
const gemGeo = new THREE.OctahedronGeometry(0.36),
  gemMat = new THREE.MeshStandardMaterial({
    color: 0xffd23f,
    emissive: 0xffa800,
    emissiveIntensity: 1.1,
    roughness: 0.2,
    metalness: 0.5,
  });
const bumpGeo = (r) => new THREE.CylinderGeometry(r, r, 1.4, 20),
  bumpMat = new THREE.MeshStandardMaterial({
    color: 0xff3ea5,
    emissive: 0xff3ea5,
    emissiveIntensity: 0.3,
    roughness: 0.25,
    metalness: 0.2,
  });
const padMat = new THREE.MeshStandardMaterial({
  color: 0x22d3ee,
  emissive: 0x22d3ee,
  emissiveIntensity: 1.2,
});
const spinMat = new THREE.MeshStandardMaterial({
  color: 0xffb020,
  emissive: 0xff7a00,
  emissiveIntensity: 0.8,
  roughness: 0.35,
});

// particles
const PN = 220,
  pPos = new Float32Array(PN * 3),
  pVel = new Float32Array(PN * 3),
  pLife = new Float32Array(PN);
const pGeo = new THREE.BufferGeometry();
pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
const dotTex = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(16, 16, 0, 16, 16, 16);
  g.addColorStop(0, '#fff');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(c);
})();
const pts = new THREE.Points(
  pGeo,
  new THREE.PointsMaterial({
    map: dotTex,
    color: 0xffe680,
    size: 0.3,
    transparent: true,
    opacity: 0.95,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  })
);
pts.frustumCulled = false;
scene.add(pts);
for (let i = 0; i < PN; i++) pPos[i * 3 + 1] = -999;
let pHead = 0;
function burst(x, y, z, n, spd = 4, col) {
  if (col) pts.material.color.setHex(col);
  for (let k = 0; k < n; k++) {
    const i = pHead++ % PN;
    pPos.set([x, y, z], i * 3);
    pVel.set([rand(-spd, spd), rand(0, spd * 1.2), rand(-spd, spd)], i * 3);
    pLife[i] = rand(0.4, 0.9);
  }
}

// ---------- World ----------
const W = {
  plats: [],
  bumps: [],
  spins: [],
  gems: [],
  pads: [],
  segs: [],
  front: 0,
  y: 0,
  x: 0,
  done: false,
  finish: null,
  nSeg: 0,
  made: 0,
};
let level = 1,
  t = 0;
function platMesh(p) {
  const g = new THREE.Group();
  const len = p.ramp ? Math.hypot(p.l, p.ramp[1] - p.ramp[0]) : p.l;
  const geo = new THREE.BoxGeometry(p.w, 1, len);
  const tt = topTex.clone();
  tt.needsUpdate = true;
  tt.repeat.set(Math.max(1, p.w / 3), Math.max(1, len / 3));
  const side = new THREE.MeshStandardMaterial({
    color: new THREE.Color(pal.base).multiplyScalar(0.7),
    roughness: 0.7,
  });
  const top = new THREE.MeshStandardMaterial({
    map: tt,
    roughness: 0.55,
    metalness: 0.1,
    emissive: 0xffffff,
    emissiveMap: tt,
    emissiveIntensity: 0.55,
  });
  const m = new THREE.Mesh(geo, [side, side, top, side, side, side]);
  m.position.y = -0.5;
  g.add(m);
  const e = new THREE.LineSegments(
    new THREE.EdgesGeometry(geo),
    new THREE.LineBasicMaterial({ color: pal.edge })
  );
  e.position.y = -0.5;
  g.add(e);
  g.userData = { geo, tt, mats: [side, top], edge: e };
  return g;
}
function topAt(p, z) {
  if (!p.ramp) return p.top;
  const k = clamp((p.cz + p.l / 2 - z) / p.l, 0, 1);
  return lerp(p.ramp[0], p.ramp[1], k);
}
function addPlat(cx, top, front, w, l, o = {}) {
  const p = {
    cx,
    cx0: cx,
    top,
    cz: front - l / 2,
    w,
    l,
    ramp: o.ramp || null,
    move: o.move || null,
    dx: 0,
  };
  p.mesh = platMesh(p);
  if (p.ramp) {
    const dy = p.ramp[1] - p.ramp[0];
    p.mesh.rotation.x = Math.atan2(dy, p.l);
    p.mesh.position.set(cx, (p.ramp[0] + p.ramp[1]) / 2, p.cz);
  } else p.mesh.position.set(cx, top, p.cz);
  scene.add(p.mesh);
  W.plats.push(p);
  return p;
}
function addGem(x, y, z) {
  const m = new THREE.Mesh(gemGeo, gemMat);
  m.position.set(x, y, z);
  scene.add(m);
  W.gems.push({ x, y, z, mesh: m, got: false });
}
function gemLine(x, y, z0, z1, n) {
  for (let i = 0; i < n; i++)
    addGem(x, y, lerp(z0, z1, n === 1 ? 0.5 : i / (n - 1)));
}
function addBumper(x, top, z, r) {
  const m = new THREE.Mesh(bumpGeo(r), bumpMat);
  m.position.set(x, top + 0.7, z);
  scene.add(m);
  W.bumps.push({ x, z, r, top, mesh: m });
}
function addSpinner(x, top, z, len, spd) {
  const g = new THREE.Group();
  const bar = new THREE.Mesh(new THREE.BoxGeometry(len, 0.5, 0.5), spinMat);
  bar.position.y = 0.55;
  const hub = new THREE.Mesh(
    new THREE.CylinderGeometry(0.5, 0.6, 1.1, 16),
    spinMat
  );
  hub.position.y = 0.55;
  g.add(bar, hub);
  g.position.set(x, top, z);
  scene.add(g);
  W.spins.push({ x, z, top, len, spd, a: rand(0, 6), mesh: g });
}
function addPad(x, top, z) {
  const m = new THREE.Mesh(
    new THREE.CylinderGeometry(1.1, 1.1, 0.12, 24),
    padMat
  );
  m.position.set(x, top + 0.06, z);
  scene.add(m);
  W.pads.push({ x, z, top, mesh: m, cd: 0 });
}

const mk = () => ({ w: level < 3 ? 6 : 5 });
const gapSize = () => Math.min(6, 2.6 + level * 0.35 + rand(0, 0.8));
const SEG = {
  straight() {
    const l = rand(14, 20),
      w = pick([6, 7]);
    const x = W.x,
      f = W.front;
    addPlat(x, W.y, f, w, l);
    gemLine(x + rand(-1, 1), W.y + 0.9, f - 2, f - l + 2, RI(4, 7));
    W.front -= l;
    W.x = clamp(W.x + rand(-1.4, 1.4), -4, 4);
  },
  gaps() {
    const n = RI(3, 4);
    for (let i = 0; i < n; i++) {
      const g = gapSize();
      W.front -= g;
      const l = i === n - 1 ? 7 : RI(4, 6),
        w = mk().w;
      const x = clamp(W.x + rand(-1.4, 1.4), -4, 4);
      addPlat(x, W.y, W.front, w, l);
      addGem(x, W.y + 1.3, W.front - l / 2);
      gemLine(x, W.y + 2.6, W.front + g + 0.6, W.front + 0.6, 0);
      W.front -= l;
      W.x = x;
    }
  },
  beam() {
    const l = rand(16, 22);
    const x = W.x,
      f = W.front;
    addPlat(x, W.y, f, 2.4, l);
    gemLine(x, W.y + 0.9, f - 2, f - l + 2, 6);
    W.front -= l;
    const l2 = 6;
    addPlat(x, W.y, W.front, 6, l2);
    W.front -= l2;
  },
  zigzag() {
    const n = RI(4, 5);
    let dir = Math.random() < 0.5 ? -1 : 1;
    for (let i = 0; i < n; i++) {
      W.front -= i ? 1.6 : 0;
      const x = clamp(W.x + dir * 3.2, -6, 6);
      addPlat(x, W.y, W.front, 3.6, 6);
      addGem(x, W.y + 0.9, W.front - 3);
      W.front -= 6;
      W.x = x;
      dir *= -1;
    }
    const x = W.x;
    addPlat(x, W.y, W.front, 6, 6);
    W.front -= 6;
  },
  moving() {
    const n = 3;
    addPlat(W.x, W.y, W.front, 6, 4);
    W.front -= 4;
    for (let i = 0; i < n; i++) {
      W.front -= 3.2;
      const A = 3.2,
        sp = rand(0.9, 1.5) + level * 0.06;
      const p = addPlat(W.x, W.y, W.front, 4.6, 5, {
        move: { A, sp, ph: rand(0, 6) },
      });
      addGem(W.x, W.y + 1, W.front - 2.5);
      W.front -= 5;
    }
    W.front -= 3.2;
    addPlat(W.x, W.y, W.front, 6, 6);
    W.front -= 6;
  },
  ramp() {
    const rise = W.y > 2.5 ? -3 : 3;
    const l = 12;
    const y0 = W.y,
      y1 = W.y + rise;
    addPlat(W.x, y0, W.front, 6, 4);
    W.front -= 4;
    const p = addPlat(W.x, y0, W.front, 6, l, { ramp: [y0, y1] });
    gemLine(
      W.x,
      Math.min(y0, y1) + 1.5 + Math.abs(rise) / 2,
      W.front - 2,
      W.front - l + 2,
      4
    );
    W.front -= l;
    W.y = y1;
    addPlat(W.x, W.y, W.front, 6, 8);
    W.front -= 8;
  },
  bumpers() {
    const l = 18,
      f = W.front,
      x = W.x;
    addPlat(x, W.y, f, 10, l);
    const n = RI(4, 6);
    for (let i = 0; i < n; i++)
      addBumper(
        x + rand(-3.4, 3.4),
        W.y,
        f - 3 - (i / n) * (l - 6) - rand(0, 1.5),
        rand(0.7, 1.1)
      );
    gemLine(x, W.y + 0.9, f - 2, f - l + 2, 6);
    W.front -= l;
  },
  spinner() {
    const l = 16,
      f = W.front,
      x = W.x;
    addPlat(x, W.y, f, 9, l);
    addSpinner(
      x,
      W.y,
      f - l / 2,
      7.4,
      (Math.random() < 0.5 ? -1 : 1) * (1.4 + level * 0.12)
    );
    gemLine(x, W.y + 0.9, f - 1.5, f - l + 1.5, 6);
    W.front -= l;
  },
  pad() {
    addPlat(W.x, W.y, W.front, 6, 10);
    addPad(W.x, W.y, W.front - 7.5);
    gemLine(W.x, W.y + 3.5, W.front - 9, W.front - 16, 4);
    W.front -= 10;
    const g = 6.5;
    W.front -= g;
    addPlat(W.x, W.y, W.front, 7, 8);
    W.front -= 8;
  },
};
function pool() {
  const p = ['straight', 'gaps', 'beam', 'ramp', 'bumpers'];
  if (level >= 2) p.push('moving', 'zigzag');
  if (level >= 3) p.push('spinner', 'pad');
  if (level >= 2) p.push('gaps');
  return p;
}
let lastSeg = '';
function addSegment() {
  const z0 = W.front,
    x0 = W.x,
    y0 = W.y;
  if (W.made === 0) {
    addPlat(0, 0, 0, 7, 12);
    W.front = -12;
    W.made++;
    W.segs.push({ z0: 0, x: 0, y: 0 });
    return;
  }
  if (W.made > W.nSeg) {
    // finish
    addPlat(W.x, W.y, W.front, 9, 16);
    const cz = W.front - 9;
    W.finish = { x: W.x, y: W.y, z: cz };
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(2.6, 0.22, 12, 40),
      new THREE.MeshStandardMaterial({
        color: 0xffd23f,
        emissive: 0xffb000,
        emissiveIntensity: 1.2,
      })
    );
    ring.position.set(W.x, W.y + 2.7, cz);
    scene.add(ring);
    const inner = new THREE.Mesh(
      new THREE.CircleGeometry(2.4, 32),
      new THREE.MeshBasicMaterial({
        color: 0xffe680,
        transparent: true,
        opacity: 0.22,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    inner.position.copy(ring.position);
    scene.add(inner);
    W.finish.ring = ring;
    W.finish.inner = inner;
    W.front -= 16;
    W.done = true;
    W.made++;
    return;
  }
  let s;
  do {
    s = pick(pool());
  } while (s === lastSeg);
  lastSeg = s;
  SEG[s]();
  W.made++;
  W.segs.push({ z0, x: x0, y: y0, name: s });
}
function clearWorld() {
  for (const p of W.plats) {
    scene.remove(p.mesh);
    p.mesh.userData.geo.dispose();
    p.mesh.userData.tt.dispose();
    p.mesh.userData.edge.geometry.dispose();
    p.mesh.userData.mats.forEach((m) => m.dispose());
  }
  for (const o of [...W.gems, ...W.bumps, ...W.pads]) {
    scene.remove(o.mesh);
    if (o.mesh.geometry && o.mesh.geometry !== gemGeo)
      o.mesh.geometry.dispose();
  }
  for (const s of W.spins) scene.remove(s.mesh);
  if (W.finish) {
    scene.remove(W.finish.ring);
    scene.remove(W.finish.inner);
  }
  Object.assign(W, {
    plats: [],
    bumps: [],
    spins: [],
    gems: [],
    pads: [],
    segs: [],
    front: 0,
    y: 0,
    x: 0,
    done: false,
    finish: null,
    made: 0,
  });
}
function applyPalette() {
  pal = PALS[(level - 1) % PALS.length];
  scene.background.setHex(pal.sky);
  scene.fog.color.setHex(pal.sky);
  topTex.dispose();
  topTex = gridTexture(pal);
  bumpMat.color.setHex(pal.acc === 0xff3ea5 ? 0x22d3ee : 0xff3ea5);
  bumpMat.emissive.copy(bumpMat.color);
}

// ---------- Game state ----------
const G = {
  state: 'menu',
  score: 0,
  gems: 0,
  lives: 3,
  time: 0,
  lvlTime: 0,
  gemChain: 0,
  chainT: 0,
};
const B = {
  x: 0,
  y: R,
  z: -2,
  vx: 0,
  vy: 0,
  vz: 0,
  ground: false,
  plat: null,
  coyote: 0,
  jumpBuf: 0,
  slopeVy: 0,
  wasPlat: null,
};
let cp = { x: 0, y: 0, z: -2 },
  nextCp = 1,
  input = { x: 0, z: 0 },
  keys = {},
  camPos = new THREE.Vector3(0, 6, 8),
  shake = 0;

function startLevel() {
  clearWorld();
  applyPalette();
  W.nSeg = Math.min(18, 5 + level * 2);
  while (W.front > -160 && !W.done) addSegment();
  B.x = 0;
  B.y = R;
  B.z = -2;
  B.vx = B.vy = B.vz = 0;
  B.ground = true;
  B.plat = null;
  cp = { x: 0, y: 0, z: -2 };
  nextCp = 1;
  G.lvlTime = 0;
  camPos.set(0, 6, 7);
  $('level').textContent = level;
  $('progFill').style.width = '0%';
}
function newGame() {
  initAudio();
  G.score = 0;
  G.gems = 0;
  G.lives = 3;
  G.time = 0;
  level = 1;
  startLevel();
  G.state = 'playing';
  ['menu', 'over', 'pause'].forEach((id) => $(id).classList.add('hidden'));
  ['hud', 'prog', 'touch'].forEach((id) => $(id).classList.remove('off'));
  updateHud();
  banner('LEVEL 1');
}
function banner(text) {
  const b = $('banner');
  b.textContent = text;
  b.classList.remove('show');
  void b.offsetWidth;
  b.classList.add('show');
}
function flash(a = 0.5, color = '#fff') {
  const f = $('flash');
  f.style.background = color;
  f.style.transition = 'none';
  f.style.opacity = a;
  void f.offsetWidth;
  f.style.transition = 'opacity .5s';
  f.style.opacity = 0;
}
function updateHud(pop) {
  $('score').textContent = G.score;
  $('gems').textContent = G.gems;
  $('lives').textContent =
    '♥'.repeat(Math.max(0, G.lives)) + '♡'.repeat(Math.max(0, 3 - G.lives));
  if (pop) {
    const e = $(pop);
    e.classList.remove('pop');
    void e.offsetWidth;
    e.classList.add('pop');
  }
}

// ---------- Physics ----------
function groundAt(x, z, maxY) {
  let bestH = -1e9,
    bestP = null;
  for (const p of W.plats) {
    const m = 0.18;
    if (Math.abs(x - p.cx) > p.w / 2 + m || Math.abs(z - p.cz) > p.l / 2 + m)
      continue;
    const h = topAt(p, z);
    if (h <= maxY && h > bestH) {
      bestH = h;
      bestP = p;
    }
  }
  return bestP ? { h: bestH, p: bestP } : null;
}
function die() {
  G.state = 'respawn';
  G.lives--;
  sfx.fall();
  updateHud('lives');
  flash(0.6, '#ff2a55');
  if (G.lives <= 0) {
    setTimeout(gameOver, 500);
    return;
  }
  setTimeout(() => {
    B.x = cp.x;
    B.y = cp.y + R + 0.2;
    B.z = cp.z;
    B.vx = B.vy = B.vz = 0;
    B.ground = false;
    B.plat = null;
    G.state = 'playing';
    burst(B.x, B.y, B.z, 20, 4, 0x22d3ee);
  }, 650);
}
function gameOver() {
  G.state = 'over';
  sfx.over();
  const total = G.score;
  const isBest = total > best;
  if (isBest) {
    best = total;
    saveBest();
  }
  $('finalScore').textContent = total;
  $('finalLevel').textContent = level;
  $('finalGems').textContent = G.gems;
  $('finalTime').textContent = Math.round(G.time);
  $('bestOver').textContent = best;
  $('newBest').classList.toggle('hidden', !isBest || total === 0);
  $('over').classList.remove('hidden');
  ['hud', 'prog', 'touch'].forEach((id) => $(id).classList.add('off'));
}
function levelClear() {
  G.state = 'clear';
  sfx.clear();
  const par = W.nSeg * 5,
    bonus = Math.max(0, Math.round((par - G.lvlTime) * 8)),
    add = 200 + level * 50 + bonus;
  G.score += add;
  updateHud('score');
  banner(`LEVEL ${level} CLEAR! +${add}`);
  flash(0.5, '#ffe680');
  burst(W.finish.x, W.finish.y + 2, W.finish.z, 80, 8, 0xffe680);
  setTimeout(() => {
    level++;
    startLevel();
    G.state = 'playing';
    banner('LEVEL ' + level);
  }, 1900);
}

function stepPhysics(dt) {
  t += dt;
  G.time += dt;
  G.lvlTime += dt;
  // world animation
  for (const p of W.plats)
    if (p.move) {
      const nx = p.cx0 + p.move.A * Math.sin(t * p.move.sp + p.move.ph);
      p.dx = nx - p.cx;
      p.cx = nx;
      p.mesh.position.x = nx;
    }
  for (const s of W.spins) {
    s.a += s.spd * dt;
    s.mesh.rotation.y = s.a;
  }
  for (const g of W.gems)
    if (!g.got) {
      g.mesh.rotation.y += dt * 2.5;
      g.mesh.position.y = g.y + Math.sin(t * 3 + g.x) * 0.12;
    }
  for (const p of W.pads) {
    p.cd = Math.max(0, p.cd - dt);
    p.mesh.scale.setScalar(1 + 0.08 * Math.sin(t * 8));
  }
  if (W.finish) {
    W.finish.ring.rotation.z += dt * 0.8;
    W.finish.inner.material.opacity = 0.2 + 0.08 * Math.sin(t * 4);
  }
  if (G.state !== 'playing') return;
  // input
  const air = B.ground ? 1 : 0.5,
    ACC = 40;
  B.vx += input.x * ACC * air * dt;
  B.vz += input.z * ACC * air * dt;
  if (B.ground && !input.x && !input.z) {
    const k = Math.exp(-2.4 * dt);
    B.vx *= k;
    B.vz *= k;
  } else {
    const k = Math.exp(-0.25 * dt);
    B.vx *= k;
    B.vz *= k;
  }
  const sp = Math.hypot(B.vx, B.vz),
    MAXV = 14;
  if (sp > MAXV) {
    B.vx *= MAXV / sp;
    B.vz *= MAXV / sp;
  }
  B.vy -= 32 * dt;
  // jump (buffer + coyote)
  B.jumpBuf = Math.max(0, B.jumpBuf - dt);
  B.coyote = B.ground ? 0.1 : Math.max(0, B.coyote - dt);
  if (B.jumpBuf > 0 && B.coyote > 0) {
    B.vy = 11.5;
    B.ground = false;
    B.coyote = 0;
    B.jumpBuf = 0;
    sfx.jump();
    burst(B.x, B.y - R, B.z, 6, 2, 0xffffff);
  }
  // ride moving platform
  if (B.ground && B.plat && B.plat.move) B.x += B.plat.dx;
  B.x += B.vx * dt;
  B.y += B.vy * dt;
  B.z += B.vz * dt;
  // bumpers
  for (const b of W.bumps) {
    if (B.y - R > b.top + 1.3) continue;
    const dx = B.x - b.x,
      dz = B.z - b.z,
      d = Math.hypot(dx, dz),
      min = R + b.r;
    if (d < min && d > 1e-4) {
      const nx = dx / d,
        nz = dz / d;
      B.x = b.x + nx * min;
      B.z = b.z + nz * min;
      const vn = B.vx * nx + B.vz * nz;
      if (vn < 0) {
        B.vx -= 2 * vn * nx;
        B.vz -= 2 * vn * nz;
      }
      B.vx += nx * 5;
      B.vz += nz * 5;
      sfx.bump();
      shake = 0.15;
      b.mesh.scale.set(1.2, 1, 1.2);
      burst(b.x + nx * b.r, B.y, b.z + nz * b.r, 8, 3, 0xff3ea5);
    } else b.mesh.scale.lerp(new THREE.Vector3(1, 1, 1), 0.2);
  }
  // spinners
  for (const s of W.spins) {
    if (B.y - R > s.top + 0.9 || B.y + R < s.top) continue;
    const c = Math.cos(s.a),
      sn = -Math.sin(s.a),
      hx = (s.len / 2) * c,
      hz = (s.len / 2) * sn;
    const ax = s.x - hx,
      az = s.z - hz,
      bx = s.x + hx,
      bz = s.z + hz,
      abx = bx - ax,
      abz = bz - az,
      tt = clamp(
        ((B.x - ax) * abx + (B.z - az) * abz) / (abx * abx + abz * abz),
        0,
        1
      );
    const px = ax + abx * tt,
      pz = az + abz * tt,
      dx = B.x - px,
      dz = B.z - pz,
      d = Math.hypot(dx, dz),
      min = R + 0.3;
    if (d < min && d > 1e-4) {
      const nx = dx / d,
        nz = dz / d;
      B.x = px + nx * min;
      B.z = pz + nz * min;
      B.vx = nx * 11 + B.vx * 0.2;
      B.vz = nz * 11 + B.vz * 0.2;
      B.vy = Math.max(B.vy, 4);
      sfx.bump();
      shake = 0.3;
      burst(B.x, B.y, B.z, 10, 4, 0xffb020);
    }
    const hd = Math.hypot(B.x - s.x, B.z - s.z);
    if (hd < R + 0.55 && hd > 1e-4) {
      B.x = s.x + ((B.x - s.x) / hd) * (R + 0.55);
      B.z = s.z + ((B.z - s.z) / hd) * (R + 0.55);
    }
  }
  // ground
  const wasGround = B.ground,
    g = groundAt(B.x, B.z, B.y - R + 0.5);
  if (g && B.y - R <= g.h + 0.001 && B.vy <= 0) {
    if (!wasGround && B.vy < -7) {
      sfx.land();
      burst(B.x, g.h, B.z, 7, 2, 0xffffff);
    }
    B.y = g.h + R;
    B.vy = 0;
    B.ground = true;
    B.plat = g.p;
  } else {
    B.ground = false;
    if (wasGround && B.wasPlat && B.wasPlat.ramp && B.vy <= 0) {
      const slope = (B.wasPlat.ramp[1] - B.wasPlat.ramp[0]) / B.wasPlat.l;
      if (slope > 0 && B.vz < 0) B.vy = -B.vz * slope;
    }
  }
  B.wasPlat = B.plat;
  if (!B.ground) B.plat = B.plat;
  // pads
  for (const p of W.pads)
    if (B.ground && p.cd <= 0 && Math.hypot(B.x - p.x, B.z - p.z) < 1.2) {
      B.vy = 17.5;
      B.ground = false;
      p.cd = 0.6;
      sfx.pad();
      burst(p.x, p.top, p.z, 22, 4, 0x22d3ee);
      flash(0.15, '#22d3ee');
    }
  // gems
  G.chainT -= dt;
  if (G.chainT <= 0) G.gemChain = 0;
  for (const gm of W.gems)
    if (
      !gm.got &&
      Math.abs(gm.z - B.z) < 1.4 &&
      Math.hypot(B.x - gm.x, B.z - gm.z, B.y - gm.y) < 1.15
    ) {
      gm.got = true;
      scene.remove(gm.mesh);
      G.gems++;
      G.gemChain = Math.min(8, G.gemChain + 1);
      G.chainT = 1.2;
      G.score += 10;
      sfx.gem(G.gemChain);
      updateHud('gems');
      burst(gm.x, gm.y, gm.z, 10, 3, 0xffd23f);
    }
  // checkpoints
  while (
    nextCp < W.segs.length &&
    B.ground &&
    B.z < W.segs[nextCp].z0 - 1.5 &&
    B.z > W.segs[nextCp].z0 - 8
  ) {
    const s = W.segs[nextCp];
    cp = { x: B.x, y: B.y - R, z: B.z };
    nextCp++;
  }
  // finish / fall
  if (
    W.finish &&
    B.ground &&
    B.z < W.finish.z + 1.5 &&
    Math.abs(B.x - W.finish.x) < 4.5
  ) {
    levelClear();
    return;
  }
  const low = W.plats.reduce((m, p) => Math.min(m, p.top), 99);
  if (B.y < Math.min(low, cp.y) - 14) die();
  // generate / cull
  while (!W.done && W.front > B.z - 150) addSegment();
  for (let i = W.plats.length - 1; i >= 0; i--) {
    const p = W.plats[i];
    if (p.cz - p.l / 2 > B.z + 45) {
      scene.remove(p.mesh);
      p.mesh.userData.geo.dispose();
      p.mesh.userData.tt.dispose();
      p.mesh.userData.edge.geometry.dispose();
      p.mesh.userData.mats.forEach((m) => m.dispose());
      if (B.plat === p) B.plat = null;
      if (B.wasPlat === p) B.wasPlat = null;
      W.plats.splice(i, 1);
    }
  }
  for (const arr of [W.gems, W.bumps, W.pads, W.spins])
    for (let i = arr.length - 1; i >= 0; i--)
      if (arr[i].z > B.z + 45) {
        scene.remove(arr[i].mesh);
        arr.splice(i, 1);
      }
  const total = Math.abs(W.finish ? W.finish.z : W.front),
    prog = clamp(-B.z / (W.finish ? -W.finish.z : -W.front - 1), 0, 1);
  if (W.finish) $('progFill').style.width = prog * 100 + '%';
  // roll visual
  const spd = Math.hypot(B.vx, B.vz);
  if (spd > 0.05 && B.ground) {
    const ax = new THREE.Vector3(B.vz, 0, -B.vx).normalize();
    ball.quaternion.premultiply(
      new THREE.Quaternion().setFromAxisAngle(ax, (spd * dt) / R)
    );
  } else if (!B.ground && spd > 0.05) {
    const ax = new THREE.Vector3(B.vz, 0, -B.vx).normalize();
    ball.quaternion.premultiply(
      new THREE.Quaternion().setFromAxisAngle(ax, ((spd * dt) / R) * 0.6)
    );
  }
}

// ---------- Input ----------
addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (
    ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(
      e.code
    )
  )
    e.preventDefault();
  if (e.code === 'Space' && G.state === 'playing') B.jumpBuf = 0.12;
  if (e.code === 'KeyP' || e.code === 'Escape') togglePause();
  if (e.code === 'KeyM') muted = !muted;
  if (e.code === 'Enter') {
    if (G.state === 'menu' || G.state === 'over') newGame();
  }
});
addEventListener('keyup', (e) => {
  keys[e.code] = false;
});
let stickX = 0,
  stickZ = 0;
function readInput() {
  const kx =
      (keys.KeyD || keys.ArrowRight ? 1 : 0) -
      (keys.KeyA || keys.ArrowLeft ? 1 : 0),
    kz =
      (keys.KeyS || keys.ArrowDown ? 1 : 0) -
      (keys.KeyW || keys.ArrowUp ? 1 : 0);
  let x = kx || stickX,
    z = kz || stickZ;
  const m = Math.hypot(x, z);
  if (m > 1) {
    x /= m;
    z /= m;
  }
  input.x = x;
  input.z = z;
}
const stick = $('stick'),
  knob = $('knob');
let sid = null;
function stickMove(e) {
  const r = stick.getBoundingClientRect(),
    cx = r.left + r.width / 2,
    cy = r.top + r.height / 2;
  let dx = (e.clientX - cx) / (r.width / 2),
    dy = (e.clientY - cy) / (r.height / 2);
  const m = Math.hypot(dx, dy);
  if (m > 1) {
    dx /= m;
    dy /= m;
  }
  stickX = Math.abs(dx) < 0.12 ? 0 : dx;
  stickZ = Math.abs(dy) < 0.12 ? 0 : dy;
  knob.style.transform = `translate(${dx * 40}px,${dy * 40}px)`;
}
stick.addEventListener('pointerdown', (e) => {
  sid = e.pointerId;
  stick.setPointerCapture(sid);
  stickMove(e);
});
stick.addEventListener('pointermove', (e) => {
  if (e.pointerId === sid) stickMove(e);
});
const stickEnd = (e) => {
  if (e.pointerId === sid) {
    sid = null;
    stickX = stickZ = 0;
    knob.style.transform = '';
  }
};
stick.addEventListener('pointerup', stickEnd);
stick.addEventListener('pointercancel', stickEnd);
$('tJump').addEventListener('pointerdown', (e) => {
  e.preventDefault();
  if (G.state === 'playing') B.jumpBuf = 0.12;
});
function togglePause() {
  if (G.state === 'playing') {
    G.state = 'paused';
    $('pause').classList.remove('hidden');
  } else if (G.state === 'paused') {
    G.state = 'playing';
    $('pause').classList.add('hidden');
  }
}
$('playBtn').onclick = newGame;
$('retryBtn').onclick = newGame;
$('resumeBtn').onclick = togglePause;
document.addEventListener('visibilitychange', () => {
  if (document.hidden && G.state === 'playing') togglePause();
});

// ---------- Loop ----------
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (G.state !== 'paused') {
    readInput();
    const n = Math.ceil(dt / (1 / 90));
    for (let i = 0; i < n; i++) stepPhysics(dt / n);
  }
  updateVisuals(dt);
  composer.render();
}
function updateVisuals(dt) {
  ball.position.set(B.x, B.y, B.z);
  const g = groundAt(B.x, B.z, B.y);
  if (g) {
    blob.visible = true;
    blob.position.set(B.x, g.h + 0.03, B.z);
    const k = clamp(1 - (B.y - R - g.h) / 8, 0.3, 1);
    blob.scale.setScalar(k);
    blob.material.opacity = 0.45 * k;
  } else blob.visible = false;
  // camera
  const tx = B.x * 0.75,
    ty = B.y + 5.2,
    tz = B.z + 8.6,
    k = 1 - Math.exp(-5 * dt);
  camPos.x = lerp(camPos.x, tx, k);
  camPos.y = lerp(camPos.y, ty, k);
  camPos.z = lerp(camPos.z, tz, k);
  shake = Math.max(0, shake - dt);
  const sh = shake * 0.4;
  camera.position.set(
    camPos.x + rand(-sh, sh),
    camPos.y + rand(-sh, sh),
    camPos.z
  );
  camera.lookAt(B.x * 0.9, B.y + 0.4, B.z - 6);
  camera.fov = lerp(camera.fov, 62 + Math.hypot(B.vx, B.vz) * 0.5, 0.05);
  camera.updateProjectionMatrix();
  stars.position.copy(camera.position);
  // particles
  for (let i = 0; i < PN; i++) {
    if (pLife[i] > 0) {
      pLife[i] -= dt;
      pVel[i * 3 + 1] -= 9 * dt;
      pPos[i * 3] += pVel[i * 3] * dt;
      pPos[i * 3 + 1] += pVel[i * 3 + 1] * dt;
      pPos[i * 3 + 2] += pVel[i * 3 + 2] * dt;
      if (pLife[i] <= 0) pPos[i * 3 + 1] = -999;
    }
  }
  pGeo.attributes.position.needsUpdate = true;
}

// ---------- Init ----------
$('bestMenu').textContent = best;
applyPalette();
startLevel();
G.state = 'menu';
requestAnimationFrame((n) => {
  last = n;
  frame(n);
});

if (location.search.includes('debug')) {
  window.__rr = {
    G,
    B,
    W,
    get level() {
      return level;
    },
    set level(v) {
      level = v;
    },
    newGame,
    startLevel,
    step: (dt) => stepPhysics(dt),
    setInput: (x, z) => {
      input.x = x;
      input.z = z;
    },
    jump: () => {
      B.jumpBuf = 0.12;
    },
    keys,
    groundAt,
    auto: false,
  };
  // simple autopilot (tests only)
  const prev = readInput;
  window.__rrAuto = () => {
    const f = (dz) => {
      const z = B.z - dz;
      let best = null;
      for (const p of W.plats)
        if (Math.abs(p.cz - z) <= p.l / 2 && (!best || p.top > best.top))
          best = p;
      return best;
    };
    const a = f(4),
      b = f(9);
    let tx = a ? a.cx : b ? b.cx : B.x;
    if (W.finish && B.z < W.finish.z + 20) tx = W.finish.x;
    input.x = clamp((tx - B.x) * 1.2 - B.vx * 0.25, -1, 1);
    const near = Math.abs(B.vx) < 9;
    input.z = B.vz > -9 ? -1 : 0;
    const ahead = groundAt(B.x + B.vx * 0.15, B.z + B.vz * 0.22, B.y);
    if (B.ground && !ahead) B.jumpBuf = 0.1;
    if (B.ground && W.bumps.length === 0 && B.plat && B.plat.ramp) {
    }
  };
}

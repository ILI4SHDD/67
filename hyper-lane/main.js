// ============================================================
//  HYPER LANE — a 3D neon runner (three.js)
// ============================================================
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { EffectComposer } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/postprocessing/OutputPass.js';

const $ = (id) => document.getElementById(id);
const el = {
  hud: $('hud'),
  score: $('score'),
  orbs: $('orbs'),
  speed: $('speed'),
  combo: $('combo'),
  banner: $('banner'),
  flash: $('flash'),
  menu: $('menu'),
  pause: $('pause'),
  over: $('over'),
  finalScore: $('finalScore'),
  finalDist: $('finalDist'),
  finalOrbs: $('finalOrbs'),
  finalSpeed: $('finalSpeed'),
  newBest: $('newBest'),
  bestMenu: $('bestMenu'),
  bestOver: $('bestOver'),
  skin: $('skin'),
};
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;

// ---------- Save ----------
let best = 0;
try {
  best = parseInt(localStorage.getItem('hyperlane-best') || '0', 10) || 0;
} catch (e) {}
const saveBest = () => {
  try {
    localStorage.setItem('hyperlane-best', String(best));
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
function beep(f, d, type = 'sine', v = 0.05, slide = 0, delay = 0) {
  if (!ac || muted) return;
  const t = ac.currentTime + delay,
    o = ac.createOscillator(),
    g = ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  if (slide)
    o.frequency.exponentialRampToValueAtTime(Math.max(30, f + slide), t + d);
  g.gain.setValueAtTime(v, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  o.connect(g).connect(ac.destination);
  o.start(t);
  o.stop(t + d);
}
const sfx = {
  lane: () => beep(380, 0.07, 'triangle', 0.035, 160),
  jump: () => beep(300, 0.18, 'sine', 0.05, 500),
  land: () => beep(120, 0.07, 'triangle', 0.04),
  orb: (c) => beep(700 + Math.min(c, 12) * 60, 0.12, 'triangle', 0.05, 300),
  go: () => {
    beep(520, 0.12, 'square', 0.05);
    beep(780, 0.3, 'square', 0.05, 0, 0.1);
  },
  crash: () => {
    beep(110, 0.7, 'sawtooth', 0.12, -70);
    beep(900, 0.25, 'square', 0.05, -800);
  },
  level: () =>
    [0, 7, 12].forEach((n, i) =>
      beep(440 * 2 ** (n / 12), 0.15, 'triangle', 0.05, 0, i * 0.07)
    ),
};

// ---------- Three.js setup ----------
const canvas = $('game');
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: false,
  powerPreference: 'high-performance',
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(66, 1, 0.1, 500);
scene.fog = new THREE.FogExp2(0x12062e, 0.014);
scene.background = new THREE.Color(0x12062e);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.7, 0.45, 0.62);
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

scene.add(new THREE.AmbientLight(0x6a5cff, 0.9));
const sunLight = new THREE.DirectionalLight(0xff8ad8, 1.1);
sunLight.position.set(-4, 8, -6);
scene.add(sunLight);

// ---------- Palettes (change every 400 m) ----------
const PAL = [
  { bg: 0x12062e, rail: 0x19e6ff, sun: 0xff5fa2 },
  { bg: 0x2a0626, rail: 0xff2fb9, sun: 0xffb347 },
  { bg: 0x03242a, rail: 0x4dff9a, sun: 0x19e6ff },
  { bg: 0x2a1204, rail: 0xffb020, sun: 0xff3b6b },
];
const palNow = {
  bg: new THREE.Color(PAL[0].bg),
  rail: new THREE.Color(PAL[0].rail),
  sun: new THREE.Color(PAL[0].sun),
};
const palTo = {
  bg: new THREE.Color(PAL[0].bg),
  rail: new THREE.Color(PAL[0].rail),
  sun: new THREE.Color(PAL[0].sun),
};
function setPalette(i) {
  const p = PAL[i % PAL.length];
  palTo.bg.set(p.bg);
  palTo.rail.set(p.rail);
  palTo.sun.set(p.sun);
}

// ---------- World ----------
const LANES = [-3, 0, 3];
const ROAD_W = 9.2,
  ROAD_LEN = 420;

// road with scrolling grid
function gridTexture() {
  const c = document.createElement('canvas');
  c.width = 192;
  c.height = 192;
  const g = c.getContext('2d');
  g.fillStyle = '#07031a';
  g.fillRect(0, 0, 192, 192);
  g.strokeStyle = '#b8c8d8';
  g.lineWidth = 3;
  for (const x of [2, 64, 128, 190]) {
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x, 192);
    g.stroke();
  }
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(0, 191);
  g.lineTo(192, 190);
  g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1, ROAD_LEN / 6);
  t.anisotropy = 4;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const gridTex = gridTexture();
const roadMat = new THREE.MeshBasicMaterial({
  map: gridTex,
  color: PAL[0].rail,
});
const road = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_W, ROAD_LEN), roadMat);
road.rotation.x = -Math.PI / 2;
road.position.set(0, 0, -ROAD_LEN / 2 + 14);
scene.add(road);

const railMat = new THREE.MeshBasicMaterial({ color: PAL[0].rail });
for (const sx of [-1, 1]) {
  const rail = new THREE.Mesh(
    new THREE.BoxGeometry(0.22, 0.34, ROAD_LEN),
    railMat
  );
  rail.position.set(sx * (ROAD_W / 2 + 0.1), 0.17, -ROAD_LEN / 2 + 14);
  scene.add(rail);
  const side = new THREE.Mesh(
    new THREE.PlaneGeometry(40, ROAD_LEN),
    new THREE.MeshBasicMaterial({ color: 0x02010a })
  );
  side.rotation.x = -Math.PI / 2;
  side.position.set(sx * (ROAD_W / 2 + 20.2), -0.4, -ROAD_LEN / 2 + 14);
  scene.add(side);
}

// sun + stars
const sunMat = new THREE.MeshBasicMaterial({ color: PAL[0].sun, fog: false });
const sun = new THREE.Mesh(new THREE.CircleGeometry(60, 48), sunMat);
sun.position.set(0, 46, -380);
scene.add(sun);
{
  const n = 1400,
    pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const r = rand(250, 420),
      a = rand(0, Math.PI * 2),
      e = rand(-0.05, 1.2);
    pos[i * 3] = Math.cos(a) * Math.cos(e) * r;
    pos[i * 3 + 1] = Math.sin(e) * r;
    pos[i * 3 + 2] = Math.sin(a) * Math.cos(e) * r;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  scene.add(
    new THREE.Points(
      g,
      new THREE.PointsMaterial({
        color: 0xffffff,
        size: 1.6,
        sizeAttenuation: false,
        fog: false,
      })
    )
  );
}

// arches along the road (recycled) for a sense of speed
const archMat = new THREE.MeshBasicMaterial({ color: PAL[0].rail });
const arches = [];
{
  const geo = new THREE.BoxGeometry(0.3, 0.3, 0.3);
  for (let i = 0; i < 16; i++) {
    const grp = new THREE.Group();
    const w = ROAD_W + 3.4,
      h = 6.5;
    const parts = [
      [-w / 2, h / 2, 0.3, h],
      [w / 2, h / 2, 0.3, h],
      [0, h, w + 0.3, 0.3],
    ];
    for (const [x, y, sx, sy] of parts) {
      const m = new THREE.Mesh(geo, archMat);
      m.position.set(x, y, 0);
      m.scale.set(sx / 0.3, sy / 0.3, 1);
      grp.add(m);
    }
    grp.position.z = -i * 28;
    scene.add(grp);
    arches.push(grp);
  }
}
// speed streaks
const streaks = [];
{
  const mat = new THREE.LineBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.5,
    fog: true,
  });
  for (let i = 0; i < 70; i++) {
    const g = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0, -2.5),
    ]);
    const l = new THREE.Line(g, mat);
    l.position.set(rand(-14, 14), rand(0.3, 9), rand(-160, 10));
    if (Math.abs(l.position.x) < 5.2 && l.position.y < 5)
      l.position.x += Math.sign(l.position.x || 1) * 6;
    scene.add(l);
    streaks.push(l);
  }
}

// ---------- Ship ----------
const ship = new THREE.Group();
const shipTilt = new THREE.Group();
ship.add(shipTilt);
{
  const bodyMat = new THREE.MeshStandardMaterial({
    color: 0xeaf8ff,
    metalness: 0.5,
    roughness: 0.3,
    emissive: 0x113344,
  });
  const body = new THREE.Mesh(new THREE.ConeGeometry(0.55, 2.4, 6), bodyMat);
  body.rotation.x = -Math.PI / 2;
  shipTilt.add(body);
  const wingGeo = new THREE.BoxGeometry(1.5, 0.08, 0.9);
  for (const s of [-1, 1]) {
    const w = new THREE.Mesh(
      wingGeo,
      new THREE.MeshStandardMaterial({
        color: 0x19e6ff,
        emissive: 0x0a7f99,
        metalness: 0.4,
        roughness: 0.4,
      })
    );
    w.position.set(s * 0.85, -0.05, 0.55);
    w.rotation.z = s * -0.12;
    w.rotation.y = s * 0.3;
    shipTilt.add(w);
    const tip = new THREE.Mesh(
      new THREE.BoxGeometry(0.1, 0.3, 0.8),
      new THREE.MeshBasicMaterial({ color: 0xff2fb9 })
    );
    tip.position.set(s * 1.55, 0.05, 0.75);
    shipTilt.add(tip);
  }
  const cock = new THREE.Mesh(
    new THREE.SphereGeometry(0.34, 16, 12),
    new THREE.MeshBasicMaterial({ color: 0x7df3ff })
  );
  cock.scale.set(1, 0.7, 1.7);
  cock.position.set(0, 0.28, 0.1);
  shipTilt.add(cock);
  const flame = new THREE.Mesh(
    new THREE.ConeGeometry(0.28, 1.4, 10),
    new THREE.MeshBasicMaterial({ color: 0xff9a3d })
  );
  flame.rotation.x = Math.PI / 2;
  flame.position.set(0, 0, 1.9);
  flame.name = 'flame';
  shipTilt.add(flame);
  const flame2 = new THREE.Mesh(
    new THREE.ConeGeometry(0.15, 1.0, 10),
    new THREE.MeshBasicMaterial({ color: 0xfff2b0 })
  );
  flame2.rotation.x = Math.PI / 2;
  flame2.position.set(0, 0, 1.7);
  flame2.name = 'flame2';
  shipTilt.add(flame2);
  const glow = new THREE.PointLight(0x19e6ff, 14, 14, 2);
  glow.position.set(0, 1.2, 0.5);
  ship.add(glow);
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.9, 20),
    new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.45,
    })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.name = 'shadow';
  ship.add(shadow);
}
scene.add(ship);
const flame = shipTilt.getObjectByName('flame'),
  flame2 = shipTilt.getObjectByName('flame2'),
  shadow = ship.getObjectByName('shadow');

// ---------- Custom skin: your drawing becomes the ship ----------
// The drawing is stacked as thin layers (darker towards the back) so it has real depth in 3D.
const defaultShip = new THREE.Group();
[...shipTilt.children]
  .filter((c) => c.name !== 'flame' && c.name !== 'flame2')
  .forEach((c) => defaultShip.add(c));
shipTilt.add(defaultShip);
const customShip = new THREE.Group();
customShip.visible = false;
shipTilt.add(customShip);
function setThumb(url) {
  const t = $('skinThumb');
  if (t) t.style.backgroundImage = url ? 'url(' + url + ')' : 'none';
}
function applySkin(url) {
  customShip.children.slice().forEach((c) => {
    customShip.remove(c);
    c.geometry.dispose();
    c.material.dispose();
  });
  if (!url) {
    defaultShip.visible = true;
    customShip.visible = false;
    flame.position.set(0, 0, 1.9);
    flame2.position.set(0, 0, 1.7);
    flame.scale.x = 1;
    setThumb(null);
    return;
  }
  const img = new Image();
  img.onload = () => {
    const tex = new THREE.Texture(img);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    const asp = img.width / img.height,
      big = 2.6;
    const Wd = asp >= 1 ? big : big * asp,
      Ht = asp >= 1 ? big / asp : big;
    const N = 7;
    for (let i = 0; i < N; i++) {
      const k = i === 0 ? 1 : 0.62 - (i / N) * 0.4;
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(Wd, Ht),
        new THREE.MeshBasicMaterial({
          map: tex,
          alphaTest: 0.4,
          side: THREE.DoubleSide,
          color: new THREE.Color(k, k, k),
        })
      );
      m.position.set(0, Ht / 2 - 0.45, 0.32 - i * 0.09);
      customShip.add(m);
    }
    defaultShip.visible = false;
    customShip.visible = true;
    flame.position.set(0, -0.35, 0.5);
    flame2.position.set(0, -0.35, 0.4);
    setThumb(url);
  };
  img.src = url;
}
let savedSkin = null,
  savedSrc = null;
try {
  savedSkin = localStorage.getItem('hyperlane-skin');
  savedSrc = localStorage.getItem('hyperlane-skin-src');
} catch (e) {}
applySkin(savedSkin);

// ---------- Obstacles / orbs ----------
const wallGeo = new THREE.BoxGeometry(2.7, 2.6, 1.1),
  wallEdges = new THREE.EdgesGeometry(wallGeo);
const lowGeo = new THREE.BoxGeometry(2.8, 0.95, 0.8),
  lowEdges = new THREE.EdgesGeometry(lowGeo);
const wallFill = new THREE.MeshBasicMaterial({ color: 0x2a0614 }),
  wallLine = new THREE.LineBasicMaterial({ color: 0xff3b6b });
const lowFill = new THREE.MeshBasicMaterial({ color: 0x2a1604 }),
  lowLine = new THREE.LineBasicMaterial({ color: 0xffb020 });
const orbGeo = new THREE.IcosahedronGeometry(0.42, 1),
  orbMat = new THREE.MeshBasicMaterial({ color: 0xffe36a });
const orbGlow = new THREE.MeshBasicMaterial({
  color: 0xffb020,
  transparent: true,
  opacity: 0.35,
  wireframe: true,
});

let objs = [];
function addWall(lane, z) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(wallGeo, wallFill));
  g.add(new THREE.LineSegments(wallEdges, wallLine));
  const stripe = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(2.1, 1.9, 1.15)),
    wallLine
  );
  g.add(stripe);
  g.position.set(LANES[lane], 1.3, z);
  scene.add(g);
  objs.push({ g, type: 'wall', lane, z });
}
function addLow(lane, z) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(lowGeo, lowFill));
  g.add(new THREE.LineSegments(lowEdges, lowLine));
  g.position.set(LANES[lane], 0.48, z);
  scene.add(g);
  objs.push({ g, type: 'low', lane, z });
}
function addOrb(lane, z, y) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(orbGeo, orbMat));
  const gl = new THREE.Mesh(orbGeo, orbGlow);
  gl.scale.setScalar(1.5);
  g.add(gl);
  g.position.set(LANES[lane], y, z);
  scene.add(g);
  objs.push({ g, type: 'orb', lane, z, y, spin: rand(0, 6) });
}
function killObj(o) {
  scene.remove(o.g);
  o.g.traverse((c) => {
    /* shared geometries/materials are reused */
  });
  o.dead = true;
}

function spawnRow(z) {
  const r = Math.random();
  const lane = () => (Math.random() * 3) | 0;
  if (r < 0.34) {
    // walls in 1-2 lanes
    const free = lane(),
      two = Math.random() < 0.55;
    const keep = two
      ? [free]
      : [free, (free + 1 + ((Math.random() * 2) | 0)) % 3];
    for (let i = 0; i < 3; i++) if (!keep.includes(i)) addWall(i, z);
    if (Math.random() < 0.7)
      for (let k = 0; k < 3; k++) addOrb(free, z - 3 - k * 2.6, 1.1);
  } else if (r < 0.6) {
    // low barriers across all lanes -> jump
    for (let i = 0; i < 3; i++) addLow(i, z);
    const l = lane();
    for (let k = 0; k < 3; k++)
      addOrb(l, z + 3.2 - k * 3.2, 1.2 + Math.sin((k / 2) * Math.PI) * 1.9);
  } else if (r < 0.82) {
    // mixed: wall + barriers
    const w = lane();
    for (let i = 0; i < 3; i++) i === w ? addWall(i, z) : addLow(i, z);
    for (let k = 0; k < 3; k++)
      addOrb(
        (w + 1) % 3,
        z + 3.2 - k * 3.2,
        1.2 + Math.sin((k / 2) * Math.PI) * 1.9
      );
  } else {
    // bonus orb line
    const l = lane(),
      n = 5 + ((Math.random() * 3) | 0);
    for (let k = 0; k < n; k++) addOrb(l, z - k * 2.6, 1.1);
  }
}

// ---------- Particles ----------
const MAXP = 360;
const pPos = new Float32Array(MAXP * 3),
  pCol = new Float32Array(MAXP * 3);
const pGeo = new THREE.BufferGeometry();
pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
const pPoints = new THREE.Points(
  pGeo,
  new THREE.PointsMaterial({
    size: 0.16,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  })
);
pPoints.frustumCulled = false;
scene.add(pPoints);
const pl = Array.from({ length: MAXP }, () => ({ life: 0 }));
let pHead = 0;
function emit(x, y, z, vx, vy, vz, life, color) {
  const p = pl[pHead];
  pHead = (pHead + 1) % MAXP;
  Object.assign(p, {
    x,
    y,
    z,
    vx,
    vy,
    vz,
    life,
    max: life,
    r: ((color >> 16) & 255) / 255,
    g: ((color >> 8) & 255) / 255,
    b: (color & 255) / 255,
  });
}
function burst(x, y, z, n, color, spd = 8) {
  for (let i = 0; i < n; i++) {
    const a = rand(0, 6.283),
      e = rand(-1, 1),
      s = rand(1, spd);
    emit(
      x,
      y,
      z,
      Math.cos(a) * s,
      e * s + 2,
      Math.sin(a) * s,
      rand(0.4, 1),
      color
    );
  }
}
function updateParticles(dt, speed) {
  for (let i = 0; i < MAXP; i++) {
    const p = pl[i];
    if (p.life > 0) {
      p.life -= dt;
      p.vy -= 9 * dt;
      p.x += p.vx * dt;
      p.y = Math.max(0.05, p.y + p.vy * dt);
      p.z += (p.vz + speed) * dt;
      const k = Math.max(0, p.life / p.max);
      pPos[i * 3] = p.x;
      pPos[i * 3 + 1] = p.y;
      pPos[i * 3 + 2] = p.z;
      pCol[i * 3] = p.r * k;
      pCol[i * 3 + 1] = p.g * k;
      pCol[i * 3 + 2] = p.b * k;
    } else {
      pPos[i * 3 + 1] = -50;
      pCol[i * 3] = pCol[i * 3 + 1] = pCol[i * 3 + 2] = 0;
    }
  }
  pGeo.attributes.position.needsUpdate = true;
  pGeo.attributes.color.needsUpdate = true;
}

// ---------- Game state ----------
const V0 = 24,
  VMAX = 62;
const G = {
  state: 'menu',
  t: 0,
  ts: 1,
  tsTarget: 1,
  dist: 0,
  orbs: 0,
  speed: V0,
  top: 0,
  lane: 1,
  x: 0,
  y: 0,
  vy: 0,
  grounded: true,
  combo: 0,
  rowGap: 0,
  shake: 0,
  flashA: 0,
  pal: 0,
  cd: 0,
  auto: false,
};
const keys = {};

function resetWorld() {
  objs.forEach((o) => scene.remove(o.g));
  objs = [];
  Object.assign(G, {
    t: 0,
    ts: 1,
    tsTarget: 1,
    dist: 0,
    orbs: 0,
    speed: V0,
    top: 0,
    lane: 1,
    x: 0,
    y: 0,
    vy: 0,
    grounded: true,
    combo: 0,
    rowGap: 30,
    shake: 0,
    flashA: 0,
    pal: 0,
  });
  setPalette(0);
  ship.visible = true;
}

function startGame() {
  resetWorld();
  G.state = 'countdown';
  G.cd = 1.1;
  el.menu.classList.add('hidden');
  el.over.classList.add('hidden');
  el.pause.classList.add('hidden');
  el.hud.classList.remove('off');
  banner('GET READY', '#19e6ff');
  updateHud(true);
}
function banner(text, color) {
  el.banner.textContent = text;
  el.banner.style.color = color || '#fff';
  el.banner.classList.remove('show');
  void el.banner.offsetWidth;
  el.banner.classList.add('show');
}
const score = () => Math.floor(G.dist) + G.orbs * 25;
function updateHud(pop) {
  el.score.textContent = score().toLocaleString('en-US');
  el.orbs.textContent = G.orbs;
  el.speed.textContent = Math.round(G.speed * 3.6);
  if (pop) {
    el.score.classList.remove('pop');
    void el.score.offsetWidth;
    el.score.classList.add('pop');
  }
}

// ---------- Input ----------
function moveLane(d) {
  if (G.state !== 'playing') return;
  const n = clamp(G.lane + d, 0, 2);
  if (n !== G.lane) {
    G.lane = n;
    sfx.lane();
  }
}
function jump() {
  if (G.state !== 'playing' || !G.grounded) return;
  G.vy = 16.5;
  G.grounded = false;
  sfx.jump();
  burst(ship.position.x, 0.2, ship.position.z + 0.5, 10, 0x7df3ff, 4);
}
addEventListener('keydown', (e) => {
  initAudio();
  if (skinOpen) {
    if (e.code === 'Escape') closeSkin();
    else if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ')
      $('toolUndo').click();
    return;
  }
  if (e.code === 'ArrowLeft' || e.code === 'KeyA' || e.code === 'KeyQ') {
    e.preventDefault();
    if (!e.repeat) moveLane(-1);
  } else if (e.code === 'ArrowRight' || e.code === 'KeyD') {
    e.preventDefault();
    if (!e.repeat) moveLane(1);
  } else if (
    e.code === 'ArrowUp' ||
    e.code === 'KeyW' ||
    e.code === 'KeyZ' ||
    e.code === 'Space'
  ) {
    e.preventDefault();
    if (G.state === 'menu' || G.state === 'over') {
      if (e.code === 'Space') startGame();
    } else jump();
  } else if (e.repeat) return;
  else if (e.code === 'KeyP' || e.code === 'Escape') togglePause();
  else if (e.code === 'KeyM') muted = !muted;
  else if (e.code === 'Enter' && (G.state === 'menu' || G.state === 'over'))
    startGame();
});
let touch = null;
canvas.addEventListener('pointerdown', (e) => {
  initAudio();
  touch = { x: e.clientX, y: e.clientY, done: false };
});
canvas.addEventListener('pointermove', (e) => {
  if (!touch || touch.done) return;
  const dx = e.clientX - touch.x,
    dy = e.clientY - touch.y;
  if (Math.abs(dx) > 34 && Math.abs(dx) > Math.abs(dy)) {
    moveLane(dx > 0 ? 1 : -1);
    touch.done = true;
  } else if (dy < -34) {
    jump();
    touch.done = true;
  }
});
canvas.addEventListener('pointerup', () => {
  if (touch && !touch.done) jump();
  touch = null;
});
canvas.addEventListener('pointercancel', () => {
  touch = null;
});
addEventListener('blur', () => {
  if (G.state === 'playing') togglePause(true);
});
$('playBtn').onclick = () => {
  initAudio();
  startGame();
};
$('retryBtn').onclick = () => {
  initAudio();
  startGame();
};
$('resumeBtn').onclick = () => togglePause(false);
function togglePause(force) {
  if (G.state !== 'playing' && G.state !== 'paused') return;
  const want = force === undefined ? G.state === 'playing' : force;
  G.state = want ? 'paused' : 'playing';
  el.pause.classList.toggle('hidden', !want);
  if (!want) last = performance.now();
}

// ---------- Skin editor ----------
const dc = $('draw'),
  dx = dc.getContext('2d', { willReadFrequently: true });
const SW = [
  '#19e6ff',
  '#ffffff',
  '#ff2fb9',
  '#ff3b6b',
  '#ffb020',
  '#ffe36a',
  '#4dff9a',
  '#8a6bff',
  '#3d6bff',
  '#2a2a40',
];
let skinOpen = false,
  tool = 'brush',
  color = SW[0],
  mirror = true,
  undoStack = [],
  drawing = false,
  lastP = null;
const swEl = $('swatches');
SW.forEach((c, i) => {
  const d = document.createElement('i');
  d.style.setProperty('--c', c);
  if (!i) d.classList.add('on');
  d.onclick = () => {
    setColor(c);
  };
  swEl.appendChild(d);
});
function setColor(c) {
  color = c;
  $('colorPick').value = c;
  [...swEl.children].forEach((d) =>
    d.classList.toggle('on', d.style.getPropertyValue('--c') === c)
  );
  setTool('brush');
}
function setTool(t) {
  tool = t;
  $('toolBrush').classList.toggle('on', t === 'brush');
  $('toolErase').classList.toggle('on', t === 'erase');
}
$('colorPick').oninput = (e) => setColor(e.target.value);
$('toolBrush').onclick = () => setTool('brush');
$('toolErase').onclick = () => setTool('erase');
$('toolMirror').onclick = () => {
  mirror = !mirror;
  $('toolMirror').classList.toggle('on', mirror);
};
function snap() {
  undoStack.push(dx.getImageData(0, 0, dc.width, dc.height));
  if (undoStack.length > 30) undoStack.shift();
}
$('toolUndo').onclick = () => {
  const d = undoStack.pop();
  if (d) dx.putImageData(d, 0, 0);
};
$('toolClear').onclick = () => {
  snap();
  dx.clearRect(0, 0, dc.width, dc.height);
};
function dpos(e) {
  const r = dc.getBoundingClientRect();
  return {
    x: ((e.clientX - r.left) * dc.width) / r.width,
    y: ((e.clientY - r.top) * dc.height) / r.height,
  };
}
function stroke(a, b) {
  const size = +$('brushSize').value;
  dx.lineCap = dx.lineJoin = 'round';
  dx.lineWidth = size;
  dx.globalCompositeOperation =
    tool === 'erase' ? 'destination-out' : 'source-over';
  dx.strokeStyle = dx.fillStyle = color;
  const one = (p, q) => {
    dx.beginPath();
    dx.moveTo(p.x, p.y);
    dx.lineTo(q.x, q.y);
    dx.stroke();
    dx.beginPath();
    dx.arc(q.x, q.y, size / 2, 0, Math.PI * 2);
    dx.fill();
  };
  one(a, b);
  if (mirror) one({ x: dc.width - a.x, y: a.y }, { x: dc.width - b.x, y: b.y });
  dx.globalCompositeOperation = 'source-over';
}
dc.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  try {
    dc.setPointerCapture(e.pointerId);
  } catch (err) {}
  snap();
  drawing = true;
  lastP = dpos(e);
  stroke(lastP, lastP);
});
dc.addEventListener('pointermove', (e) => {
  if (!drawing) return;
  const p = dpos(e);
  stroke(lastP, p);
  lastP = p;
});
const endDraw = () => {
  drawing = false;
};
dc.addEventListener('pointerup', endDraw);
dc.addEventListener('pointercancel', endDraw);

function openSkin() {
  skinOpen = true;
  undoStack = [];
  dx.clearRect(0, 0, dc.width, dc.height);
  if (savedSrc) {
    const im = new Image();
    im.onload = () => dx.drawImage(im, 0, 0, dc.width, dc.height);
    im.src = savedSrc;
  }
  $('skinErr').textContent = '';
  el.menu.classList.add('hidden');
  el.skin.classList.remove('hidden');
}
function closeSkin() {
  skinOpen = false;
  el.skin.classList.add('hidden');
  el.menu.classList.remove('hidden');
}
$('skinBtn').onclick = () => {
  initAudio();
  openSkin();
};
$('skinCancel').onclick = closeSkin;
$('skinDefault').onclick = () => {
  savedSkin = savedSrc = null;
  try {
    localStorage.removeItem('hyperlane-skin');
    localStorage.removeItem('hyperlane-skin-src');
  } catch (e) {}
  applySkin(null);
  closeSkin();
};
$('skinSave').onclick = () => {
  const d = dx.getImageData(0, 0, dc.width, dc.height).data;
  let x0 = 1e9,
    y0 = 1e9,
    x1 = -1,
    y1 = -1;
  for (let y = 0; y < dc.height; y++)
    for (let x = 0; x < dc.width; x++) {
      if (d[(y * dc.width + x) * 4 + 3] > 20) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  if (x1 < 0) {
    $('skinErr').textContent = 'Draw something first!';
    return;
  }
  const pad = 6;
  x0 = Math.max(0, x0 - pad);
  y0 = Math.max(0, y0 - pad);
  x1 = Math.min(dc.width - 1, x1 + pad);
  y1 = Math.min(dc.height - 1, y1 + pad);
  const w = x1 - x0 + 1,
    h = y1 - y0 + 1,
    sc = 256 / Math.max(w, h);
  const out = document.createElement('canvas');
  out.width = Math.max(8, Math.round(w * sc));
  out.height = Math.max(8, Math.round(h * sc));
  out.getContext('2d').drawImage(dc, x0, y0, w, h, 0, 0, out.width, out.height);
  savedSkin = out.toDataURL('image/png');
  savedSrc = dc.toDataURL('image/png');
  try {
    localStorage.setItem('hyperlane-skin', savedSkin);
    localStorage.setItem('hyperlane-skin-src', savedSrc);
  } catch (e) {}
  applySkin(savedSkin);
  closeSkin();
};

// ---------- AI (tests only) ----------
function autoPlay() {
  const ahead = (lane, maxZ) =>
    objs.filter(
      (o) =>
        (o.type === 'wall' || o.type === 'low') &&
        o.lane === lane &&
        o.z < -1 &&
        o.z > -maxZ
    );
  const look = 18 + G.speed * 0.9;
  const bad = (lane) => ahead(lane, look).some((o) => o.type === 'wall');
  const lowNear = (lane) =>
    ahead(lane, look * 0.5).some((o) => o.type === 'low');
  if (bad(G.lane)) {
    const free = [0, 1, 2]
      .filter((l) => !bad(l))
      .sort((p, q) => Math.abs(p - G.lane) - Math.abs(q - G.lane));
    if (free.length) {
      const nl = G.lane + Math.sign(free[0] - G.lane);
      const clear = !objs.some(
        (o) => o.type === 'wall' && o.lane === nl && o.z > -2.5 && o.z < 2.2
      );
      if (clear) moveLane(nl - G.lane);
    }
  }
  const lows = ahead(G.lane, 60).filter((o) => o.type === 'low');
  if (lows.length && lows[0].z > -(G.speed * 0.3) - 1) jump();
  void lowNear;
}

// ---------- Crash / over ----------
function crash(o) {
  G.state = 'crashing';
  G.tsTarget = 0.25;
  G.shake = 1;
  G.flashA = 0.8;
  G.crashBy =
    o.type +
    ' lane' +
    o.lane +
    ' me' +
    G.lane +
    ' y' +
    G.y.toFixed(2) +
    ' z' +
    o.z.toFixed(2);
  ship.visible = false;
  sfx.crash();
  burst(
    ship.position.x,
    ship.position.y + 0.6,
    ship.position.z,
    120,
    0xff7a3d,
    12
  );
  burst(
    ship.position.x,
    ship.position.y + 0.6,
    ship.position.z,
    60,
    0x7df3ff,
    9
  );
  burst(
    ship.position.x,
    ship.position.y + 0.6,
    ship.position.z,
    40,
    0xffffff,
    14
  );
  setTimeout(showOver, 1300);
}
function showOver() {
  if (G.state !== 'crashing') return;
  G.state = 'over';
  const s = score(),
    isBest = s > best;
  if (isBest) {
    best = s;
    saveBest();
  }
  el.finalScore.textContent = s.toLocaleString('en-US');
  el.finalDist.textContent = Math.floor(G.dist);
  el.finalOrbs.textContent = G.orbs;
  el.finalSpeed.textContent = Math.round(G.top * 3.6);
  el.bestOver.textContent = best.toLocaleString('en-US');
  el.newBest.classList.toggle('hidden', !isBest);
  el.over.classList.remove('hidden');
  el.hud.classList.add('off');
  G.tsTarget = 1;
}

// ---------- Update ----------
const tmpC = new THREE.Color();
function update(rdt, now) {
  G.ts += (G.tsTarget - G.ts) * Math.min(1, 5 * rdt);
  const dt = rdt * G.ts,
    t = now / 1000;
  const running = G.state === 'playing' || G.state === 'countdown';

  if (G.state === 'countdown') {
    G.cd -= rdt;
    if (G.cd <= 0) {
      G.state = 'playing';
      sfx.go();
      banner('GO!', '#4dff9a');
    }
  }
  // speed
  let sp = G.speed;
  if (G.state === 'playing') {
    G.t += dt;
    G.speed = Math.min(VMAX, V0 + G.dist * 0.016);
    sp = G.speed;
    G.top = Math.max(G.top, sp);
    G.dist += (sp * dt) / 1.2;
    if (G.auto) autoPlay();
  } else if (G.state === 'countdown') sp = 14;
  else if (G.state === 'menu') sp = 18;
  else if (G.state === 'crashing' || G.state === 'over')
    sp = Math.max(0, sp * Math.exp(-3 * dt));
  const mv = sp * dt; // world distance this frame

  // ship motion
  const tx = LANES[G.lane];
  G.x += (tx - G.x) * Math.min(1, 13 * dt);
  if (G.state === 'playing') {
    G.vy -= 46 * dt;
    G.y += G.vy * dt;
    if (G.y <= 0) {
      if (!G.grounded && G.vy < -8) {
        sfx.land();
        burst(G.x, 0.1, 0.5, 8, 0x7df3ff, 3);
      }
      G.y = 0;
      G.vy = 0;
      G.grounded = true;
    }
  }
  const bank = clamp((tx - G.x) * -0.16, -0.5, 0.5);
  ship.position.set(G.x, 0.75 + G.y + Math.sin(t * 3) * 0.04, 0);
  shipTilt.rotation.z = bank;
  shipTilt.rotation.x = clamp(G.vy * 0.012, -0.3, 0.3);
  if (G.state === 'menu') {
    ship.position.x = Math.sin(t * 0.8) * 3;
    shipTilt.rotation.z = Math.cos(t * 0.8) * -0.25;
  }
  const fl = 0.8 + Math.sin(t * 40) * 0.15 + sp / 90;
  flame.scale.set(1, fl, 1);
  flame2.scale.set(1, fl, 1);
  shadow.position.y = -ship.position.y + 0.02;
  shadow.scale.setScalar(clamp(1 - G.y * 0.12, 0.4, 1));

  // world scroll
  gridTex.offset.y += mv / 6;
  for (const a of arches) {
    a.position.z += mv;
    if (a.position.z > 14) a.position.z -= 16 * 28;
  }
  for (const s of streaks) {
    s.position.z += mv * 1.8;
    if (s.position.z > 12) s.position.z -= rand(150, 175);
    s.scale.z = 0.4 + sp / 30;
  }
  for (const o of objs) {
    o.z += mv;
    o.g.position.z = o.z;
    if (o.type === 'orb') {
      o.spin += dt * 3;
      o.g.rotation.y = o.spin;
      o.g.rotation.x = o.spin * 0.6;
      o.g.position.y = o.y + Math.sin(o.spin * 1.4) * 0.12;
    }
  }
  // spawning (not in menu / countdown)
  if (G.state === 'playing') {
    G.rowGap -= mv;
    if (G.rowGap <= 0) {
      spawnRow(-150);
      G.rowGap = Math.max(26, sp * 0.68) + rand(0, 8);
    }
    // collisions
    for (const o of objs) {
      if (o.dead || o.z < -2.6 || o.z > 2.6) continue;
      const dx = Math.abs(o.g.position.x - G.x);
      if (o.type === 'wall') {
        if (dx < 1.5 && Math.abs(o.z) < 1.35 && G.y < 2.4) {
          crash(o);
          break;
        }
      } else if (o.type === 'low') {
        if (dx < 1.55 && Math.abs(o.z) < 1.0 && G.y < 0.85) {
          crash(o);
          break;
        }
      } else if (o.type === 'orb') {
        if (
          dx < 1.2 &&
          Math.abs(o.z) < 1.3 &&
          Math.abs(o.g.position.y - (ship.position.y + 0.2)) < 1.5
        ) {
          killObj(o);
          G.orbs++;
          G.combo++;
          sfx.orb(G.combo);
          burst(o.g.position.x, o.g.position.y, o.z, 10, 0xffe36a, 5);
          updateHud(true);
        }
      }
    }
    // palette cycle
    const lvl = Math.floor(G.dist / 400);
    if (lvl !== G.pal) {
      G.pal = lvl;
      setPalette(lvl);
      banner('ZONE ' + (lvl + 1), '#ffd23f');
      sfx.level();
    }
    updateHud();
  }
  objs = objs.filter((o) => {
    if (o.dead) return false;
    if (o.z > 14) {
      scene.remove(o.g);
      return false;
    }
    return true;
  });

  // palette lerp
  palNow.bg.lerp(palTo.bg, Math.min(1, 1.5 * rdt));
  palNow.rail.lerp(palTo.rail, Math.min(1, 1.5 * rdt));
  palNow.sun.lerp(palTo.sun, Math.min(1, 1.5 * rdt));
  scene.background.copy(palNow.bg);
  scene.fog.color.copy(palNow.bg);
  roadMat.color.copy(palNow.rail);
  railMat.color.copy(palNow.rail);
  archMat.color.copy(palNow.rail);
  sunMat.color.copy(palNow.sun);
  tmpC.copy(palNow.rail);

  // camera
  const spN = clamp((sp - V0) / (VMAX - V0), 0, 1);
  const cx = ship.position.x * 0.55;
  const sh = G.shake > 0 ? G.shake * 0.5 : 0;
  camera.position.set(
    cx + rand(-sh, sh),
    4.3 + G.y * 0.35 + rand(-sh, sh),
    8.6
  );
  camera.lookAt(ship.position.x * 0.3, 1.3, -12);
  camera.fov = lerp(
    camera.fov,
    64 + spN * 14 + (G.state === 'menu' ? 0 : 0),
    Math.min(1, 3 * rdt)
  );
  camera.updateProjectionMatrix();

  updateParticles(dt, 0);
  if (running && Math.random() < 0.6)
    emit(
      ship.position.x + rand(-0.2, 0.2),
      ship.position.y,
      1.9,
      rand(-0.5, 0.5),
      rand(0, 0.8),
      4 + sp * 0.4,
      0.35,
      Math.random() < 0.5 ? 0xff9a3d : 0xffe0a0
    );
  G.shake = Math.max(0, G.shake - rdt * 1.4);
  G.flashA = Math.max(0, G.flashA - rdt * 1.8);
  el.flash.style.opacity = G.flashA > 0 ? String(G.flashA * 0.7) : '0';
}

// ---------- Loop ----------
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = clamp((now - last) / 1000, 0, 0.033);
  last = now;
  if (G.state !== 'paused') update(dt, now);
  composer.render();
}

// ---------- Init ----------
resize();
setPalette(0);
resetWorld();
el.bestMenu.textContent = best.toLocaleString('en-US');
requestAnimationFrame((n) => {
  last = n;
  frame(n);
});

if (location.search.includes('debug')) {
  window.__hl = {
    G,
    start: startGame,
    sim: (n) => {
      for (let i = 0; i < n; i++) update(1 / 60, performance.now());
    },
    objs: () => objs,
  };
}

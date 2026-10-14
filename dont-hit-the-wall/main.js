// ============================================================
//  DON'T HIT THE WALL — fixed circuit, seen from above
//  Do laps without touching the walls. Each lap is a bit faster.
// ============================================================

// >>> YOUR CAR IMAGE <<<
// Put a top-down picture of your car in this same folder and set its file name below.
// `rotate` = degrees (clockwise) needed so the FRONT of the car points UP:
//   already facing up -> 0 | facing right -> -90 | facing left -> 90 | facing down -> 180
// If the file is missing, the built-in character "ZIPPY" is drawn instead
// (a little teal car with a living face: the eyes follow the road and the mood changes).
const CAR_IMAGE = {
  src: 'car.png',
  rotate: 0,
};

const canvas = document.getElementById('game');
let ctx = canvas.getContext('2d');
const $ = (id) => document.getElementById(id);

const el = {
  hud: $('hud'),
  dist: $('dist'),
  bestHud: $('bestHud'),
  speed: $('speed'),
  speedBar: $('speedBar'),
  lapLabel: $('lapLabel'),
  lapTime: $('lapTime'),
  bestLapHud: $('bestLapHud'),
  count: $('count'),
  banner: $('banner'),
  menu: $('menu'),
  pause: $('pause'),
  over: $('over'),
  finalScore: $('finalScore'),
  finalSpeed: $('finalSpeed'),
  finalLaps: $('finalLaps'),
  finalLap: $('finalLap'),
  newBest: $('newBest'),
  bestMenu: $('bestMenu'),
  bestLapMenu: $('bestLapMenu'),
  bestOver: $('bestOver'),
};

// ---------- Utils ----------
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const TAU = Math.PI * 2;
const wrap = (a) => {
  while (a > Math.PI) a -= TAU;
  while (a < -Math.PI) a += TAU;
  return a;
};
const fmt = (s) => {
  const m = Math.floor(s / 60);
  return m + ':' + (s - m * 60).toFixed(2).padStart(5, '0');
};
function mulberry(a) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- Car image ----------
const carImg = new Image();
let carImgOK = false;
carImg.onload = () => {
  carImgOK = carImg.naturalWidth > 0;
};
carImg.onerror = () => {
  carImgOK = false;
};
carImg.src = CAR_IMAGE.src;

// ---------- Constants (world units; the whole world is 1000 x 670) ----------
const WORLD_W = 1000,
  WORLD_H = 670;
const CAR_L = 42,
  CAR_W = 22.5,
  SC = CAR_L / 56;
const TW = 86,
  WALL = 15,
  CURB = 7; // road width, wall thickness, kerb width
const M = 4; // world units per meter
const VBASE = 150,
  VMAX = 250,
  VSTEP = 14; // speed grows with every lap

// ---------- The circuit: [x, y, corner radius] polygon with rounded corners ----------
const CORNERS = [
  [130, 550, 90],
  [930, 550, 100],
  [942, 330, 260],
  [895, 200, 200],
  [885, 72, 100],
  [700, 72, 90],
  [700, 392, 90],
  [520, 392, 90],
  [520, 72, 90],
  [130, 72, 100],
  [70, 250, 260],
  [110, 430, 110],
];
let cl = [],
  N = 0,
  L = 0,
  STEP = 8,
  decor = null;

function buildCenterline() {
  const n = CORNERS.length,
    dense = [];
  for (let i = 0; i < n; i++) {
    const P = CORNERS[(i - 1 + n) % n],
      X = CORNERS[i],
      Q = CORNERS[(i + 1) % n],
      r = X[2];
    let u1 = [P[0] - X[0], P[1] - X[1]],
      u2 = [Q[0] - X[0], Q[1] - X[1]];
    const l1 = Math.hypot(...u1),
      l2 = Math.hypot(...u2);
    u1 = [u1[0] / l1, u1[1] / l1];
    u2 = [u2[0] / l2, u2[1] / l2];
    const a = Math.acos(clamp(u1[0] * u2[0] + u1[1] * u2[1], -1, 1));
    const t = r / Math.tan(a / 2);
    const T1 = [X[0] + u1[0] * t, X[1] + u1[1] * t];
    let b = [u1[0] + u2[0], u1[1] + u2[1]];
    const bl = Math.hypot(...b);
    b = [b[0] / bl, b[1] / bl];
    const k = r / Math.sin(a / 2),
      C = [X[0] + b[0] * k, X[1] + b[1] * k];
    const a1 = Math.atan2(T1[1] - C[1], T1[0] - C[0]);
    const T2 = [X[0] + u2[0] * t, X[1] + u2[1] * t];
    const a2 = Math.atan2(T2[1] - C[1], T2[0] - C[0]);
    const d = wrap(a2 - a1);
    const m = Math.max(4, Math.floor((Math.abs(d) * r) / 3));
    for (let j = 0; j <= m; j++) {
      const aa = a1 + (d * j) / m;
      dense.push([C[0] + r * Math.cos(aa), C[1] + r * Math.sin(aa)]);
    }
  }
  // total length + uniform resample
  const cum = [0];
  for (let i = 0; i < dense.length; i++) {
    const a = dense[i],
      b = dense[(i + 1) % dense.length];
    cum.push(cum[i] + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  const total = cum[cum.length - 1];
  N = Math.round(total / 8);
  STEP = total / N;
  L = total;
  const out = [];
  let j = 0;
  for (let i = 0; i < N; i++) {
    const s = i * STEP;
    while (cum[j + 1] < s) j++;
    const a = dense[j],
      b = dense[(j + 1) % dense.length],
      f = (s - cum[j]) / (cum[j + 1] - cum[j] || 1);
    out.push({ x: lerp(a[0], b[0], f), y: lerp(a[1], b[1], f) });
  }
  // rotate so index 0 is the start line, on the long bottom straight, heading right
  let si = 0,
    bd = 1e9;
  out.forEach((p, i) => {
    const d = Math.hypot(p.x - 470, p.y - 550);
    if (d < bd) {
      bd = d;
      si = i;
    }
  });
  cl = out.slice(si).concat(out.slice(0, si));
  for (let i = 0; i < N; i++) {
    const a = cl[(i - 1 + N) % N],
      b = cl[(i + 1) % N];
    cl[i].a = Math.atan2(b.y - a.y, b.x - a.x);
  }
}
function distCL(x, y) {
  let bd = 1e9;
  for (let i = 0; i < N; i++) {
    const d = Math.hypot(x - cl[i].x, y - cl[i].y);
    if (d < bd) bd = d;
  }
  return bd;
}

// scenery: seeded so the circuit always looks the same
function buildDecor() {
  const rnd = mulberry(11),
    R = (a, b) => a + rnd() * (b - a);
  const clear = TW / 2 + WALL + 14;
  const blds = [];
  const pit = { x: 360, y: 630, w: 300, h: 32, pit: true };
  blds.push(pit);
  const roofs = [
    '#c8553d',
    '#d98e3f',
    '#5b7db1',
    '#8d6fb0',
    '#9aa3b2',
    '#4f9a7a',
    '#b8484f',
  ];
  const bOK = (b, extra) => {
    for (const [fx, fy] of [
      [0, 0],
      [0.5, 0],
      [1, 0],
      [0, 0.5],
      [0.5, 0.5],
      [1, 0.5],
      [0, 1],
      [0.5, 1],
      [1, 1],
    ]) {
      if (distCL(b.x + b.w * fx, b.y + b.h * fy) < clear + extra) return false;
    }
    return true;
  };
  const overl = (a, b, m) =>
    a.x < b.x + b.w + m &&
    a.x + a.w + m > b.x &&
    a.y < b.y + b.h + m &&
    a.y + a.h + m > b.y;
  for (let tries = 0; tries < 400 && blds.length < 15; tries++) {
    const w = R(44, 82),
      h = R(34, 58);
    const b = {
      x: R(-120, 1060),
      y: R(-70, 740),
      w,
      h,
      c: roofs[(rnd() * roofs.length) | 0],
      k: rnd(),
    };
    if (!bOK(b, 6) || blds.some((o) => overl(b, o, 12))) continue;
    blds.push(b);
  }
  const trees = [];
  for (let tries = 0; tries < 3600 && trees.length < 430; tries++) {
    const r = R(11, 24),
      x = R(-640, 1640),
      y = R(-420, 1090);
    if (distCL(x, y) < clear + r) continue;
    if (
      blds.some(
        (b) =>
          x > b.x - r - 6 &&
          x < b.x + b.w + r + 6 &&
          y > b.y - r - 6 &&
          y < b.y + b.h + r + 6
      )
    )
      continue;
    if (trees.some((t) => Math.hypot(t.x - x, t.y - y) < (t.r + r) * 0.8))
      continue;
    trees.push({ x, y, r, k: rnd() });
  }
  decor = { blds, trees };
}

// ---------- Layout ----------
let W = 0,
  H = 0,
  dpr = 1,
  VK = 1,
  VX = 0,
  VY = 0,
  staticCv = null;
function layout() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  W = window.innerWidth;
  H = window.innerHeight;
  canvas.width = Math.floor(W * dpr);
  canvas.height = Math.floor(H * dpr);
  const top = 64; // room for the HUD
  VK = Math.min(W / WORLD_W, (H - top) / WORLD_H);
  VX = (W - WORLD_W * VK) / 2;
  VY = top + (H - top - WORLD_H * VK) / 2;
  buildStatic();
}
window.addEventListener('resize', layout);

// ---------- Save ----------
let best = 0,
  bestLap = 0;
try {
  best = parseInt(localStorage.getItem('dhtw-best') || '0', 10) || 0;
} catch (e) {}
try {
  bestLap = parseFloat(localStorage.getItem('dhtw-bestlap') || '0') || 0;
} catch (e) {}
const saveBest = () => {
  try {
    localStorage.setItem('dhtw-best', String(best));
    localStorage.setItem('dhtw-bestlap', String(bestLap));
  } catch (e) {}
};

// ---------- Audio (no engine sound: only short effects) ----------
let ac = null,
  noiseBuf = null,
  muted = false;
function initAudio() {
  if (!ac) {
    try {
      ac = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) {}
  }
  if (ac && ac.state === 'suspended') ac.resume();
  if (ac && !noiseBuf) {
    const len = Math.floor(ac.sampleRate * 1.2);
    noiseBuf = ac.createBuffer(1, len, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }
}
function beep(freq, dur, type = 'sine', vol = 0.05, slide = 0, delay = 0) {
  if (!ac || muted) return;
  const t = ac.currentTime + delay;
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide)
    o.frequency.exponentialRampToValueAtTime(
      Math.max(30, freq + slide),
      t + dur
    );
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(ac.destination);
  o.start(t);
  o.stop(t + dur);
}
function noise(f0, f1, dur, vol) {
  if (!ac || !noiseBuf || muted) return;
  const t = ac.currentTime;
  const s = ac.createBufferSource();
  s.buffer = noiseBuf;
  const bp = ac.createBiquadFilter();
  bp.type = 'lowpass';
  bp.frequency.setValueAtTime(f0, t);
  bp.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const g = ac.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(bp).connect(g).connect(ac.destination);
  s.start(t);
  s.stop(t + dur);
}
const sfx = {
  count: () => beep(520, 0.18, 'square', 0.05),
  go: () => {
    beep(780, 0.4, 'square', 0.06);
    beep(1040, 0.4, 'square', 0.04, 0, 0.02);
  },
  check: () => {
    [0, 4, 7, 12].forEach((n, i) =>
      beep(523 * Math.pow(2, n / 12), 0.16, 'triangle', 0.06, 0, i * 0.06)
    );
  },
  crash: () => {
    noise(2200, 80, 0.9, 0.5);
    beep(80, 0.5, 'sawtooth', 0.12, -40);
    beep(1400, 0.15, 'square', 0.04, -900);
  },
};

// ---------- State ----------
const G = {
  state: 'menu',
  t: 0,
  ts: 1,
  tsTarget: 1,
  shake: 0,
  flash: 0,
  flashColor: '255,255,255',
  p: 0,
  maxP: 0,
  prevS: 0,
  laps: 0,
  lapT: 0,
  runBestLap: 0,
  topSpeed: 0,
  cdT: 0,
  cdStep: 0,
  burn: 0,
  lastDist: -1,
};
let car,
  parts = [],
  marks = [],
  rings = [],
  hit = null;
const keys = { L: false, R: false };
const ptr = { steer: 0 };
let debug = null;

// nearest point on the closed centerline (searching near index `from`)
function nearest(px, py, from) {
  let bd = Infinity,
    bi = from,
    bt = 0,
    bx = 0,
    by = 0;
  for (let k = -6; k <= 10; k++) {
    const i = (from + k + N * 4) % N,
      A = cl[i],
      B = cl[(i + 1) % N];
    const dx = B.x - A.x,
      dy = B.y - A.y,
      l2 = dx * dx + dy * dy;
    const t = clamp(((px - A.x) * dx + (py - A.y) * dy) / l2, 0, 1);
    const cx = A.x + dx * t,
      cy = A.y + dy * t;
    const d = Math.hypot(px - cx, py - cy);
    if (d < bd) {
      bd = d;
      bi = i;
      bt = t;
      bx = cx;
      by = cy;
    }
  }
  return { d: bd, i: bi, t: bt, cx: bx, cy: by, hw: TW / 2 };
}

// ---------- Car ----------
function makeCar() {
  const back = Math.round(70 / STEP);
  const i = (N - back) % N,
    p = cl[i];
  return {
    x: p.x,
    y: p.y,
    vx: 0,
    vy: 0,
    phi: p.a,
    omega: 0,
    steer: 0,
    idx: i,
    t: 0,
    alive: true,
    vF: 0,
    vL: 0,
    lastL: null,
    lastR: null,
    ex: 0,
    danger: 0,
    joy: 0,
  };
}

function drive(dt, steerTarget) {
  car.steer += (steerTarget - car.steer) * Math.min(1, 12 * dt);
  const vT = Math.min(VMAX, VBASE + VSTEP * G.laps);
  const spN0 = clamp(Math.hypot(car.vx, car.vy) / VMAX, 0, 1);
  const turn = 3.4 * clamp(car.vF / 70, 0, 1);
  car.phi += car.steer * turn * dt;
  const fx = Math.cos(car.phi),
    fy = Math.sin(car.phi);
  const rx = -fy,
    ry = fx;
  let vF = car.vx * fx + car.vy * fy;
  let vL = car.vx * rx + car.vy * ry;
  vF += (vT - vF) * Math.min(1, 1.8 * dt);
  const grip = 7.5 - 3.4 * Math.abs(car.steer) * spN0;
  vL *= Math.exp(-grip * dt);
  car.vx = fx * vF + rx * vL;
  car.vy = fy * vF + ry * vL;
  car.x += car.vx * dt;
  car.y += car.vy * dt;
  car.vF = vF;
  car.vL = vL;

  // skid marks + tire smoke while sliding
  const sliding = Math.abs(vL) > 24 && vF > 70;
  const rearX = car.x - fx * CAR_L * 0.3,
    rearY = car.y - fy * CAR_L * 0.3;
  const wl = { x: rearX - rx * CAR_W * 0.4, y: rearY - ry * CAR_W * 0.4 };
  const wr = { x: rearX + rx * CAR_W * 0.4, y: rearY + ry * CAR_W * 0.4 };
  if (sliding) {
    if (car.lastL)
      marks.push({
        x0: car.lastL.x,
        y0: car.lastL.y,
        x1: wl.x,
        y1: wl.y,
        life: 7,
      });
    if (car.lastR)
      marks.push({
        x0: car.lastR.x,
        y0: car.lastR.y,
        x1: wr.x,
        y1: wr.y,
        life: 7,
      });
    if (marks.length > 700) marks.splice(0, marks.length - 700);
    if (Math.random() < 0.7) {
      for (const w of [wl, wr]) {
        parts.push({
          type: 'dust',
          x: w.x,
          y: w.y,
          vx: rand(-25, 25),
          vy: rand(-25, 25),
          life: 0.7,
          max: 0.7,
          size: rand(5, 9) * SC,
          color: '#f4f4f4',
        });
      }
    }
    car.lastL = wl;
    car.lastR = wr;
  } else {
    car.lastL = null;
    car.lastR = null;
  }

  // exhaust flame at high speed
  car.ex = clamp((vF / VMAX - 0.7) * 3, 0, 1);
  if (car.ex > 0 && Math.random() < 0.6) {
    parts.push({
      type: 'fire',
      x: rearX - fx * 4,
      y: rearY - fy * 4,
      vx: -fx * 120 + rand(-25, 25),
      vy: -fy * 120 + rand(-25, 25),
      life: 0.22,
      max: 0.22,
      size: rand(2, 4) * SC * 1.3,
      color: Math.random() < 0.5 ? '#ffd23f' : '#ff7a3d',
    });
  }
  G.topSpeed = Math.max(G.topSpeed, Math.hypot(car.vx, car.vy));
}

function checkWalls() {
  const fx = Math.cos(car.phi),
    fy = Math.sin(car.phi);
  const c = nearest(car.x, car.y, car.idx);
  car.idx = c.i;
  car.t = c.t;
  const ratio = (c.d + CAR_W * 0.46) / c.hw;
  car.danger += (clamp((ratio - 0.6) / 0.35, 0, 1) - car.danger) * 0.25;
  for (const lx of [CAR_L * 0.38, 0, -CAR_L * 0.38]) {
    const px = car.x + fx * lx,
      py = car.y + fy * lx;
    const info = lx === 0 ? c : nearest(px, py, car.idx);
    if (info.d + CAR_W * 0.46 > info.hw) return { info, px, py };
  }
  return null;
}

// progress along the loop (unwrapped), laps
function trackProgress() {
  const s = (car.idx + car.t) * STEP;
  let ds = s - G.prevS;
  if (ds > L / 2) ds -= L;
  else if (ds < -L / 2) ds += L;
  G.prevS = s;
  G.p += ds;
  G.maxP = Math.max(G.maxP, G.p);
  while (G.p >= (G.laps + 1) * L) lapDone();
}

// ---------- Effects ----------
function crash(h) {
  const { info, px, py } = h;
  const d = info.d || 0.001;
  const nx = (px - info.cx) / d,
    ny = (py - info.cy) / d;
  const cx = info.cx + nx * info.hw,
    cy = info.cy + ny * info.hw;
  const sp = Math.hypot(car.vx, car.vy);
  const vN = car.vx * nx + car.vy * ny;
  car.vx = (car.vx - nx * vN * 1.5) * 0.7;
  car.vy = (car.vy - ny * vN * 1.5) * 0.7;
  car.omega =
    (Math.random() < 0.5 ? -1 : 1) * rand(5, 9) * (0.5 + (sp / VMAX) * 0.5);
  car.alive = false;
  G.state = 'crashing';
  G.tsTarget = 0.3;
  G.shake = 14;
  G.flash = 0.85;
  G.flashColor = '255,255,255';
  G.burn = 3.5;
  hit = { x: cx, y: cy, life: 0.9, max: 0.9 };
  rings.push({
    x: cx,
    y: cy,
    r0: 6,
    r1: CAR_L * 2.6,
    life: 0.5,
    max: 0.5,
    color: '#ffffff',
    w: 8,
  });
  rings.push({
    x: cx,
    y: cy,
    r0: 6,
    r1: CAR_L * 1.8,
    life: 0.7,
    max: 0.7,
    color: '#ffb347',
    w: 6,
  });
  for (let i = 0; i < 70; i++) {
    const a = Math.atan2(-ny, -nx) + rand(-1.3, 1.3),
      s = rand(100, 520),
      life = rand(0.3, 0.9);
    parts.push({
      type: 'spark',
      x: cx,
      y: cy,
      vx: Math.cos(a) * s,
      vy: Math.sin(a) * s,
      life,
      max: life,
      size: rand(1.2, 3.4),
      color:
        Math.random() < 0.5
          ? '#ffd23f'
          : Math.random() < 0.5
          ? '#ff8a3d'
          : '#ffffff',
    });
  }
  for (let i = 0; i < 16; i++) {
    const a = rand(0, TAU),
      s = rand(60, 300),
      life = rand(1, 2);
    parts.push({
      type: 'debris',
      x: car.x,
      y: car.y,
      vx: Math.cos(a) * s + car.vx * 0.3,
      vy: Math.sin(a) * s + car.vy * 0.3,
      life,
      max: life,
      size: rand(3, 7),
      color: Math.random() < 0.6 ? '#e63946' : '#222',
      rot: rand(0, TAU),
      vr: rand(-12, 12),
    });
  }
  for (let i = 0; i < 24; i++) {
    const a = rand(0, TAU),
      s = rand(15, 110),
      life = rand(0.9, 1.8);
    parts.push({
      type: 'smoke',
      x: cx + rand(-6, 6),
      y: cy + rand(-6, 6),
      vx: Math.cos(a) * s,
      vy: Math.sin(a) * s,
      life,
      max: life,
      size: rand(9, 18) * SC * 1.3,
      color: '#3a3a44',
    });
  }
  sfx.crash();
  setTimeout(showOver, 1500);
}

function showOver() {
  if (G.state !== 'crashing') return;
  G.state = 'over';
  const dist = Math.floor(Math.max(0, G.maxP) / M);
  const isBest = dist > best;
  if (isBest) best = dist;
  const isLap = G.runBestLap > 0 && (bestLap === 0 || G.runBestLap < bestLap);
  if (isLap) bestLap = G.runBestLap;
  if (isBest || isLap) saveBest();
  el.finalScore.textContent = dist.toLocaleString('en-US') + ' m';
  el.finalSpeed.textContent = Math.round((G.topSpeed / M) * 3.6);
  el.finalLaps.textContent = G.laps;
  el.finalLap.textContent = G.runBestLap > 0 ? fmt(G.runBestLap) : '--';
  el.bestOver.textContent = best.toLocaleString('en-US') + ' m';
  el.newBest.classList.toggle('hidden', !(isBest && dist > 0));
  el.over.classList.remove('hidden');
  el.hud.classList.add('off');
  G.tsTarget = 1;
}

function showBanner(text) {
  el.banner.textContent = text;
  el.banner.classList.remove('show');
  void el.banner.offsetWidth;
  el.banner.classList.add('show');
}

function lapDone() {
  G.laps++;
  const time = G.lapT;
  G.lapT = 0;
  const isBestRun = G.runBestLap === 0 || time < G.runBestLap;
  if (isBestRun) G.runBestLap = time;
  const record = bestLap === 0 || time < bestLap;
  car.joy = 1.5;
  const p = cl[0],
    nx = -Math.sin(p.a),
    ny = Math.cos(p.a);
  const cols = [
    '#ff4d6d',
    '#ffd23f',
    '#4dff9a',
    '#4dc3ff',
    '#ffffff',
    '#c77dff',
  ];
  for (const side of [-1, 1]) {
    const ex = p.x + nx * (TW / 2) * side,
      ey = p.y + ny * (TW / 2) * side;
    for (let j = 0; j < 26; j++) {
      const a = rand(0, TAU),
        s = rand(60, 260),
        life = rand(0.9, 1.6);
      parts.push({
        type: 'confetti',
        x: ex,
        y: ey,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life,
        max: life,
        size: rand(3, 6),
        color: cols[(Math.random() * cols.length) | 0],
        rot: rand(0, TAU),
        vr: rand(-10, 10),
      });
    }
  }
  rings.push({
    x: p.x,
    y: p.y,
    r0: 8,
    r1: TW * 0.9,
    life: 0.6,
    max: 0.6,
    color: '#ffd23f',
    w: 6,
  });
  showBanner('LAP ' + G.laps + ' · ' + fmt(time) + (record ? ' ★' : ''));
  sfx.check();
}

// ---------- Input ----------
function inputSteer() {
  return (keys.R ? 1 : 0) - (keys.L ? 1 : 0) + ptr.steer;
}
window.addEventListener('keydown', (e) => {
  initAudio();
  if (e.code === 'ArrowLeft' || e.code === 'KeyA' || e.code === 'KeyQ') {
    keys.L = true;
    e.preventDefault();
  } else if (e.code === 'ArrowRight' || e.code === 'KeyD') {
    keys.R = true;
    e.preventDefault();
  } else if (e.repeat) return;
  else if (e.code === 'KeyP' || e.code === 'Escape') togglePause();
  else if (e.code === 'KeyM') muted = !muted;
  else if (e.code === 'Enter' && (G.state === 'menu' || G.state === 'over'))
    startGame();
});
window.addEventListener('keyup', (e) => {
  if (e.code === 'ArrowLeft' || e.code === 'KeyA' || e.code === 'KeyQ')
    keys.L = false;
  if (e.code === 'ArrowRight' || e.code === 'KeyD') keys.R = false;
});
function setPtr(e) {
  ptr.steer = e.clientX < W / 2 ? -1 : 1;
}
canvas.addEventListener('pointerdown', (e) => {
  initAudio();
  setPtr(e);
  try {
    canvas.setPointerCapture(e.pointerId);
  } catch (err) {}
});
canvas.addEventListener('pointermove', (e) => {
  if (ptr.steer !== 0) setPtr(e);
});
const upPtr = () => {
  ptr.steer = 0;
};
canvas.addEventListener('pointerup', upPtr);
canvas.addEventListener('pointercancel', upPtr);
window.addEventListener('blur', () => {
  keys.L = keys.R = false;
  ptr.steer = 0;
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

// ---------- AI (menu attract mode + debug) ----------
function aiSteer() {
  const look = 4 + Math.round((clamp(car.vF, 0, 300) / STEP) * 0.2);
  const tp = cl[(car.idx + look) % N];
  const err = wrap(Math.atan2(tp.y - car.y, tp.x - car.x) - car.phi);
  return clamp(err * 2.4, -1, 1);
}

// ---------- Run management ----------
function newRun() {
  car = makeCar();
  parts = [];
  marks = [];
  rings = [];
  hit = null;
  const s = (car.idx + car.t) * STEP;
  Object.assign(G, {
    t: 0,
    ts: 1,
    tsTarget: 1,
    shake: 0,
    flash: 0,
    p: s - L,
    maxP: s - L,
    prevS: s,
    laps: 0,
    lapT: 0,
    runBestLap: 0,
    topSpeed: 0,
    burn: 0,
    lastDist: -1,
  });
}

function startGame() {
  newRun();
  G.state = 'countdown';
  G.cdStep = 4;
  G.cdT = 0;
  el.menu.classList.add('hidden');
  el.over.classList.add('hidden');
  el.pause.classList.add('hidden');
  el.hud.classList.remove('off');
  el.bestHud.textContent = best.toLocaleString('en-US') + ' m';
  el.bestLapHud.textContent = bestLap > 0 ? fmt(bestLap) : '--';
  el.dist.innerHTML = '0<small> m</small>';
  el.lapLabel.textContent = 'LAP 1';
  el.lapTime.textContent = '0:00.00';
}

function showCount(text, go) {
  el.count.textContent = text;
  el.count.classList.toggle('go', !!go);
  el.count.classList.remove('hidden');
  el.count.style.animation = 'none';
  void el.count.offsetWidth;
  el.count.style.animation = '';
}

// ---------- Update ----------
function update(rdt) {
  G.ts += (G.tsTarget - G.ts) * Math.min(1, 5 * rdt);
  const dt = rdt * G.ts;

  if (G.state === 'menu') {
    drive(dt, aiSteer());
    if (checkWalls()) newRun();
  } else if (G.state === 'countdown') {
    G.cdT -= rdt;
    if (G.cdT <= 0) {
      G.cdStep--;
      if (G.cdStep > 0) {
        showCount(String(G.cdStep));
        sfx.count();
        G.cdT = 1;
      } else {
        showCount('GO!', true);
        sfx.go();
        G.state = 'playing';
      }
    }
    if (Math.random() < 0.4) {
      parts.push({
        type: 'dust',
        x: car.x - Math.cos(car.phi) * CAR_L * 0.5 + rand(-4, 4),
        y: car.y - Math.sin(car.phi) * CAR_L * 0.5 + rand(-4, 4),
        vx: rand(-12, 12),
        vy: rand(-12, 12),
        life: 0.5,
        max: 0.5,
        size: rand(4, 7) * SC,
        color: '#eee',
      });
    }
  } else if (G.state === 'playing') {
    G.t += dt;
    G.lapT += dt;
    car.joy = Math.max(0, car.joy - dt);
    const st = debug && debug.auto ? aiSteer() : clamp(inputSteer(), -1, 1);
    drive(dt, st);
    const h = checkWalls();
    if (h) crash(h);
    else trackProgress();
  } else if (G.state === 'crashing' || G.state === 'over') {
    car.x += car.vx * dt;
    car.y += car.vy * dt;
    car.vx *= Math.exp(-2.2 * dt);
    car.vy *= Math.exp(-2.2 * dt);
    car.phi += car.omega * dt;
    car.omega *= Math.exp(-1.6 * dt);
    if (G.burn > 0) {
      G.burn -= dt;
      if (Math.random() < 0.8)
        parts.push({
          type: 'fire',
          x: car.x + rand(-5, 5),
          y: car.y + rand(-5, 5),
          vx: rand(-25, 25),
          vy: rand(-50, -10),
          life: 0.5,
          max: 0.5,
          size: rand(3, 6) * SC * 1.3,
          color: Math.random() < 0.5 ? '#ff7a3d' : '#ffd23f',
        });
      if (Math.random() < 0.5)
        parts.push({
          type: 'smoke',
          x: car.x + rand(-5, 5),
          y: car.y + rand(-5, 5),
          vx: rand(-20, 20),
          vy: rand(-55, -15),
          life: 1.3,
          max: 1.3,
          size: rand(7, 13) * SC * 1.3,
          color: '#303038',
        });
    }
  }

  // particles & friends
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    p.life -= dt;
    if (p.life <= 0) {
      parts.splice(i, 1);
      continue;
    }
    if (p.type === 'smoke' || p.type === 'dust')
      (p.vx -= p.vx * 1.5 * dt), (p.vy -= p.vy * 1.5 * dt);
    else if (p.type === 'confetti') {
      p.vx -= p.vx * 1.2 * dt;
      p.vy -= p.vy * 1.2 * dt;
      p.rot += p.vr * dt;
    } else if (p.type === 'debris') {
      p.vx -= p.vx * 1.6 * dt;
      p.vy -= p.vy * 1.6 * dt;
      p.rot += p.vr * dt;
    } else {
      p.vx -= p.vx * 1.0 * dt;
      p.vy -= p.vy * 1.0 * dt;
    }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
  }
  if (parts.length > 700) parts.splice(0, parts.length - 700);
  for (let i = rings.length - 1; i >= 0; i--) {
    rings[i].life -= dt;
    if (rings[i].life <= 0) rings.splice(i, 1);
  }
  for (let i = marks.length - 1; i >= 0; i--) {
    marks[i].life -= rdt;
    if (marks[i].life <= 0) marks.splice(i, 1);
  }
  if (hit) {
    hit.life -= dt;
    if (hit.life <= 0) hit = null;
  }

  G.shake = Math.max(0, G.shake - rdt * 24);
  G.flash = Math.max(0, G.flash - rdt * 1.6);
}

// ---------- Static layer: the whole circuit, drawn once ----------
function offsetPath(g, off) {
  g.beginPath();
  for (let i = 0; i <= N; i++) {
    const p = cl[i % N],
      nx = -Math.sin(p.a),
      ny = Math.cos(p.a);
    const x = p.x + nx * off,
      y = p.y + ny * off;
    i ? g.lineTo(x, y) : g.moveTo(x, y);
  }
  g.closePath();
}
function centerPath(g) {
  g.beginPath();
  cl.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
  g.closePath();
}
function drawBuilding(b) {
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  rr(b.x + 6, b.y + 8, b.w, b.h, 4);
  ctx.fill();
  if (b.pit) {
    ctx.fillStyle = '#cfd5df';
    rr(b.x, b.y, b.w, b.h, 4);
    ctx.fill();
    ctx.fillStyle = '#e63946';
    ctx.fillRect(b.x, b.y, b.w, 7);
    ctx.fillStyle = '#9aa3b2';
    for (let x = b.x + 14; x < b.x + b.w - 8; x += 22)
      ctx.fillRect(x, b.y + 13, 12, b.h - 20);
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 1.5;
    rr(b.x, b.y, b.w, b.h, 4);
    ctx.stroke();
    return;
  }
  ctx.fillStyle = b.c;
  rr(b.x, b.y, b.w, b.h, 4);
  ctx.fill();
  const g = ctx.createLinearGradient(b.x, b.y, b.x, b.y + b.h);
  g.addColorStop(0, 'rgba(255,255,255,0.28)');
  g.addColorStop(0.5, 'rgba(255,255,255,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.22)');
  ctx.fillStyle = g;
  rr(b.x, b.y, b.w, b.h, 4);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.3)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(b.x + 2, b.y + b.h / 2);
  ctx.lineTo(b.x + b.w - 2, b.y + b.h / 2);
  ctx.stroke();
  rr(b.x, b.y, b.w, b.h, 4);
  ctx.stroke();
  if (b.k > 0.5) {
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(b.x + b.w - 16, b.y + 7, 8, 8);
  }
}
function buildStatic() {
  if (!cl.length) return;
  const c = document.createElement('canvas');
  c.width = canvas.width;
  c.height = canvas.height;
  const g = c.getContext('2d');
  g.setTransform(dpr * VK, 0, 0, dpr * VK, dpr * VX, dpr * VY);
  const main = ctx;
  ctx = g;
  const x0 = -VX / VK - 20,
    y0 = -VY / VK - 20,
    x1 = (W - VX) / VK + 20,
    y1 = (H - VY) / VK + 20;

  // grass checker
  g.fillStyle = '#2f8f45';
  g.fillRect(x0, y0, x1 - x0, y1 - y0);
  const TS = 70;
  g.fillStyle = '#379547';
  for (let gx = Math.floor(x0 / TS); gx <= Math.floor(x1 / TS); gx++)
    for (let gy = Math.floor(y0 / TS); gy <= Math.floor(y1 / TS); gy++) {
      if ((gx + gy) & 1) g.fillRect(gx * TS, gy * TS, TS + 0.5, TS + 0.5);
    }
  const vis = (x, y, r) => x + r > x0 && x - r < x1 && y + r > y0 && y - r < y1;

  // wall shadow, wall, wall inner face, asphalt
  g.lineJoin = 'round';
  g.lineCap = 'round';
  g.save();
  g.translate(5, 7);
  centerPath(g);
  g.strokeStyle = 'rgba(0,0,0,0.25)';
  g.lineWidth = TW + WALL * 2 + 2;
  g.stroke();
  g.restore();
  centerPath(g);
  g.strokeStyle = '#8c95a5';
  g.lineWidth = TW + WALL * 2;
  g.stroke();
  centerPath(g);
  g.strokeStyle = '#cdd3dc';
  g.lineWidth = TW + WALL * 2 - 4;
  g.stroke();
  centerPath(g);
  g.strokeStyle = '#6f7a8a';
  g.lineWidth = TW + 4;
  g.stroke();
  centerPath(g);
  g.strokeStyle = '#3b414e';
  g.lineWidth = TW;
  g.stroke();

  // kerbs: red/white blocks along both edges
  g.lineCap = 'butt';
  for (const side of [-1, 1]) {
    const off = side * (TW / 2 - CURB / 2);
    g.lineWidth = CURB;
    g.setLineDash([9, 9]);
    offsetPath(g, off);
    g.lineDashOffset = 0;
    g.strokeStyle = '#e63946';
    g.stroke();
    offsetPath(g, off);
    g.lineDashOffset = -9;
    g.strokeStyle = '#ffffff';
    g.stroke();
  }
  g.setLineDash([12, 16]);
  g.lineDashOffset = 0;
  centerPath(g);
  g.strokeStyle = 'rgba(255,255,255,0.7)';
  g.lineWidth = 2;
  g.stroke();
  g.setLineDash([]);

  // start / finish line
  {
    const p = cl[0],
      tx = Math.cos(p.a),
      ty = Math.sin(p.a),
      nx = -ty,
      ny = tx;
    const cells = 10,
      cw = (TW - CURB * 2) / cells,
      depth = 6;
    for (let row = 0; row < 2; row++)
      for (let k = 0; k < cells; k++) {
        g.fillStyle = (k + row) % 2 ? '#111' : '#fff';
        const o0 = -(TW - CURB * 2) / 2 + k * cw,
          o1 = o0 + cw,
          a0 = (row - 1) * depth,
          a1 = a0 + depth;
        g.beginPath();
        g.moveTo(p.x + nx * o0 + tx * a0, p.y + ny * o0 + ty * a0);
        g.lineTo(p.x + nx * o1 + tx * a0, p.y + ny * o1 + ty * a0);
        g.lineTo(p.x + nx * o1 + tx * a1, p.y + ny * o1 + ty * a1);
        g.lineTo(p.x + nx * o0 + tx * a1, p.y + ny * o0 + ty * a1);
        g.closePath();
        g.fill();
      }
  }

  // scenery
  for (const b of decor.blds)
    if (vis(b.x + b.w / 2, b.y + b.h / 2, 90)) drawBuilding(b);
  for (const t of decor.trees) if (vis(t.x, t.y, t.r + 6)) drawTree(t);
  ctx = main;
  staticCv = c;
}

function rr(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function drawTree(t) {
  const { x, y, r } = t;
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.beginPath();
  ctx.ellipse(x + r * 0.3, y + r * 0.4, r, r * 0.85, 0, 0, TAU);
  ctx.fill();
  const g = ctx.createRadialGradient(
    x - r * 0.35,
    y - r * 0.4,
    r * 0.1,
    x,
    y,
    r
  );
  if (t.k < 0.7) {
    g.addColorStop(0, '#6bd77a');
    g.addColorStop(1, '#1f7a34');
  } else {
    g.addColorStop(0, '#8be36f');
    g.addColorStop(1, '#2d8a2a');
  }
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.beginPath();
  ctx.arc(x - r * 0.3, y - r * 0.32, r * 0.4, 0, TAU);
  ctx.fill();
}

// ZIPPY — an original little car with a face. Body is drawn in the car's own frame
// (front = up); the face is drawn screen-aligned so the eyes are always readable.
function drawProcCar() {
  const L = CAR_L,
    Wd = CAR_W,
    hl = L / 2,
    hw = (Wd / 2) * 1.06,
    s = SC;

  // wheels
  ctx.fillStyle = '#14151c';
  for (const sx of [-1, 1])
    for (const sy of [-1, 1]) {
      rr(
        sx * (hw + 0.4 * s) - 4.8 * s,
        sy * hl * 0.55 - 8.5 * s,
        9.6 * s,
        17 * s,
        3.4 * s
      );
      ctx.fill();
    }

  // chubby teal body
  const g = ctx.createLinearGradient(-hw, 0, hw, 0);
  g.addColorStop(0, '#4fe6d4');
  g.addColorStop(0.5, '#1fc7b4');
  g.addColorStop(1, '#0d8f86');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(-hw * 0.62, -hl * 0.97);
  ctx.quadraticCurveTo(0, -hl * 1.12, hw * 0.62, -hl * 0.97);
  ctx.quadraticCurveTo(hw * 1.08, -hl * 0.6, hw * 1.0, -hl * 0.1);
  ctx.quadraticCurveTo(hw * 1.1, hl * 0.55, hw * 0.8, hl * 0.93);
  ctx.quadraticCurveTo(0, hl * 1.02, -hw * 0.8, hl * 0.93);
  ctx.quadraticCurveTo(-hw * 1.1, hl * 0.55, -hw * 1.0, -hl * 0.1);
  ctx.quadraticCurveTo(-hw * 1.08, -hl * 0.6, -hw * 0.62, -hl * 0.97);
  ctx.closePath();
  ctx.fill();
  ctx.lineWidth = 1.4 * s;
  ctx.strokeStyle = 'rgba(0,50,60,0.45)';
  ctx.stroke();

  // sunny hood + trunk stripes
  ctx.fillStyle = '#ffd23f';
  rr(-hw * 0.17, -hl * 1.0, hw * 0.34, hl * 0.58, 2 * s);
  ctx.fill();
  rr(-hw * 0.17, hl * 0.46, hw * 0.34, hl * 0.44, 2 * s);
  ctx.fill();

  // rear wing
  ctx.fillStyle = '#c98f00';
  ctx.fillRect(-hw * 0.5, hl * 0.86, 2 * s, hl * 0.1);
  ctx.fillRect(hw * 0.5 - 2 * s, hl * 0.86, 2 * s, hl * 0.1);
  ctx.fillStyle = '#ffc61a';
  rr(-hw * 0.98, hl * 0.93, hw * 1.96, hl * 0.17, 3 * s);
  ctx.fill();

  // glossy highlight
  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  ctx.beginPath();
  ctx.ellipse(-hw * 0.64, -hl * 0.3, hw * 0.15, hl * 0.4, 0, 0, TAU);
  ctx.fill();

  // side mirrors
  ctx.fillStyle = '#0d8f86';
  for (const sx of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(sx * (hw + 1.6 * s), -hl * 0.22, 2.6 * s, 0, TAU);
    ctx.fill();
  }

  // big round headlights + tail lights
  ctx.save();
  ctx.shadowColor = '#fff3a0';
  ctx.shadowBlur = 12;
  ctx.fillStyle = '#fff7b0';
  for (const sx of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(sx * hw * 0.6, -hl * 0.84, 3.7 * s, 0, TAU);
    ctx.fill();
  }
  ctx.shadowColor = '#ff2a6a';
  ctx.fillStyle = '#ff2a6a';
  for (const sx of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(sx * hw * 0.62, hl * 0.8, 2.4 * s, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

function drawFace(t) {
  const s = SC;
  const crashed = !car.alive;
  const spN = clamp(Math.hypot(car.vx, car.vy) / VMAX, 0, 1);
  const hx = Math.cos(car.phi),
    hy = Math.sin(car.phi); // where the car is heading, on screen
  const scared = !crashed && car.danger > 0.55;
  const joy = !crashed && car.joy > 0;
  const focused = !crashed && !scared && !joy && spN > 0.82;
  const blink = !crashed && !joy && !scared && t % 3.7 < 0.12;
  const shake = scared ? Math.sin(t * 70) * 0.6 * s : 0;
  const ink = '#1b2238';

  ctx.save();
  ctx.translate(car.x + hx * 1.6 * s + shake, car.y + hy * 1.6 * s);
  ctx.lineCap = 'round';

  // cream roof dome
  const dome = 13 * s;
  ctx.fillStyle = 'rgba(0,40,50,0.25)';
  ctx.beginPath();
  ctx.arc(1.2 * s, 1.6 * s, dome, 0, TAU);
  ctx.fill();
  const dg = ctx.createRadialGradient(
    -dome * 0.3,
    -dome * 0.35,
    dome * 0.1,
    0,
    0,
    dome
  );
  dg.addColorStop(0, '#fffef5');
  dg.addColorStop(1, '#ffe9a6');
  ctx.fillStyle = dg;
  ctx.beginPath();
  ctx.arc(0, 0, dome, 0, TAU);
  ctx.fill();
  ctx.lineWidth = 1.3 * s;
  ctx.strokeStyle = 'rgba(0,70,80,0.5)';
  ctx.stroke();

  // eyes
  const ex = 6.1 * s,
    ey = -1.6 * s;
  const er = (scared ? 5.6 : 5.0) * s,
    erY = er * 1.12;
  for (const sd of [-1, 1]) {
    const x = sd * ex;
    if (crashed) {
      // dizzy spirals
      ctx.strokeStyle = ink;
      ctx.lineWidth = 1.5 * s;
      ctx.beginPath();
      for (let a = 0; a < TAU * 2.2; a += 0.3) {
        const r = (a / (TAU * 2.2)) * er * 1.05;
        const px = x + Math.cos(a + t * 9 * sd) * r,
          py = ey + Math.sin(a + t * 9 * sd) * r;
        a === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      }
      ctx.stroke();
    } else if (joy || blink) {
      // happy ^ ^ or a blink
      ctx.strokeStyle = ink;
      ctx.lineWidth = 2.1 * s;
      ctx.beginPath();
      if (joy)
        ctx.arc(x, ey + 1.8 * s, er * 0.75, Math.PI * 1.1, Math.PI * 1.9);
      else {
        ctx.moveTo(x - er * 0.8, ey + 0.5 * s);
        ctx.lineTo(x + er * 0.8, ey + 0.5 * s);
      }
      ctx.stroke();
    } else {
      // open eyes, pupils look where the car goes
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.ellipse(x, ey, er, erY, 0, 0, TAU);
      ctx.fill();
      ctx.lineWidth = 1.1 * s;
      ctx.strokeStyle = 'rgba(27,34,56,0.55)';
      ctx.stroke();
      const pr = (scared ? 1.7 : 2.7) * s;
      const px = x + hx * 2.1 * s,
        py = ey + hy * 2.1 * s;
      ctx.fillStyle = ink;
      ctx.beginPath();
      ctx.arc(px, py, pr, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(px - pr * 0.35, py - pr * 0.4, pr * 0.34, 0, TAU);
      ctx.fill();
    }
  }

  // eyebrows: determined at top speed, worried near a wall
  if (focused || scared) {
    ctx.strokeStyle = ink;
    ctx.lineWidth = 1.9 * s;
    for (const sd of [-1, 1]) {
      const yIn = focused ? -8.4 * s : -10.4 * s;
      const yOut = focused ? -9.4 * s : -8.6 * s;
      ctx.beginPath();
      ctx.moveTo(sd * 2.2 * s, yIn);
      ctx.lineTo(sd * 8.4 * s, yOut);
      ctx.stroke();
    }
  }
  // rosy cheeks when happy
  if (joy) {
    ctx.fillStyle = 'rgba(255,107,139,0.5)';
    for (const sd of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(sd * 9.4 * s, 3.4 * s, 2.4 * s, 0, TAU);
      ctx.fill();
    }
  }

  // mouth
  const my = 7.6 * s;
  ctx.strokeStyle = '#7a1f3d';
  ctx.lineWidth = 1.9 * s;
  if (crashed) {
    // wobbly mouth, tongue out
    ctx.beginPath();
    ctx.moveTo(-4.5 * s, my);
    ctx.quadraticCurveTo(0, my + 1.2 * s, 4.5 * s, my - 0.6 * s);
    ctx.stroke();
    ctx.fillStyle = '#ff6b8b';
    ctx.beginPath();
    ctx.ellipse(2.8 * s, my + 2.4 * s, 1.9 * s, 2.8 * s, 0.2, 0, TAU);
    ctx.fill();
  } else if (scared) {
    // zig-zag of fear
    ctx.beginPath();
    ctx.moveTo(-5 * s, my);
    for (let i = 1; i <= 5; i++)
      ctx.lineTo(-5 * s + i * 2 * s, my + (i % 2 ? -1.6 : 1.2) * s);
    ctx.stroke();
  } else if (joy) {
    // big open smile
    ctx.fillStyle = '#5a1230';
    ctx.beginPath();
    ctx.arc(0, my - 1.2 * s, 5 * s, 0, Math.PI);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#ff6b8b';
    ctx.beginPath();
    ctx.ellipse(0, my + 2.6 * s, 2.6 * s, 1.6 * s, 0, 0, TAU);
    ctx.fill();
  } else if (focused) {
    // confident smirk
    ctx.beginPath();
    ctx.moveTo(-4.8 * s, my);
    ctx.quadraticCurveTo(0, my + 2.6 * s, 4.8 * s, my - 0.4 * s);
    ctx.stroke();
  } else {
    // friendly smile
    ctx.beginPath();
    ctx.arc(0, my - 3.2 * s, 5.2 * s, 0.2 * Math.PI, 0.8 * Math.PI);
    ctx.stroke();
  }

  // sweat drop
  if (scared) {
    const dy = ((t * 2.2) % 1) * 3 * s;
    ctx.fillStyle = '#7fd4ff';
    ctx.beginPath();
    ctx.moveTo(-13.5 * s, -8 * s + dy);
    ctx.quadraticCurveTo(-16 * s, -4.4 * s + dy, -13.5 * s, -3.4 * s + dy);
    ctx.quadraticCurveTo(-11 * s, -4.4 * s + dy, -13.5 * s, -8 * s + dy);
    ctx.fill();
  }
  ctx.restore();
}

function drawCar(t) {
  // shadow
  ctx.save();
  ctx.translate(car.x + 5 * SC, car.y + 8 * SC);
  ctx.rotate(car.phi + Math.PI / 2);
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  rr(-CAR_W * 0.5, -CAR_L * 0.5, CAR_W, CAR_L, 8 * SC);
  ctx.fill();
  ctx.restore();
  // body
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.phi + Math.PI / 2);
  if (carImgOK) {
    const iw = carImg.naturalWidth,
      ih = carImg.naturalHeight;
    const sc = (CAR_L * 1.12) / Math.max(iw, ih);
    ctx.rotate((CAR_IMAGE.rotate * Math.PI) / 180);
    ctx.drawImage(carImg, (-iw * sc) / 2, (-ih * sc) / 2, iw * sc, ih * sc);
  } else drawProcCar();
  ctx.restore();
  if (!carImgOK) drawFace(t);
}

function drawParticle(p) {
  const k = clamp(p.life / p.max, 0, 1);
  if (p.type === 'smoke') {
    ctx.globalAlpha = k * 0.55;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * (1 + (1 - k) * 2), 0, TAU);
    ctx.fill();
  } else if (p.type === 'dust') {
    ctx.globalAlpha = k * 0.45;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * (0.6 + (1 - k) * 1.6), 0, TAU);
    ctx.fill();
  } else if (p.type === 'debris' || p.type === 'confetti') {
    ctx.globalAlpha = clamp(k * 2, 0, 1);
    ctx.fillStyle = p.color;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
    ctx.restore();
  } else {
    ctx.globalAlpha = clamp(k * 1.4, 0, 1);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * (0.4 + k), 0, TAU);
    ctx.fill();
  }
}

// ---------- Render ----------
function render(now) {
  const t = now / 1000;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#2f8f45';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (!car) return;
  if (staticCv) ctx.drawImage(staticCv, 0, 0);

  const sx = G.shake > 0 ? rand(-G.shake, G.shake) * 0.5 : 0,
    sy = G.shake > 0 ? rand(-G.shake, G.shake) * 0.5 : 0;
  ctx.setTransform(dpr * VK, 0, 0, dpr * VK, dpr * (VX + sx), dpr * (VY + sy));

  // skid marks
  ctx.lineCap = 'round';
  ctx.lineWidth = 3;
  for (const m of marks) {
    ctx.strokeStyle = `rgba(10,10,14,${clamp(m.life / 7, 0, 1) * 0.55})`;
    ctx.beginPath();
    ctx.moveTo(m.x0, m.y0);
    ctx.lineTo(m.x1, m.y1);
    ctx.stroke();
  }

  // under-car particles
  for (const p of parts)
    if (p.type === 'smoke' || p.type === 'dust') drawParticle(p);
  ctx.globalAlpha = 1;

  drawCar(t);

  // wall hit glow + rings + sparks (additive)
  ctx.globalCompositeOperation = 'lighter';
  if (hit) {
    const k = hit.life / hit.max;
    const g = ctx.createRadialGradient(
      hit.x,
      hit.y,
      0,
      hit.x,
      hit.y,
      CAR_L * 1.6
    );
    g.addColorStop(0, `rgba(255,230,150,${0.9 * k})`);
    g.addColorStop(1, 'rgba(255,120,40,0)');
    ctx.fillStyle = g;
    ctx.fillRect(
      hit.x - CAR_L * 1.6,
      hit.y - CAR_L * 1.6,
      CAR_L * 3.2,
      CAR_L * 3.2
    );
  }
  for (const r of rings) {
    const k = 1 - r.life / r.max;
    ctx.globalAlpha = (1 - k) * 0.9;
    ctx.strokeStyle = r.color;
    ctx.lineWidth = Math.max(0.5, r.w * (1 - k));
    ctx.beginPath();
    ctx.arc(r.x, r.y, r.r0 + (r.r1 - r.r0) * (1 - Math.pow(1 - k, 3)), 0, TAU);
    ctx.stroke();
  }
  for (const p of parts)
    if (p.type === 'spark' || p.type === 'fire') drawParticle(p);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  for (const p of parts)
    if (p.type === 'debris' || p.type === 'confetti') drawParticle(p);
  ctx.globalAlpha = 1;

  // flash + vignette (screen space)
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (G.flash > 0) {
    ctx.fillStyle = `rgba(${G.flashColor},${clamp(G.flash, 0, 1) * 0.7})`;
    ctx.fillRect(0, 0, W, H);
  }
  const vg = ctx.createRadialGradient(
    W / 2,
    H / 2,
    Math.min(W, H) * 0.55,
    W / 2,
    H / 2,
    Math.max(W, H) * 0.85
  );
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(5,20,10,0.35)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);
}

// ---------- HUD ----------
function updateHud() {
  const d = Math.floor(Math.max(0, G.maxP) / M);
  if (d !== G.lastDist) {
    el.dist.innerHTML = d.toLocaleString('en-US') + '<small> m</small>';
    if (d > 0 && d % 100 === 0) {
      el.dist.classList.remove('pop');
      void el.dist.offsetWidth;
      el.dist.classList.add('pop');
    }
    G.lastDist = d;
  }
  const sp = Math.hypot(car.vx, car.vy);
  el.speed.textContent = Math.round((sp / M) * 3.6);
  el.speedBar.style.width = clamp((sp / VMAX) * 100, 0, 100) + '%';
  el.lapLabel.textContent = 'LAP ' + (G.laps + 1);
  el.lapTime.textContent = fmt(G.lapT);
  if (G.runBestLap > 0)
    el.bestLapHud.textContent = fmt(
      bestLap > 0 ? Math.min(bestLap, G.runBestLap) : G.runBestLap
    );
}

// ---------- Loop ----------
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = clamp((now - last) / 1000, 0, 0.033);
  last = now;
  if (G.state !== 'paused') update(dt);
  if (
    G.state === 'playing' ||
    G.state === 'countdown' ||
    G.state === 'crashing'
  )
    updateHud();
  render(now);
}

// ---------- Init ----------
buildCenterline();
buildDecor();
layout();
newRun();
G.state = 'menu';
el.bestMenu.textContent = best.toLocaleString('en-US') + ' m';
el.bestLapMenu.textContent = bestLap > 0 ? fmt(bestLap) : '--';
requestAnimationFrame((n) => {
  last = n;
  frame(n);
});

// test hook (only with ?debug in the URL)
if (location.search.includes('debug')) {
  debug = {
    auto: false,
    G,
    sim: (n) => {
      for (let i = 0; i < n; i++) {
        update(1 / 60);
        if (G.state === 'crashing' || G.state === 'over') break;
      }
    },
    getCar: () => car,
    start: startGame,
    N: () => N,
    L: () => L,
  };
  window.__dhw = debug;
}

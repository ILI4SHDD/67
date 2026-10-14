// ============================================================
//  SLICE RUSH — swipe to slice, dodge the bombs
// ============================================================
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const $ = (id) => document.getElementById(id);

const el = {
  hud: $('hud'),
  score: $('score'),
  bestHud: $('bestHud'),
  lives: $('lives'),
  menu: $('menu'),
  over: $('over'),
  finalScore: $('finalScore'),
  finalSlices: $('finalSlices'),
  finalChain: $('finalChain'),
  newBest: $('newBest'),
  bestMenu: $('bestMenu'),
  bestOver: $('bestOver'),
};

// ---------- Utils ----------
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const TAU = Math.PI * 2;

// ---------- Layout ----------
let W = 0,
  H = 0,
  dpr = 1,
  R = 40,
  GRAV = 1000;
let bokeh = [];
function layout() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  W = window.innerWidth;
  H = window.innerHeight;
  canvas.width = Math.floor(W * dpr);
  canvas.height = Math.floor(H * dpr);
  R = clamp(Math.min(W, H) * 0.085, 30, 58);
  GRAV = H * 1.4;
  const hues = [20, 35, 330, 280, 50];
  bokeh = [];
  for (let i = 0; i < 16; i++) {
    bokeh.push({
      x: Math.random() * W,
      y: Math.random() * H,
      r: rand(30, 120),
      vx: rand(-8, 8),
      vy: rand(-14, -4),
      hue: hues[i % hues.length],
      a: rand(0.05, 0.14),
    });
  }
}
window.addEventListener('resize', layout);

// ---------- Save ----------
let best = 0;
try {
  best = parseInt(localStorage.getItem('slicerush-best') || '0', 10) || 0;
} catch (e) {}
const saveBest = () => {
  try {
    localStorage.setItem('slicerush-best', String(best));
  } catch (e) {}
};

// ---------- Audio ----------
let ac = null,
  noiseBuf = null;
function initAudio() {
  if (!ac) {
    try {
      ac = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) {}
  }
  if (ac && ac.state === 'suspended') ac.resume();
  if (ac && !noiseBuf) {
    const len = Math.floor(ac.sampleRate * 0.8);
    noiseBuf = ac.createBuffer(1, len, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }
}
function beep(freq, dur, type = 'sine', vol = 0.05, slide = 0, delay = 0) {
  if (!ac) return;
  const t = ac.currentTime + delay;
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide)
    o.frequency.exponentialRampToValueAtTime(
      Math.max(40, freq + slide),
      t + dur
    );
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(ac.destination);
  o.start(t);
  o.stop(t + dur);
}
function swish(f0, f1, dur, vol) {
  if (!ac || !noiseBuf) return;
  const t = ac.currentTime;
  const s = ac.createBufferSource();
  s.buffer = noiseBuf;
  const bp = ac.createBiquadFilter();
  bp.type = 'bandpass';
  bp.Q.value = 1.2;
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
  slice: () => {
    swish(3600, 900, 0.18, 0.14);
    beep(170 + Math.random() * 70, 0.1, 'triangle', 0.05, -60);
  },
  bomb: () => {
    swish(1000, 60, 0.7, 0.4);
    beep(90, 0.5, 'sawtooth', 0.1, -50);
  },
  gold: () => {
    [0, 4, 7, 12].forEach((n, i) =>
      beep(523 * Math.pow(2, n / 12), 0.22, 'sine', 0.06, 0, i * 0.07)
    );
  },
  combo: (n) => {
    for (let i = 0; i < Math.min(n, 6); i++)
      beep(440 * Math.pow(2, i / 6), 0.14, 'triangle', 0.06, 0, i * 0.05);
  },
  miss: () => beep(220, 0.4, 'triangle', 0.08, -140),
  over: () => {
    beep(330, 0.3, 'triangle', 0.07, -160);
    beep(190, 0.7, 'triangle', 0.07, -110, 0.25);
  },
};

// ---------- Fruit definitions ----------
// flesh = [center, edge]
const DEF = {
  melon: {
    r: 1.3,
    rind: ['#58d96f', '#1b7f36'],
    pith: '#e6f9cf',
    flesh: ['#ff4a63', '#ff8c98'],
    seed: '#161616',
    juice: '#ff4d6a',
  },
  orange: {
    r: 1.0,
    rind: ['#ffbe55', '#f07800'],
    pith: '#fff0cc',
    flesh: ['#ffb732', '#ffd98a'],
    juice: '#ffa11f',
  },
  apple: {
    r: 1.0,
    rind: ['#ff7b7b', '#b8122b'],
    pith: '#fff6e0',
    flesh: ['#f7ecc0', '#fffdf0'],
    seed: '#5b3410',
    juice: '#fff0b8',
  },
  kiwi: {
    r: 0.92,
    rind: ['#b58a5c', '#6b4526'],
    pith: '#eaffcf',
    flesh: ['#eaffcf', '#6cc43a'],
    seed: '#161616',
    juice: '#9be04e',
  },
  lemon: {
    r: 0.95,
    sx: 1.2,
    rind: ['#fff480', '#f2b81c'],
    pith: '#fffce0',
    flesh: ['#fff9b0', '#fff6a0'],
    juice: '#fff176',
  },
  star: {
    r: 1.0,
    rind: ['#fff2a8', '#ffb300'],
    pith: '#fff8d0',
    flesh: ['#fffbe0', '#ffd54a'],
    juice: '#ffd54a',
  },
  bomb: { r: 1.0 },
};
const FRUIT_NAMES = ['melon', 'orange', 'apple', 'kiwi', 'lemon'];

// ---------- State ----------
const G = {
  state: 'menu',
  t: 0,
  score: 0,
  lives: 3,
  slices: 0,
  bestChain: 0,
  chain: 0,
  chainT: 0,
  chainX: 0,
  chainY: 0,
  waveT: 0,
  ts: 1,
  tsTarget: 1,
  slow: 0,
  shake: 0,
  flash: 0,
  flashColor: '255,255,255',
  menuT: 0,
  attract: true,
};
let objs, halves, parts, rings, slashes, stains, popups, queue;
let trail = [];
let lastScore = -1;

function buildHearts() {
  el.lives.innerHTML = '<span class="heart">♥</span>'.repeat(3);
}
function reset() {
  objs = [];
  halves = [];
  parts = [];
  rings = [];
  slashes = [];
  stains = [];
  popups = [];
  queue = [];
  Object.assign(G, {
    t: 0,
    score: 0,
    lives: 3,
    slices: 0,
    bestChain: 0,
    chain: 0,
    chainT: 0,
    waveT: 0.5,
    ts: 1,
    tsTarget: 1,
    slow: 0,
    shake: 0,
    flash: 0,
    menuT: 0.2,
  });
  buildHearts();
  lastScore = -1;
}

function startGame() {
  reset();
  G.state = 'playing';
  G.attract = false;
  el.menu.classList.add('hidden');
  el.over.classList.add('hidden');
  el.hud.classList.remove('off');
  el.bestHud.textContent = best.toLocaleString('en-US');
}

function gameOver() {
  G.state = 'over';
  G.attract = false;
  G.slow = 0;
  G.tsTarget = 0.3;
  sfx.over();
  const isBest = G.score > best;
  if (isBest) {
    best = G.score;
    saveBest();
  }
  setTimeout(() => {
    if (G.state !== 'over') return;
    el.finalScore.textContent = G.score.toLocaleString('en-US');
    el.finalSlices.textContent = G.slices;
    el.finalChain.textContent = G.bestChain;
    el.bestOver.textContent = best.toLocaleString('en-US');
    el.newBest.classList.toggle('hidden', !isBest);
    el.over.classList.remove('hidden');
    el.hud.classList.add('off');
    G.attract = true;
    G.tsTarget = 1;
    G.menuT = 0.3;
  }, 1300);
}

function loseLife(x, y, why) {
  if (G.state !== 'playing') return;
  G.lives--;
  const h = el.lives.children[G.lives];
  if (h) h.classList.add('lost');
  if (why !== 'bomb') {
    G.flash = 0.4;
    G.flashColor = '255,40,80';
    sfx.miss();
  }
  G.shake = Math.max(G.shake, why === 'bomb' ? 26 : 10);
  popup(
    clamp(x, 70, W - 70),
    Math.min(y, H - 70),
    why === 'bomb' ? 'BOOM!' : 'MISS',
    '#ff4d6a',
    36
  );
  if (G.lives <= 0) gameOver();
}

// ---------- Effects helpers ----------
function popup(x, y, text, color = '#fff', size = 24) {
  popups.push({ x, y, text, color, size, life: 1, max: 1 });
}

// ---------- Spawning ----------
function launch(kind) {
  const name =
    kind === 'fruit'
      ? FRUIT_NAMES[(Math.random() * FRUIT_NAMES.length) | 0]
      : kind === 'gold'
      ? 'star'
      : 'bomb';
  const r = R * DEF[name].r;
  const apex = H * rand(0.16, 0.46);
  const vy = -Math.sqrt(2 * GRAV * (H + r - apex));
  const T = (2 * -vy) / GRAV;
  const x = rand(W * 0.14, W * 0.86);
  const vx = ((W / 2 - x) / T) * rand(0.15, 1.0) + rand(-30, 30);
  objs.push({
    kind,
    name,
    x,
    y: H + r * 1.2,
    vx,
    vy,
    rot: rand(0, TAU),
    vr: rand(-6, 6),
    r,
    alive: true,
    age: 0,
    auto: false,
    sp: 0,
  });
}
function spawnWave() {
  const maxN = 1 + Math.min(4, Math.floor(G.t / 22));
  const n = 1 + Math.floor(Math.random() * maxN);
  for (let i = 0; i < n; i++) {
    let kind = 'fruit';
    const r = Math.random();
    if (G.t > 6 && r < clamp(0.09 + G.t / 1100, 0.09, 0.2)) kind = 'bomb';
    else if (r > 0.972) kind = 'gold';
    queue.push({ t: i * 0.14 + Math.random() * 0.05, kind });
  }
}

// ---------- Slicing ----------
function trySlice(x0, y0, x1, y1) {
  const dx = x1 - x0,
    dy = y1 - y0;
  const len2 = dx * dx + dy * dy;
  if (len2 < 16) return;
  const ang = Math.atan2(dy, dx);
  for (const o of objs) {
    if (!o.alive) continue;
    const t = clamp(((o.x - x0) * dx + (o.y - y0) * dy) / len2, 0, 1);
    const px = x0 + dx * t,
      py = y0 + dy * t;
    const rr = o.r * 0.92;
    if ((o.x - px) ** 2 + (o.y - py) ** 2 < rr * rr) sliceObj(o, ang, false);
  }
}

function sliceObj(o, ang, auto) {
  o.alive = false;
  if (o.kind === 'bomb') {
    explodeBomb(o);
    return;
  }
  const f = DEF[o.name];
  const gold = o.kind === 'gold';

  if (!auto) {
    G.slices++;
    G.score += gold ? 5 : 1;
    if (G.chainT > 0 && G.chain > 0) G.chain++;
    else G.chain = 1;
    G.chainT = 0.32;
    G.chainX = o.x;
    G.chainY = o.y;
    sfx.slice();
    popup(
      o.x,
      o.y - o.r,
      gold ? '+5' : '+1',
      gold ? '#ffd54a' : '#ffffff',
      gold ? 30 : 22
    );
  }

  // halves
  const nx = -Math.sin(ang),
    ny = Math.cos(ang);
  for (let h = 0; h < 2; h++) {
    const sg = h === 0 ? -1 : 1;
    const sp = rand(120, 220);
    halves.push({
      name: o.name,
      r: o.r,
      half: h,
      x: o.x,
      y: o.y,
      vx: o.vx * 0.55 + nx * sg * sp,
      vy: o.vy * 0.55 + ny * sg * sp - 80,
      rot: ang,
      vr: sg * rand(1.5, 4.5),
    });
  }
  // juice
  const nd = gold ? 30 : 22;
  for (let i = 0; i < nd; i++) {
    const side = Math.random() < 0.5 ? -1 : 1;
    const a = Math.atan2(ny * side, nx * side) + rand(-0.9, 0.9);
    const s = rand(120, 460);
    const life = rand(0.5, 1.1);
    parts.push({
      type: 'drop',
      x: o.x + rand(-o.r * 0.4, o.r * 0.4),
      y: o.y + rand(-o.r * 0.4, o.r * 0.4),
      vx: Math.cos(a) * s + o.vx * 0.3,
      vy: Math.sin(a) * s + o.vy * 0.3,
      life,
      max: life,
      size: rand(2.5, 6.5),
      color: f.juice,
    });
  }
  // stain
  stains.push({
    x: o.x,
    y: o.y,
    color: f.juice,
    life: 7,
    max: 7,
    blobs: Array.from({ length: 7 }, () => ({
      dx: rand(-1, 1) * o.r * 0.9,
      dy: rand(-1, 1) * o.r * 0.9,
      r: rand(0.15, 0.5) * o.r,
    })),
  });
  if (stains.length > 18) stains.shift();
  // streak + ring
  slashes.push({ x: o.x, y: o.y, ang, len: o.r * 3.4, life: 0.28, max: 0.28 });
  rings.push({
    x: o.x,
    y: o.y,
    r0: o.r * 0.4,
    r1: o.r * 2.2,
    life: 0.38,
    max: 0.38,
    color: f.juice,
    w: 5,
  });

  if (gold && !auto) {
    G.slow = 3.5;
    G.tsTarget = 0.45;
    sfx.gold();
    G.flash = 0.35;
    G.flashColor = '255,213,74';
    popup(W / 2, H * 0.3, 'SLOW-MO!', '#ffd54a', 46);
    rings.push({
      x: o.x,
      y: o.y,
      r0: 10,
      r1: Math.max(W, H) * 0.6,
      life: 0.9,
      max: 0.9,
      color: '#ffd54a',
      w: 10,
    });
    for (let i = 0; i < 40; i++) {
      const a = Math.random() * TAU,
        s = rand(100, 520),
        life = rand(0.6, 1.3);
      parts.push({
        type: 'star',
        x: o.x,
        y: o.y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life,
        max: life,
        size: rand(3, 8),
        color: '#fff3b0',
      });
    }
  }
}

function explodeBomb(o) {
  sfx.bomb();
  rings.push({
    x: o.x,
    y: o.y,
    r0: 10,
    r1: R * 5,
    life: 0.5,
    max: 0.5,
    color: '#ffffff',
    w: 14,
  });
  rings.push({
    x: o.x,
    y: o.y,
    r0: 10,
    r1: R * 3.6,
    life: 0.65,
    max: 0.65,
    color: '#ffb347',
    w: 10,
  });
  rings.push({
    x: o.x,
    y: o.y,
    r0: 10,
    r1: R * 2.4,
    life: 0.8,
    max: 0.8,
    color: '#ff4d3a',
    w: 8,
  });
  for (let i = 0; i < 70; i++) {
    const a = Math.random() * TAU,
      s = rand(200, 720),
      life = rand(0.4, 1.0);
    parts.push({
      type: 'spark',
      x: o.x,
      y: o.y,
      vx: Math.cos(a) * s,
      vy: Math.sin(a) * s,
      life,
      max: life,
      size: rand(2, 5),
      color: Math.random() < 0.5 ? '#ffd54a' : '#ff7a3d',
    });
  }
  for (let i = 0; i < 26; i++) {
    const a = Math.random() * TAU,
      s = rand(30, 190),
      life = rand(0.8, 1.6);
    parts.push({
      type: 'smoke',
      x: o.x + rand(-10, 10),
      y: o.y + rand(-10, 10),
      vx: Math.cos(a) * s,
      vy: Math.sin(a) * s,
      life,
      max: life,
      size: rand(14, 30),
      color: '#3c3c48',
    });
  }
  stains.push({
    x: o.x,
    y: o.y,
    color: '#0d0d16',
    life: 7,
    max: 7,
    blobs: Array.from({ length: 9 }, () => ({
      dx: rand(-1, 1) * o.r * 1.4,
      dy: rand(-1, 1) * o.r * 1.4,
      r: rand(0.2, 0.6) * o.r,
    })),
  });
  if (stains.length > 18) stains.shift();
  G.shake = 26;
  G.flash = 0.75;
  G.flashColor = '255,255,255';
  if (G.state === 'playing') {
    G.chain = 0;
    G.chainT = 0;
    loseLife(o.x, o.y, 'bomb');
  }
}

function finishChain() {
  const n = G.chain;
  G.chain = 0;
  G.bestChain = Math.max(G.bestChain, n);
  if (n >= 3 && G.state === 'playing') {
    const bonus = (n - 1) * 2;
    G.score += bonus;
    const names = { 3: 'TRIPLE!', 4: 'QUAD!', 5: 'MEGA!' };
    popup(
      G.chainX,
      G.chainY - 46,
      (names[n] || 'INSANE!') + ' +' + bonus,
      '#ffd54a',
      28 + Math.min(n, 6) * 3
    );
    sfx.combo(n);
    rings.push({
      x: G.chainX,
      y: G.chainY,
      r0: 10,
      r1: 140 + n * 20,
      life: 0.5,
      max: 0.5,
      color: '#ffd54a',
      w: 6,
    });
    G.shake = Math.max(G.shake, 6 + n);
  }
}

// ---------- Input ----------
const ptr = { x: 0, y: 0, down: false, has: false };
window.addEventListener('pointerdown', (e) => {
  initAudio();
  ptr.down = true;
  ptr.has = true;
  ptr.x = e.clientX;
  ptr.y = e.clientY;
  if (e.pointerType !== 'mouse')
    trail.push({ x: ptr.x, y: ptr.y, t: performance.now() });
});
window.addEventListener('pointermove', (e) => {
  const x = e.clientX,
    y = e.clientY;
  const active = e.pointerType === 'mouse' ? true : ptr.down;
  if (active) {
    if (ptr.has) {
      trail.push({ x, y, t: performance.now() });
      if (trail.length > 40) trail.shift();
      if (G.state === 'playing') trySlice(ptr.x, ptr.y, x, y);
    }
    ptr.has = true;
  }
  ptr.x = x;
  ptr.y = y;
});
const release = (e) => {
  ptr.down = false;
  if (e.pointerType !== 'mouse') ptr.has = false;
};
window.addEventListener('pointerup', release);
window.addEventListener('pointercancel', release);
document.documentElement.addEventListener('mouseleave', () => {
  ptr.has = false;
});
window.addEventListener('keydown', (e) => {
  if (e.code === 'Enter' && G.state !== 'playing') {
    initAudio();
    startGame();
  }
});
$('playBtn').onclick = () => {
  initAudio();
  startGame();
};
$('retryBtn').onclick = () => {
  initAudio();
  startGame();
};

// ---------- Update ----------
function update(rdt) {
  G.ts += (G.tsTarget - G.ts) * Math.min(1, 6 * rdt);
  const dt = rdt * G.ts;

  if (G.slow > 0) {
    G.slow -= rdt;
    if (G.slow <= 0) {
      G.slow = 0;
      if (G.state === 'playing') G.tsTarget = 1;
    }
  }

  for (const b of bokeh) {
    b.x += b.vx * rdt;
    b.y += b.vy * rdt;
    if (b.y < -b.r) {
      b.y = H + b.r;
      b.x = Math.random() * W;
    }
    if (b.x < -b.r) b.x = W + b.r;
    if (b.x > W + b.r) b.x = -b.r;
  }

  // spawning
  if (G.state === 'playing') {
    G.t += dt;
    G.waveT -= dt;
    if (G.waveT <= 0) {
      spawnWave();
      G.waveT = rand(1.1, 1.9) * Math.max(0.5, 1 - G.t / 160);
    }
    for (let i = queue.length - 1; i >= 0; i--) {
      queue[i].t -= dt;
      if (queue[i].t <= 0) {
        launch(queue[i].kind);
        queue.splice(i, 1);
      }
    }
  } else if (G.attract) {
    G.menuT -= dt;
    if (G.menuT <= 0) {
      const n = 1 + (Math.random() < 0.5 ? 1 : 0);
      for (let i = 0; i < n; i++) launch('fruit');
      G.menuT = rand(0.9, 1.5);
    }
  }

  // objects
  for (let i = objs.length - 1; i >= 0; i--) {
    const o = objs[i];
    o.age += dt;
    o.vy += GRAV * dt;
    o.x += o.vx * dt;
    o.y += o.vy * dt;
    o.rot += o.vr * dt;

    if (o.kind === 'bomb' && o.alive) {
      o.sp -= dt;
      if (o.sp <= 0) {
        o.sp = 0.035;
        const fx = o.r * 0.35,
          fy = -o.r * 1.35,
          c = Math.cos(o.rot),
          s = Math.sin(o.rot);
        parts.push({
          type: 'spark',
          x: o.x + c * fx - s * fy,
          y: o.y + s * fx + c * fy,
          vx: rand(-60, 60),
          vy: rand(-120, -20),
          life: 0.35,
          max: 0.35,
          size: rand(1.5, 3.5),
          color: Math.random() < 0.5 ? '#ffd54a' : '#ff8a3d',
        });
      }
    }
    if (o.kind === 'gold' && o.alive && Math.random() < 0.4) {
      const a = Math.random() * TAU;
      parts.push({
        type: 'star',
        x: o.x + Math.cos(a) * o.r,
        y: o.y + Math.sin(a) * o.r,
        vx: rand(-30, 30),
        vy: rand(-30, 30),
        life: 0.6,
        max: 0.6,
        size: rand(2, 5),
        color: '#fff3b0',
      });
    }
    // attract mode: auto-slice at the apex
    if (
      G.attract &&
      o.kind !== 'bomb' &&
      o.alive &&
      !o.auto &&
      o.vy >= 0 &&
      o.y < H * 0.85
    ) {
      o.auto = true;
      if (Math.random() < 0.85) {
        const ang = rand(-0.9, 0.9) + (Math.random() < 0.5 ? 0 : Math.PI);
        const now = performance.now();
        for (let k = 0; k < 6; k++) {
          const d = (k - 2.5) * o.r * 0.7;
          trail.push({
            x: o.x + Math.cos(ang) * d,
            y: o.y + Math.sin(ang) * d,
            t: now - (5 - k) * 10,
          });
        }
        sliceObj(o, ang, true);
      }
    }
    if (o.vy > 0 && o.y > H + o.r * 1.6) {
      if (o.alive && o.kind === 'fruit' && G.state === 'playing')
        loseLife(o.x, H, 'miss');
      objs.splice(i, 1);
    }
  }

  // halves
  for (let i = halves.length - 1; i >= 0; i--) {
    const h = halves[i];
    h.vy += GRAV * dt;
    h.x += h.vx * dt;
    h.y += h.vy * dt;
    h.rot += h.vr * dt;
    if (h.y > H + h.r * 2.2) halves.splice(i, 1);
  }

  // particles
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    p.life -= dt;
    if (p.life <= 0) {
      parts.splice(i, 1);
      continue;
    }
    if (p.type === 'drop') {
      p.vy += GRAV * 0.7 * dt;
      p.vx -= p.vx * 0.8 * dt;
    } else if (p.type === 'smoke') {
      p.vy -= 40 * dt;
      p.vx -= p.vx * 1.5 * dt;
      p.vy -= p.vy * 0.8 * dt;
    } else {
      p.vy += GRAV * 0.25 * dt;
      p.vx -= p.vx * 1.2 * dt;
    }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
  }
  for (let i = rings.length - 1; i >= 0; i--) {
    rings[i].life -= dt;
    if (rings[i].life <= 0) rings.splice(i, 1);
  }
  for (let i = slashes.length - 1; i >= 0; i--) {
    slashes[i].life -= dt;
    if (slashes[i].life <= 0) slashes.splice(i, 1);
  }
  for (let i = stains.length - 1; i >= 0; i--) {
    stains[i].life -= rdt;
    if (stains[i].life <= 0) stains.splice(i, 1);
  }
  for (let i = popups.length - 1; i >= 0; i--) {
    const p = popups[i];
    p.life -= rdt * 0.9;
    p.y -= 44 * rdt;
    if (p.life <= 0) popups.splice(i, 1);
  }

  if (G.chain > 0) {
    G.chainT -= rdt;
    if (G.chainT <= 0) finishChain();
  }
  G.shake = Math.max(0, G.shake - rdt * 32);
  G.flash = Math.max(0, G.flash - rdt * 1.6);
}

// ---------- Drawing: fruits ----------
function circle(x, y, r) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
}
function seedAt(a, d, rx, ry) {
  ctx.save();
  ctx.translate(Math.cos(a) * d, Math.sin(a) * d);
  ctx.rotate(a);
  ctx.beginPath();
  ctx.ellipse(0, 0, rx, ry, 0, 0, TAU);
  ctx.fill();
  ctx.restore();
}
function dots(r, color, n, size) {
  ctx.fillStyle = color;
  for (let i = 0; i < n; i++) {
    const a = i * 2.399,
      d = Math.sqrt((i + 0.5) / n) * r * 0.9;
    circle(Math.cos(a) * d, Math.sin(a) * d, size);
    ctx.fill();
  }
}

function drawWhole(name, r, t) {
  const f = DEF[name];
  ctx.save();
  ctx.scale(f.sx || 1, 1);
  if (name === 'star') {
    ctx.shadowColor = '#ffd54a';
    ctx.shadowBlur = 22 + 10 * Math.sin(t * 8);
  }
  const g = ctx.createRadialGradient(
    -r * 0.35,
    -r * 0.4,
    r * 0.1,
    0,
    0,
    r * 1.05
  );
  g.addColorStop(0, f.rind[0]);
  g.addColorStop(1, f.rind[1]);
  ctx.fillStyle = g;
  circle(0, 0, r);
  ctx.fill();
  ctx.shadowBlur = 0;

  ctx.save();
  circle(0, 0, r);
  ctx.clip();
  if (name === 'melon') {
    ctx.strokeStyle = 'rgba(8,70,25,0.42)';
    ctx.lineWidth = r * 0.13;
    for (let k = -2; k <= 2; k++) {
      ctx.beginPath();
      ctx.moveTo(k * r * 0.16, -r);
      ctx.quadraticCurveTo(k * r * 0.66, 0, k * r * 0.16, r);
      ctx.stroke();
    }
  } else if (name === 'orange') dots(r, 'rgba(160,70,0,0.35)', 14, r * 0.04);
  else if (name === 'kiwi') dots(r, 'rgba(50,28,12,0.4)', 40, r * 0.035);
  else if (name === 'apple') {
    const sh = ctx.createLinearGradient(0, -r, 0, r);
    sh.addColorStop(0.5, 'rgba(0,0,0,0)');
    sh.addColorStop(1, 'rgba(60,0,10,0.35)');
    ctx.fillStyle = sh;
    ctx.fillRect(-r, -r, r * 2, r * 2);
  }
  ctx.restore();

  // highlight
  ctx.fillStyle = 'rgba(255,255,255,0.38)';
  ctx.beginPath();
  ctx.ellipse(-r * 0.38, -r * 0.42, r * 0.26, r * 0.13, -0.7, 0, TAU);
  ctx.fill();

  // extras
  if (name === 'apple') {
    ctx.strokeStyle = '#6b3f1d';
    ctx.lineWidth = r * 0.1;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, -r * 0.85);
    ctx.quadraticCurveTo(r * 0.05, -r * 1.1, r * 0.12, -r * 1.22);
    ctx.stroke();
    ctx.fillStyle = '#4fc15a';
    ctx.beginPath();
    ctx.ellipse(r * 0.3, -r * 1.05, r * 0.24, r * 0.1, -0.5, 0, TAU);
    ctx.fill();
  } else if (name === 'orange') {
    ctx.fillStyle = '#3f9d3a';
    circle(0, -r * 0.84, r * 0.09);
    ctx.fill();
  } else if (name === 'lemon') {
    ctx.fillStyle = f.rind[1];
    circle(-r * 0.98, 0, r * 0.1);
    ctx.fill();
    circle(r * 0.98, 0, r * 0.1);
    ctx.fill();
  } else if (name === 'star') {
    ctx.fillStyle = '#fffbe6';
    ctx.strokeStyle = '#ff9800';
    ctx.lineWidth = r * 0.07;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5,
        rad = i % 2 ? r * 0.27 : r * 0.62;
      const x = Math.cos(a) * rad,
        y = Math.sin(a) * rad;
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

function drawHalf(name, r, half) {
  const f = DEF[name],
    sx = f.sx || 1,
    dir = half === 0 ? -1 : 1;
  ctx.save();
  ctx.beginPath();
  if (half === 0) ctx.rect(-r * sx * 2, -r * 2, r * sx * 4, r * 2);
  else ctx.rect(-r * sx * 2, 0, r * sx * 4, r * 2);
  ctx.clip();
  ctx.scale(sx, 1);
  let g = ctx.createRadialGradient(
    -r * 0.3,
    -r * 0.35,
    r * 0.1,
    0,
    0,
    r * 1.05
  );
  g.addColorStop(0, f.rind[0]);
  g.addColorStop(1, f.rind[1]);
  ctx.fillStyle = g;
  circle(0, 0, r);
  ctx.fill();
  ctx.fillStyle = f.pith;
  circle(0, 0, r * 0.92);
  ctx.fill();
  g = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 0.84);
  g.addColorStop(0, f.flesh[0]);
  g.addColorStop(1, f.flesh[1]);
  ctx.fillStyle = g;
  circle(0, 0, r * 0.84);
  ctx.fill();

  if (name === 'melon') {
    ctx.fillStyle = f.seed;
    for (let i = 1; i <= 5; i++)
      seedAt((dir * Math.PI * i) / 6, r * 0.5, r * 0.09, r * 0.045);
    for (let i = 1; i <= 3; i++)
      seedAt((dir * Math.PI * i) / 4, r * 0.26, r * 0.08, r * 0.04);
  } else if (name === 'orange' || name === 'lemon' || name === 'star') {
    ctx.strokeStyle =
      name === 'star' ? 'rgba(255,170,0,0.5)' : 'rgba(255,255,255,0.6)';
    ctx.lineWidth = r * 0.045;
    for (let k = 0; k <= 8; k++) {
      const a = (dir * Math.PI * k) / 8;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(a) * r * 0.8, Math.sin(a) * r * 0.8);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    circle(0, 0, r * 0.07);
    ctx.fill();
  } else if (name === 'apple') {
    ctx.fillStyle = '#e2cf94';
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 0.2, r * 0.34, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = f.seed;
    seedAt(dir * 1.1, r * 0.13, r * 0.06, r * 0.032);
    seedAt(dir * 2.0, r * 0.13, r * 0.06, r * 0.032);
  } else if (name === 'kiwi') {
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = r * 0.03;
    for (let k = 0; k <= 16; k++) {
      const a = (dir * Math.PI * k) / 16;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * r * 0.24, Math.sin(a) * r * 0.24);
      ctx.lineTo(Math.cos(a) * r * 0.72, Math.sin(a) * r * 0.72);
      ctx.stroke();
    }
    ctx.fillStyle = '#f6ffe4';
    circle(0, 0, r * 0.2);
    ctx.fill();
    ctx.fillStyle = f.seed;
    for (let i = 1; i <= 9; i++)
      seedAt((dir * Math.PI * i) / 10, r * 0.36, r * 0.05, r * 0.025);
  }
  ctx.restore();
}

function drawBomb(r, t) {
  ctx.save();
  ctx.shadowColor = 'rgba(255,60,60,0.55)';
  ctx.shadowBlur = 22;
  const g = ctx.createRadialGradient(-r * 0.3, -r * 0.35, r * 0.1, 0, 0, r);
  g.addColorStop(0, '#62627a');
  g.addColorStop(0.5, '#23232f');
  g.addColorStop(1, '#08080f');
  ctx.fillStyle = g;
  circle(0, 0, r);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = `rgba(255,60,60,${0.45 + 0.4 * Math.sin(t * 10)})`;
  ctx.lineWidth = r * 0.08;
  circle(0, 0, r * 0.9);
  ctx.stroke();
  // X mark
  ctx.strokeStyle = '#ff4d4d';
  ctx.lineWidth = r * 0.14;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-r * 0.3, -r * 0.1);
  ctx.lineTo(r * 0.3, r * 0.5);
  ctx.moveTo(r * 0.3, -r * 0.1);
  ctx.lineTo(-r * 0.3, r * 0.5);
  ctx.stroke();
  // highlight
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.beginPath();
  ctx.ellipse(-r * 0.38, -r * 0.45, r * 0.22, r * 0.11, -0.7, 0, TAU);
  ctx.fill();
  // cap + fuse
  ctx.fillStyle = '#4a4a58';
  ctx.beginPath();
  ctx.rect(-r * 0.22, -r * 1.12, r * 0.44, r * 0.22);
  ctx.fill();
  ctx.strokeStyle = '#d2ad6e';
  ctx.lineWidth = r * 0.08;
  ctx.beginPath();
  ctx.moveTo(0, -r * 1.1);
  ctx.quadraticCurveTo(r * 0.05, -r * 1.35, r * 0.35, -r * 1.35);
  ctx.stroke();
  const gl = ctx.createRadialGradient(
    r * 0.35,
    -r * 1.35,
    0,
    r * 0.35,
    -r * 1.35,
    r * 0.4
  );
  gl.addColorStop(0, 'rgba(255,240,150,1)');
  gl.addColorStop(0.4, 'rgba(255,140,40,0.8)');
  gl.addColorStop(1, 'rgba(255,100,0,0)');
  ctx.fillStyle = gl;
  circle(r * 0.35, -r * 1.35, r * (0.3 + 0.1 * Math.sin(t * 30)));
  ctx.fill();
  ctx.restore();
}

// ---------- Render ----------
function render(now) {
  const t = now / 1000;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // background
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#2a0f45');
  bg.addColorStop(0.55, '#4a1650');
  bg.addColorStop(1, '#7a2a4a');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = 'lighter';
  for (const b of bokeh) {
    const rg = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r);
    rg.addColorStop(0, `hsla(${b.hue},95%,62%,${b.a})`);
    rg.addColorStop(1, `hsla(${b.hue},95%,62%,0)`);
    ctx.fillStyle = rg;
    ctx.fillRect(b.x - b.r, b.y - b.r, b.r * 2, b.r * 2);
  }
  ctx.globalCompositeOperation = 'source-over';

  ctx.save();
  if (G.shake > 0)
    ctx.translate(rand(-G.shake, G.shake) * 0.5, rand(-G.shake, G.shake) * 0.5);

  // stains
  for (const s of stains) {
    ctx.globalAlpha = 0.3 * clamp(s.life / 2.5, 0, 1);
    ctx.fillStyle = s.color;
    for (const b of s.blobs) {
      circle(s.x + b.dx, s.y + b.dy, b.r);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;

  // halves
  for (const h of halves) {
    ctx.save();
    ctx.translate(h.x, h.y);
    ctx.rotate(h.rot);
    drawHalf(h.name, h.r, h.half);
    ctx.restore();
  }
  // objects
  for (const o of objs) {
    if (!o.alive) continue;
    ctx.save();
    ctx.translate(o.x, o.y);
    ctx.rotate(o.rot);
    if (o.kind === 'bomb') drawBomb(o.r, t);
    else drawWhole(o.name, o.r, t);
    ctx.restore();
  }

  // particles (normal)
  for (const p of parts) {
    const k = p.life / p.max;
    if (p.type === 'drop') {
      ctx.globalAlpha = clamp(k * 1.6, 0, 1);
      ctx.fillStyle = p.color;
      const sp = Math.hypot(p.vx, p.vy);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(Math.atan2(p.vy, p.vx));
      ctx.beginPath();
      ctx.ellipse(0, 0, p.size * (1 + sp * 0.004), p.size * 0.7, 0, 0, TAU);
      ctx.fill();
      ctx.restore();
    } else if (p.type === 'smoke') {
      ctx.globalAlpha = clamp(k, 0, 1) * 0.5;
      ctx.fillStyle = p.color;
      circle(p.x, p.y, p.size * (1 + (1 - k) * 2.2));
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;

  // rings + slash flashes + sparks (additive)
  ctx.globalCompositeOperation = 'lighter';
  for (const r of rings) {
    const k = 1 - r.life / r.max;
    ctx.globalAlpha = (1 - k) * 0.9;
    ctx.strokeStyle = r.color;
    ctx.lineWidth = Math.max(0.5, r.w * (1 - k));
    circle(r.x, r.y, r.r0 + (r.r1 - r.r0) * (1 - Math.pow(1 - k, 3)));
    ctx.stroke();
  }
  ctx.lineCap = 'round';
  for (const s of slashes) {
    const k = 1 - s.life / s.max;
    const half = s.len * (0.5 + 0.5 * k);
    const dx = Math.cos(s.ang) * half,
      dy = Math.sin(s.ang) * half;
    ctx.globalAlpha = 1 - k;
    ctx.strokeStyle = 'rgba(140,220,255,0.6)';
    ctx.lineWidth = 14 * (1 - k) + 2;
    ctx.beginPath();
    ctx.moveTo(s.x - dx, s.y - dy);
    ctx.lineTo(s.x + dx, s.y + dy);
    ctx.stroke();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 5 * (1 - k) + 1;
    ctx.beginPath();
    ctx.moveTo(s.x - dx, s.y - dy);
    ctx.lineTo(s.x + dx, s.y + dy);
    ctx.stroke();
  }
  for (const p of parts) {
    if (p.type !== 'spark' && p.type !== 'star') continue;
    const k = p.life / p.max;
    ctx.globalAlpha = clamp(k * 1.4, 0, 1);
    ctx.fillStyle = p.color;
    if (p.type === 'star') {
      const s = p.size * (0.5 + k);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y - s * 1.6);
      ctx.lineTo(p.x + s * 0.4, p.y - s * 0.4);
      ctx.lineTo(p.x + s * 1.6, p.y);
      ctx.lineTo(p.x + s * 0.4, p.y + s * 0.4);
      ctx.lineTo(p.x, p.y + s * 1.6);
      ctx.lineTo(p.x - s * 0.4, p.y + s * 0.4);
      ctx.lineTo(p.x - s * 1.6, p.y);
      ctx.lineTo(p.x - s * 0.4, p.y - s * 0.4);
      ctx.closePath();
      ctx.fill();
    } else {
      circle(p.x, p.y, p.size * (0.4 + k));
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.restore();

  // blade trail
  trail = trail.filter((p) => now - p.t < 180);
  if (trail.length > 1) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 1; i < trail.length; i++) {
        const a = trail[i - 1],
          b = trail[i];
        const k = clamp(1 - (now - b.t) / 180, 0, 1);
        ctx.strokeStyle =
          pass === 0
            ? `rgba(120,220,255,${0.4 * k})`
            : `rgba(255,255,255,${0.95 * k})`;
        ctx.lineWidth = (pass === 0 ? 22 : 7) * k;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  // slow-mo overlay: tint, speed lines, timer bar
  if (G.slow > 0) {
    const a = clamp(G.slow, 0, 1);
    ctx.fillStyle = `rgba(80,150,255,${0.13 * a})`;
    ctx.fillRect(0, 0, W, H);
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.rotate(t * 0.25);
    ctx.strokeStyle = `rgba(255,255,255,${0.07 * a})`;
    ctx.lineWidth = 3;
    const far = Math.hypot(W, H);
    for (let i = 0; i < 28; i++) {
      const ang = (i / 28) * TAU;
      ctx.beginPath();
      ctx.moveTo(Math.cos(ang) * far * 0.25, Math.sin(ang) * far * 0.25);
      ctx.lineTo(Math.cos(ang) * far, Math.sin(ang) * far);
      ctx.stroke();
    }
    ctx.restore();
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(W / 2 - 80, H - 26, 160, 6);
    ctx.fillStyle = '#ffd54a';
    ctx.fillRect(W / 2 - 80, H - 26, 160 * (G.slow / 3.5), 6);
  }

  // popups
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  for (const p of popups) {
    const k = 1 - p.life / p.max;
    const sc =
      k < 0.18
        ? 0.5 + (k / 0.18) * 0.75
        : 1.25 - Math.min(0.25, (k - 0.18) * 0.4);
    ctx.globalAlpha = clamp(p.life * 2.2, 0, 1);
    ctx.font = `${Math.round(p.size * sc)}px "Lilita One", Fredoka, sans-serif`;
    ctx.lineWidth = 7;
    ctx.strokeStyle = 'rgba(50,8,60,0.85)';
    ctx.strokeText(p.text, p.x, p.y);
    ctx.fillStyle = p.color;
    ctx.fillText(p.text, p.x, p.y);
  }
  ctx.globalAlpha = 1;

  // flash
  if (G.flash > 0) {
    ctx.fillStyle = `rgba(${G.flashColor},${clamp(G.flash, 0, 1) * 0.7})`;
    ctx.fillRect(0, 0, W, H);
  }

  // vignette
  const vg = ctx.createRadialGradient(
    W / 2,
    H / 2,
    Math.min(W, H) * 0.5,
    W / 2,
    H / 2,
    Math.max(W, H) * 0.85
  );
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(20,4,36,0.55)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);
}

// ---------- HUD ----------
function updateHud() {
  if (G.score !== lastScore) {
    el.score.textContent = G.score.toLocaleString('en-US');
    if (lastScore >= 0) {
      el.score.classList.remove('pop');
      void el.score.offsetWidth;
      el.score.classList.add('pop');
    }
    lastScore = G.score;
  }
}

// ---------- Loop ----------
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = clamp((now - last) / 1000, 0, 0.033);
  last = now;
  update(dt);
  if (G.state === 'playing' || G.state === 'over') updateHud();
  render(now);
}

// ---------- Init ----------
layout();
reset();
el.bestMenu.textContent = best.toLocaleString('en-US');
requestAnimationFrame((n) => {
  last = n;
  frame(n);
});

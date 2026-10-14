// ============================================================
//  DJELLABA DASH — a side-scrolling platformer with endless procedural worlds
// ============================================================
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const $ = (id) => document.getElementById(id);
const el = {
  hud: $('hud'), score: $('score'), coins: $('coins'), world: $('world'), time: $('time'), lives: $('lives'), banner: $('banner'), touch: $('touch'),
  menu: $('menu'), pause: $('pause'), over: $('over'),
  finalScore: $('finalScore'), finalWorld: $('finalWorld'), finalCoins: $('finalCoins'), finalKills: $('finalKills'),
  newBest: $('newBest'), bestMenu: $('bestMenu'), bestOver: $('bestOver'), contBtn: $('contBtn'), contLvl: $('contLvl'),
};
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const TAU = Math.PI * 2;
function mulberry(a) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// ---------- Save ----------
let best = 0, reached = 1;
try { best = parseInt(localStorage.getItem('dash-best') || '0', 10) || 0; reached = parseInt(localStorage.getItem('dash-world') || '1', 10) || 1; } catch (e) {}
const save = () => { try { localStorage.setItem('dash-best', String(best)); localStorage.setItem('dash-world', String(reached)); } catch (e) {} };

// ---------- Audio (short effects only) ----------
let ac = null, muted = false;
function initAudio() {
  if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} }
  if (ac && ac.state === 'suspended') ac.resume();
}
function beep(f, d, type = 'square', v = 0.04, slide = 0, delay = 0) {
  if (!ac || muted) return;
  const t = ac.currentTime + delay, o = ac.createOscillator(), g = ac.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f + slide), t + d);
  g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  o.connect(g).connect(ac.destination); o.start(t); o.stop(t + d);
}
const arp = (notes, d = 0.09, type = 'square', v = 0.04) => notes.forEach((n, i) => beep(440 * 2 ** (n / 12), d, type, v, 0, i * d * 0.8));
const sfx = {
  jump: () => beep(300, 0.2, 'square', 0.035, 380),
  coin: () => { beep(990, 0.07, 'square', 0.035); beep(1480, 0.18, 'square', 0.035, 0, 0.06); },
  stomp: () => { beep(200, 0.12, 'square', 0.06, -120); },
  bump: () => beep(140, 0.1, 'square', 0.06, -50),
  brick: () => beep(120, 0.18, 'sawtooth', 0.06, -70),
  power: () => arp([0, 1, 4, 5, 7, 8, 12, 13, 16], 0.08, 'triangle', 0.06),
  shoot: () => beep(700, 0.1, 'square', 0.03, -400),
  hurt: () => beep(400, 0.3, 'sawtooth', 0.06, -300),
  die: () => { beep(500, 0.9, 'square', 0.05, -440); },
  flag: () => arp([0, 1, 4, 5, 4, 7, 8, 12, 13, 16], 0.1, 'triangle', 0.06),
  up: () => arp([7, 8, 12, 13, 19], 0.07, 'square', 0.04),
  tick: () => beep(1200, 0.03, 'square', 0.02),
};

// ---------- Constants ----------
const T = 32, ROWS = 14;
const GRAV_UP = 1300, GRAV_CUT = 3400, GRAV_DOWN = 2000, JUMP_V = 575, MAXFALL = 760;
const WALK = 190, RUN = 290, ACC = 1500, FRIC = 1700;

// ---------- Themes ----------
const THEMES = [
  { name: 'MEDINA', sky: ['#4db8ff', '#ffe9c0'], far: '#e3b48a', mid: '#c98a5e', dirt: '#c47a4a', dirt2: '#a8603a', top: ['#1f6fd1', '#f4efe0', '#1fa06b', '#d8453b'], sand: false, brick: '#2a78d6', brick2: '#f4efe0', stone: '#e7d3a8', awn: ['#d8453b', '#f4efe0'], win: '#7a4a30', dark: false },
  { name: 'SAHARA DUNES', sky: ['#ff8f4d', '#ffe0a0'], far: '#eaa45e', mid: '#cf7f3e', dirt: '#e2b068', dirt2: '#cc9650', top: ['#f6cf80', '#eab960'], sand: true, brick: '#d9563f', brick2: '#f6d9a0', stone: '#d2a86a', awn: ['#1f9a8a', '#f4efe0'], win: '#8a5a30', dark: false },
  { name: 'MOONLIT SOUK', sky: ['#0b1233', '#2c2a6a'], far: '#1d2150', mid: '#141a40', dirt: '#46355c', dirt2: '#352846', top: ['#19b3b3', '#f4efe0', '#e0457b', '#f2b134'], sand: false, brick: '#1aa3a3', brick2: '#0e6672', stone: '#5e5683', awn: ['#e0457b', '#f4efe0'], win: '#ffcf6b', dark: true },
];

// ---------- Level generation ----------
let L = null; // current level
function genLevel(n) {
  const rnd = mulberry(n * 7919 + 13), R = (a, b) => a + rnd() * (b - a), RI = (a, b) => Math.floor(R(a, b + 1));
  const d = Math.min(1, (n - 1) / 8);
  const LEN = 112 + RI(0, 16) + Math.floor(d * 36);
  const gt = new Array(LEN).fill(-2);
  const grid = Array.from({ length: ROWS }, () => Array(LEN).fill(' '));
  const ents = [], bonus = {}, decor = [];
  let x = 0, gh = 11, mid = false, lastSeg = '', midX = 0;
  const flat = (k) => { for (let i = 0; i < k; i++) gt[x++] = gh; };
  const gap = (k) => { for (let i = 0; i < k; i++) gt[x++] = -1; };
  const putEnemy = (t, cx, row) => ents.push({ t, x: cx * T + 3, y: row * T });
  const coinsRow = (c0, c1, row) => { for (let c = c0; c <= c1; c++) ents.push({ t: 'coin', x: c * T + 8, y: row * T + 8 }); };
  const set = (c, r, ch) => { if (c >= 0 && c < LEN && r >= 0 && r < ROWS) grid[r][c] = ch; };

  flat(10);
  const segs = [];
  const pick = () => {
    const w = [['flat', 3], ['block', 3], ['plat', 2], ['gap', 2 + d], ['stairs', 1], ['spikes', d > 0.1 ? 1.2 : 0], ['isles', d > 0.2 ? 1.6 : 0]];
    let tot = 0; w.forEach((s) => (tot += s[1]));
    let r = rnd() * tot; for (const s of w) { r -= s[1]; if (r <= 0) return s[0]; }
    return 'flat';
  };
  while (x < LEN - 22) {
    let s = pick(); if (s === lastSeg && s !== 'flat') s = 'flat';
    lastSeg = s; segs.push(s);
    const x0 = x;
    if (s === 'flat') {
      const k = RI(4, 8); flat(k);
      if (rnd() < 0.45 + 0.35 * d) putEnemy(rnd() < 0.25 * d ? 'spiky' : 'slime', x0 + RI(1, k - 2), gh - 1);
      if (rnd() < 0.5) coinsRow(x0 + 1, x0 + RI(3, k - 1), gh - 2);
      if (d > 0.25 && rnd() < 0.3) ents.push({ t: 'bat', x: (x0 + 2) * T, y: (gh - RI(4, 6)) * T });
      if (!mid && x > LEN * 0.5) { mid = true; midX = x0 + 2; ents.push({ t: 'check', x: midX * T, y: gh * T }); }
    } else if (s === 'block') {
      const k = RI(6, 9); flat(k);
      const n = RI(3, 5), c0 = x0 + 1;
      for (let i = 0; i < n; i++) {
        const q = rnd() < 0.4; set(c0 + i, gh - 4, q ? '?' : 'B');
        if (q) bonus[(gh - 4) + ',' + (c0 + i)] = rnd() < 0.3 ? 'power' : 'coin';
      }
      if (rnd() < 0.55) putEnemy('slime', x0 + k - 2, gh - 1);
      if (rnd() < 0.6) coinsRow(c0, c0 + n - 1, gh - 6);
    } else if (s === 'plat') {
      const k = RI(7, 10); flat(k);
      const n = RI(3, 4), c0 = x0 + 2;
      for (let i = 0; i < n; i++) set(c0 + i, gh - 3, '=');
      coinsRow(c0, c0 + n - 1, gh - 4);
      if (rnd() < 0.6) putEnemy('slime', x0 + k - 2, gh - 1);
      if (d > 0.3 && rnd() < 0.4) ents.push({ t: 'bat', x: (x0 + 1) * T, y: (gh - 6) * T });
    } else if (s === 'gap') {
      flat(2); const w = RI(2, 3 + Math.floor(d * 2));
      const gx = x; gap(w); flat(3);
      for (let i = 0; i < w; i++) ents.push({ t: 'coin', x: (gx + i) * T + 8, y: (gh - 3 - Math.sin(((i + 0.5) / w) * Math.PI) * 1.4) * T + 8 });
    } else if (s === 'stairs') {
      flat(2); const k = RI(2, 3);
      for (let i = 0; i < k; i++) { gh = clamp(gh - 1, 8, 12); flat(2); }
      flat(3); if (rnd() < 0.5) putEnemy('slime', x - 2, gh - 1);
      for (let i = 0; i < k; i++) { gh = clamp(gh + 1, 8, 12); flat(2); }
      flat(2);
    } else if (s === 'spikes') {
      const k = 8; flat(k);
      const sl = RI(2, 3), c0 = x0 + 3;
      for (let i = 0; i < sl; i++) set(c0 + i, gh - 1, '^');
      coinsRow(c0, c0 + sl - 1, gh - 3);
    } else if (s === 'isles') {
      flat(2);
      const n = RI(2, 3);
      for (let i = 0; i < n; i++) {
        gap(RI(3, 4));
        gh = clamp(gh + (rnd() < 0.5 ? -1 : 1), 8, 12);
        flat(2);
        ents.push({ t: 'coin', x: (x - 1) * T, y: (gh - 2) * T + 8 });
      }
      flat(3);
    }
    if (x > LEN - 22) break;
  }
  flat(LEN - 8 - x);        // run-up to the flag
  const flagX = x + 1;
  flat(8);
  // fill terrain
  for (let c = 0; c < LEN; c++) if (gt[c] >= 0) for (let r = gt[c]; r < ROWS; r++) grid[r][c] = '#';
  // end stairs (solid blocks) before the flag
  for (let i = 0; i < 4; i++) for (let k = 0; k <= i; k++) { const c = flagX - 6 + i, r = gt[c] - 1 - k; if (gt[c] >= 0) set(c, r, 'S'); }
  // decorations
  for (let c = 4; c < LEN; c++) if (gt[c] >= 0 && rnd() < 0.2 && grid[gt[c] - 1][c] === ' ') decor.push({ c, r: gt[c], k: RI(0, 2), s: R(0.8, 1.3) });
  return { n, LEN, grid, gt, ents, bonus, decor, flagX, theme: THEMES[(n - 1) % 3], d, start: { x: 2 * T, y: 11 * T - 30 }, time: 280 + Math.floor(d * 60) };
}

const tile = (c, r) => {
  if (c < 0 || c >= L.LEN) return c < 0 || r < ROWS ? 'S' : ' ';
  if (r < 0 || r >= ROWS) return ' ';
  return L.grid[r][c];
};
const isSolid = (ch) => ch === '#' || ch === 'B' || ch === '?' || ch === 'S' || ch === 'U';

// ---------- State ----------
const G = { state: 'menu', score: 0, coins: 0, lives: 3, world: 1, time: 300, kills: 0, shake: 0, t: 0, combo: 0, winT: 0, fx: 0 };
let P, ents, items, seeds, parts, bumps, popups, cam = { x: 0 }, checkpoint = null, clouds = [], debug = null;
const keys = {};

// ---------- Setup ----------
function loadLevel(n, keepCheck) {
  G.world = n; L = genLevel(n);
  ents = L.ents.map((e) => {
    if (e.t === 'coin') return { t: 'coin', x: e.x, y: e.y, w: 16, h: 16, got: false, ph: Math.random() * 6 };
    if (e.t === 'check') return { t: 'check', x: e.x, y: e.y, hit: false };
    if (e.t === 'bat') return { t: 'bat', x: e.x, y: e.y, y0: e.y, x0: e.x, w: 28, h: 18, vx: -50, vy: 0, dead: false, ph: Math.random() * 6 };
    return { t: e.t, x: e.x, y: e.y - 20, w: e.t === 'spiky' ? 28 : 26, h: e.t === 'spiky' ? 22 : 20, vx: -(e.t === 'spiky' ? 60 : 50), vy: 0, dead: false, sq: 0, ph: Math.random() * 6 };
  });
  // fix y: ground enemies are placed so their bottom rests on the tile row
  for (const e of ents) if (e.t === 'slime' || e.t === 'spiky') e.y = e.y + 20 - e.h;
  items = []; seeds = []; parts = []; bumps = {}; popups = [];
  clouds = Array.from({ length: 22 }, () => ({ x: rand(0, L.LEN * T), y: rand(20, 200), s: rand(0.7, 1.6), v: rand(4, 12) }));
  const sp = keepCheck && checkpoint && checkpoint.world === n ? checkpoint : null;
  P = {
    x: sp ? sp.x : L.start.x, y: sp ? sp.y : L.start.y, w: 22, h: 28, vx: 0, vy: 0, dir: 1, ground: false, coyote: 0, buf: 0, power: sp ? sp.power : false,
    inv: 0, dead: false, anim: 0, sqx: 1, sqy: 1, shootCd: 0, jumping: false, flag: false, runT: 0,
  };
  G.time = L.time; G.combo = 0;
  cam.x = clamp(P.x - 200, 0, Math.max(0, L.LEN * T - viewW()));
  if (!sp) checkpoint = null;
}

function newGame(start) {
  Object.assign(G, { state: 'playing', score: 0, coins: 0, lives: 3, kills: 0, shake: 0, t: 0, winT: 0 });
  checkpoint = null;
  loadLevel(start || 1, false);
  el.menu.classList.add('hidden'); el.over.classList.add('hidden'); el.pause.classList.add('hidden');
  el.hud.classList.remove('off'); el.touch.classList.remove('off');
  updateHud(); banner('WORLD ' + G.world + ' · ' + L.theme.name, '#fff');
}

function banner(text, color) {
  el.banner.textContent = text; el.banner.style.color = color || '#fff';
  el.banner.classList.remove('show'); void el.banner.offsetWidth; el.banner.classList.add('show');
}
function updateHud(pop) {
  el.score.textContent = String(G.score).padStart(6, '0');
  el.coins.textContent = G.coins; el.world.textContent = G.world; el.lives.textContent = G.lives;
  const t = Math.ceil(G.time); el.time.textContent = t; el.time.classList.toggle('low', t <= 30 && G.state === 'playing');
  if (pop) { el.score.classList.remove('pop'); void el.score.offsetWidth; el.score.classList.add('pop'); }
}
const addScore = (n, x, y) => { G.score += n; if (x !== undefined) popups.push({ x, y, s: String(n), life: 0.8 }); };

// ---------- View ----------
let W = 0, H = 0, dpr = 1, S = 1;
const viewW = () => W / S;
function layout() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  W = innerWidth; H = innerHeight;
  canvas.width = Math.floor(W * dpr); canvas.height = Math.floor(H * dpr);
  S = H / (ROWS * T);
}
addEventListener('resize', layout);

// ---------- Input ----------
const K = { left: false, right: false, jump: false, run: false, shoot: false };
let jumpPressed = false, shootPressed = false;
const map = {
  ArrowLeft: 'left', KeyA: 'left', KeyQ: 'left', ArrowRight: 'right', KeyD: 'right',
  ArrowUp: 'jump', KeyW: 'jump', KeyZ: 'jump', Space: 'jump', ShiftLeft: 'run', ShiftRight: 'run', KeyX: 'shoot', KeyJ: 'shoot', KeyK: 'shoot',
};
addEventListener('keydown', (e) => {
  initAudio();
  const a = map[e.code];
  if (a) {
    e.preventDefault();
    if (a === 'jump' && !K.jump) { jumpPressed = true; if (G.state === 'menu') newGame(1); }
    if (a === 'shoot' && !K.shoot) shootPressed = true;
    K[a] = true; return;
  }
  if (e.repeat) return;
  if (e.code === 'KeyP' || e.code === 'Escape') togglePause();
  else if (e.code === 'KeyM') muted = !muted;
  else if (e.code === 'Enter' && (G.state === 'menu' || G.state === 'over')) newGame(1);
});
addEventListener('keyup', (e) => { const a = map[e.code]; if (a) K[a] = false; });
addEventListener('blur', () => { for (const k in K) K[k] = false; if (G.state === 'playing') togglePause(true); });
function bindBtn(id, act) {
  const b = $(id);
  const on = (e) => { e.preventDefault(); initAudio(); if (act === 'jump' && !K.jump) jumpPressed = true; if (act === 'shoot' && !K.shoot) shootPressed = true; K[act] = true; b.classList.add('down'); };
  const off = (e) => { e.preventDefault(); K[act] = false; b.classList.remove('down'); };
  b.addEventListener('pointerdown', on); b.addEventListener('pointerup', off); b.addEventListener('pointercancel', off); b.addEventListener('pointerleave', off);
}
bindBtn('tLeft', 'left'); bindBtn('tRight', 'right'); bindBtn('tJump', 'jump'); bindBtn('tShoot', 'shoot');
$('playBtn').onclick = () => { initAudio(); newGame(1); };
$('contBtn').onclick = () => { initAudio(); newGame(reached); };
$('retryBtn').onclick = () => { initAudio(); newGame(1); };
$('resumeBtn').onclick = () => togglePause(false);
function togglePause(force) {
  if (G.state !== 'playing' && G.state !== 'paused') return;
  const want = force === undefined ? G.state === 'playing' : force;
  G.state = want ? 'paused' : 'playing';
  el.pause.classList.toggle('hidden', !want);
  if (!want) last = performance.now();
}

// ---------- Collision ----------
// moves a body (x,y,w,h,vx,vy); returns { ground, wall, ceil:[c,r]|null }
function moveBody(b, dt, opts = {}) {
  const res = { ground: false, wall: false, ceil: null };
  b.x += b.vx * dt;
  let c0 = Math.floor(b.x / T), c1 = Math.floor((b.x + b.w - 0.01) / T), r0 = Math.floor(b.y / T), r1 = Math.floor((b.y + b.h - 0.01) / T);
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
    if (!isSolid(tile(c, r))) continue;
    if (b.vx > 0) b.x = c * T - b.w; else if (b.vx < 0) b.x = (c + 1) * T;
    b.vx = 0; res.wall = true;
    c0 = Math.floor(b.x / T); c1 = Math.floor((b.x + b.w - 0.01) / T);
  }
  const prevBottom = b.y + b.h;
  b.y += b.vy * dt;
  c0 = Math.floor(b.x / T); c1 = Math.floor((b.x + b.w - 0.01) / T); r0 = Math.floor(b.y / T); r1 = Math.floor((b.y + b.h - 0.01) / T);
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
    const ch = tile(c, r);
    if (isSolid(ch)) {
      if (b.vy > 0) { b.y = r * T - b.h; res.ground = true; }
      else if (b.vy < 0) { b.y = (r + 1) * T; if (!res.ceil) res.ceil = [c, r]; }
      b.vy = 0;
    } else if (ch === '=' && b.vy > 0 && prevBottom <= r * T + 1 && !opts.drop) {
      b.y = r * T - b.h; b.vy = 0; res.ground = true;
    }
  }
  return res;
}

// ---------- Effects ----------
function puff(x, y, n, color, spd = 90, up = 0) {
  for (let i = 0; i < n; i++) parts.push({ x, y, vx: rand(-spd, spd), vy: rand(-spd, spd * 0.4) - up, life: rand(0.3, 0.7), max: 0.7, size: rand(2, 5), color, g: 600 });
}
function brickBreak(c, r) {
  grid_set(c, r, ' ');
  for (let i = 0; i < 8; i++) parts.push({ x: c * T + 16, y: r * T + 16, vx: rand(-160, 160), vy: rand(-380, -120), life: 1.2, max: 1.2, size: 7, color: i % 2 ? L.theme.brick : L.theme.brick2, g: 1400, rot: true });
  sfx.brick(); G.shake = 4;
}
const grid_set = (c, r, ch) => { if (c >= 0 && c < L.LEN && r >= 0 && r < ROWS) L.grid[r][c] = ch; };

function hitBlock(c, r) {
  const ch = tile(c, r);
  bumps[r + ',' + c] = 0.0001;
  if (ch === '?') {
    grid_set(c, r, 'U');
    const kind = L.bonus[r + ',' + c];
    if (kind === 'power' && !P.power) {
      items.push({ x: c * T + 4, y: r * T, w: 24, h: 24, vx: 0, vy: 0, rise: 24, base: r * T - 24, kind: 'flower' });
      sfx.bump();
    } else {
      G.coins++; addScore(50, c * T + 10, r * T - 6); sfx.coin(); puff(c * T + 16, r * T - 4, 8, '#ffd23f', 70, 120);
      if (G.coins >= 100) { G.coins -= 100; G.lives++; sfx.up(); banner('1UP!', '#7dff9a'); }
    }
  } else if (ch === 'B') {
    if (P.power) { brickBreak(c, r); addScore(20); } else sfx.bump();
  } else sfx.bump();
  // knock enemies standing on top
  for (const e of ents) if ((e.t === 'slime' || e.t === 'spiky') && !e.dead && Math.floor((e.x + e.w / 2) / T) === c && Math.floor((e.y + e.h + 1) / T) === r) killEnemy(e, true);
  updateHud(true);
}

function killEnemy(e, fling) {
  e.dead = true; e.sq = fling ? 0 : 0.01; e.fling = !!fling;
  if (fling) { e.vy = -300; e.vx = rand(-60, 60); }
  G.kills++;
}

function hurt() {
  if (P.inv > 0 || P.dead || G.state !== 'playing') return;
  if (P.power) { P.power = false; P.inv = 1.6; sfx.hurt(); G.shake = 6; puff(P.x + 11, P.y + 14, 12, '#ffd23f', 160); return; }
  die();
}
function die() {
  if (P.dead) return;
  P.dead = true; P.vx = 0; P.vy = -560; G.state = 'dying'; G.winT = 0; sfx.die();
}

// ---------- Update ----------
function updatePlayer(dt) {
  const accel = P.ground ? ACC : ACC * 0.75;
  const maxV = K.run ? RUN : WALK;
  const dirIn = (K.right ? 1 : 0) - (K.left ? 1 : 0);
  if (dirIn) {
    P.dir = dirIn;
    const target = dirIn * maxV, rate = accel * (Math.sign(P.vx) === -dirIn ? 2 : 1) * dt;
    P.vx = Math.abs(target - P.vx) <= rate ? target : P.vx + Math.sign(target - P.vx) * rate;
  } else { const f = (P.ground ? FRIC : FRIC * 0.25) * dt; P.vx = Math.abs(P.vx) <= f ? 0 : P.vx - Math.sign(P.vx) * f; }
  // jump (buffer + coyote)
  if (jumpPressed) P.buf = 0.12;
  P.buf = Math.max(0, P.buf - dt); P.coyote = P.ground ? 0.1 : Math.max(0, P.coyote - dt);
  if (P.buf > 0 && P.coyote > 0) {
    P.vy = -JUMP_V - Math.abs(P.vx) * 0.12; P.ground = false; P.coyote = 0; P.buf = 0; P.jumping = true; sfx.jump();
    P.sqx = 0.75; P.sqy = 1.3; puff(P.x + 11, P.y + P.h, 4, '#ffffffaa', 40);
  }
  const g = P.vy < 0 ? (K.jump ? GRAV_UP : GRAV_CUT) : GRAV_DOWN;
  P.vy = Math.min(MAXFALL, P.vy + g * dt);
  const wasGround = P.ground, vyBefore = P.vy;
  const r = moveBody(P, dt, { drop: false });
  P.ground = r.ground;
  if (r.ground && !wasGround) { P.sqx = 1.3; P.sqy = 0.72; if (vyBefore > 300) puff(P.x + 11, P.y + P.h, 5, '#ffffffaa', 60); }
  if (r.ceil) hitBlock(r.ceil[0], r.ceil[1]);
  P.sqx = lerp(P.sqx, 1, Math.min(1, 12 * dt)); P.sqy = lerp(P.sqy, 1, Math.min(1, 12 * dt));
  P.inv = Math.max(0, P.inv - dt); P.shootCd = Math.max(0, P.shootCd - dt);
  if (P.x < 0) { P.x = 0; P.vx = 0; }
  P.anim += Math.abs(P.vx) * dt * 0.06;
  if (P.ground && Math.abs(P.vx) > 140 && Math.random() < 0.2) puff(P.x + 11 - P.dir * 8, P.y + P.h, 1, '#ffffff88', 20);
  // shoot
  if (shootPressed && P.power && P.shootCd <= 0 && seeds.length < 3) {
    seeds.push({ x: P.x + 11 + P.dir * 12, y: P.y + 10, vx: P.dir * 360 + P.vx * 0.3, vy: -60, life: 2.2 });
    P.shootCd = 0.25; sfx.shoot();
  }
  // pits / time
  if (P.y > ROWS * T + 60) die();
  // hazards: spikes
  const c0 = Math.floor(P.x / T), c1 = Math.floor((P.x + P.w) / T), rr = Math.floor((P.y + P.h - 2) / T);
  for (let c = c0; c <= c1; c++) if (tile(c, rr) === '^' && P.y + P.h > rr * T + 14 && P.x + P.w > c * T + 4 && P.x < c * T + T - 4) hurt();
  // flag
  const fx = L.flagX * T + 14;
  if (!P.flag && P.x + P.w > fx - 6 && P.x < fx + 8) winLevel();
}

function winLevel() {
  P.flag = true; G.state = 'win'; G.winT = 0;
  const h = clamp(1 - (P.y - 4 * T) / (7 * T), 0, 1);
  const bonus = 200 + Math.round(h * 8) * 100;
  addScore(bonus, P.x, P.y - 20); sfx.flag();
  P.vx = 0; P.vy = 0; P.x = L.flagX * T + 14 - 16;
  reached = Math.max(reached, G.world + 1); if (G.score > best) { best = G.score; } save();
  banner('LEVEL CLEAR!', '#ffe36a');
  for (let i = 0; i < 50; i++) parts.push({ x: L.flagX * T + 16, y: 3 * T, vx: rand(-220, 220), vy: rand(-300, 0), life: rand(1, 2), max: 2, size: rand(4, 7), color: ['#ff4d6d', '#ffd23f', '#4dff9a', '#4dc3ff', '#fff'][i % 5], g: 400, rot: true });
}

function updateEnemies(dt) {
  for (const e of ents) {
    if (e.t === 'coin') {
      if (!e.got && P && !P.dead && P.x < e.x + 16 && P.x + P.w > e.x && P.y < e.y + 16 && P.y + P.h > e.y) {
        e.got = true; G.coins++; addScore(50); sfx.coin(); puff(e.x + 8, e.y + 8, 6, '#ffd23f', 80);
        if (G.coins >= 100) { G.coins -= 100; G.lives++; sfx.up(); banner('1UP!', '#7dff9a'); }
        updateHud(true);
      }
      continue;
    }
    if (e.t === 'check') {
      if (!e.hit && Math.abs(P.x - e.x) < 24 && Math.abs(P.y + P.h - e.y) < 40) {
        e.hit = true; checkpoint = { world: G.world, x: e.x, y: e.y - 32, power: P.power }; sfx.up(); banner('CHECKPOINT', '#7dff9a'); puff(e.x + 10, e.y - 40, 14, '#7dff9a', 120);
      }
      continue;
    }
    if (e.dead) {
      if (e.fling) { e.vy += 1400 * dt; e.y += e.vy * dt; e.x += e.vx * dt; } else e.sq += dt;
      continue;
    }
    if (Math.abs(e.x - P.x) > 700) continue; // sleep far enemies
    if (e.t === 'bat') {
      e.ph += dt * 3; e.x += e.vx * dt; e.y = e.y0 + Math.sin(e.ph) * 26;
      if (Math.abs(e.x - e.x0) > 110) e.vx = -e.vx;
    } else {
      e.vy = Math.min(MAXFALL, e.vy + 1800 * dt);
      const dir = Math.sign(e.vx) || -1, sp = e.t === 'spiky' ? 60 : 50;
      const r = moveBody(e, dt);
      const aheadX = dir > 0 ? e.x + e.w + 2 : e.x - 2;
      const aheadC = Math.floor(aheadX / T), footR = Math.floor((e.y + e.h + 2) / T);
      const noFloor = r.ground && !isSolid(tile(aheadC, footR)) && tile(aheadC, footR) !== '=';
      if (r.wall || noFloor) e.vx = -dir * sp; else e.vx = dir * sp;
      if (tile(aheadC, Math.floor((e.y + e.h - 4) / T)) === '^') e.vx = -dir * sp;
    }
    // vs player
    if (!P.dead && G.state === 'playing' && P.x < e.x + e.w && P.x + P.w > e.x && P.y < e.y + e.h && P.y + P.h > e.y) {
      const stomp = P.vy > 60 && P.y + P.h - e.y < 16 + P.vy * 0.03;
      if (stomp && e.t !== 'spiky') {
        killEnemy(e, false); G.combo++;
        const pts = Math.min(1600, 100 * 2 ** (G.combo - 1));
        addScore(pts, e.x, e.y - 10); sfx.stomp(); puff(e.x + e.w / 2, e.y + e.h, 8, '#fff', 120);
        P.vy = K.jump ? -520 : -330; P.ground = false; G.shake = 3; updateHud(true);
      } else hurt();
    }
    // seeds
    for (const s of seeds) if (!e.dead && Math.abs(s.x - (e.x + e.w / 2)) < e.w / 2 + 5 && Math.abs(s.y - (e.y + e.h / 2)) < e.h / 2 + 5) {
      s.life = 0; killEnemy(e, true); addScore(100, e.x, e.y - 10); sfx.stomp(); puff(e.x + e.w / 2, e.y + e.h / 2, 8, '#4dff9a', 120); updateHud(true);
    }
  }
}

function updateItems(dt) {
  for (const it of items) {
    if (it.rise > 0) { it.rise -= 60 * dt; it.y = it.base + Math.max(0, it.rise); if (it.rise <= 0) { it.vx = 70; } continue; }
    it.vy = Math.min(MAXFALL, it.vy + 1800 * dt);
    const r = moveBody(it, dt); if (r.wall) it.vx = -(Math.sign(it.vx) || 1) * 70; else if (!it.vx) it.vx = 70;
    if (it.y > ROWS * T + 50) it.dead = true;
    if (!P.dead && P.x < it.x + it.w && P.x + P.w > it.x && P.y < it.y + it.h && P.y + P.h > it.y) {
      it.dead = true; P.power = true; addScore(1000, it.x, it.y - 10); sfx.power(); puff(P.x + 11, P.y + 14, 16, '#ffd23f', 180); banner('MINT TEA POWER!', '#ffe36a'); updateHud(true);
    }
  }
  items = items.filter((i) => !i.dead);
  for (const s of seeds) {
    s.life -= dt; s.vy = Math.min(500, s.vy + 1300 * dt);
    const b = { x: s.x - 4, y: s.y - 4, w: 8, h: 8, vx: s.vx, vy: s.vy };
    const r = moveBody(b, dt);
    if (r.wall) { s.life = 0; puff(b.x, b.y, 4, '#7dff9a', 60); }
    if (r.ground) b.vy = -300;
    s.x = b.x + 4; s.y = b.y + 4; s.vx = b.vx || s.vx; s.vy = b.vy;
    if (s.y > ROWS * T + 40) s.life = 0;
  }
  seeds = seeds.filter((s) => s.life > 0);
}

function update(rdt) {
  const dt = Math.min(rdt, 1 / 30);
  G.t += dt;
  if (G.state === 'menu') { camMenu(dt); return; }
  if (G.state === 'playing') {
    G.time -= dt; if (G.time <= 0) { G.time = 0; die(); }
    updatePlayer(dt);
    if (P.ground) G.combo = 0;
    updateEnemies(dt); updateItems(dt);
    if (Math.ceil(G.time) !== G._lt) { G._lt = Math.ceil(G.time); updateHud(); }
  } else if (G.state === 'dying') {
    G.winT += dt; P.vy += GRAV_DOWN * dt; P.y += P.vy * dt;
    updateEnemies(dt);
    if (G.winT > 1.6) respawn();
  } else if (G.state === 'win') {
    G.winT += dt;
    const groundY = L.gt[L.flagX] * T - P.h;
    if (P.y < groundY && G.winT < 1.2) { P.y = Math.min(groundY, P.y + 260 * dt); }
    else if (G.winT >= 1.2 && G.winT < 2.4) { P.dir = 1; P.vx = 120; P.vy = Math.min(MAXFALL, P.vy + GRAV_DOWN * dt); const r = moveBody(P, dt); P.ground = r.ground; P.anim += dt * 7; }
    else if (G.winT >= 2.4) {
      if (G.time > 0) { const t = Math.min(G.time, 60 * dt); G.time -= t; G.score += Math.round(t * 10); if (Math.random() < 0.3) sfx.tick(); updateHud(); }
      else if (!G._adv) { G._adv = true; setTimeout(() => { G._adv = false; if (G.state === 'win') { checkpoint = null; loadLevel(G.world + 1, false); G.state = 'playing'; banner('WORLD ' + G.world + ' · ' + L.theme.name, '#fff'); updateHud(); } }, 900); }
    }
    updateItems(dt);
  }
  // camera
  const look = P.dir * 70;
  const tx = clamp(P.x + 11 - viewW() * 0.4 + look, 0, Math.max(0, L.LEN * T - viewW()));
  cam.x += (tx - cam.x) * Math.min(1, 7 * dt);
  // fx
  for (const k in bumps) { bumps[k] += dt * 6; if (bumps[k] >= 1) delete bumps[k]; }
  for (let i = parts.length - 1; i >= 0; i--) { const p = parts[i]; p.life -= dt; if (p.life <= 0) { parts.splice(i, 1); continue; } p.vy += (p.g || 0) * dt; p.x += p.vx * dt; p.y += p.vy * dt; }
  for (let i = popups.length - 1; i >= 0; i--) { popups[i].life -= dt; popups[i].y -= 40 * dt; if (popups[i].life <= 0) popups.splice(i, 1); }
  for (const c of clouds) { c.x += c.v * dt; if (c.x > L.LEN * T + 100) c.x = -100; }
  G.shake = Math.max(0, G.shake - dt * 30);
}
function camMenu(dt) {
  cam.x += 60 * dt; if (cam.x > L.LEN * T - viewW() - 10) cam.x = 0;
  for (const c of clouds) { c.x += c.v * dt; if (c.x > L.LEN * T + 100) c.x = -100; }
}

function respawn() {
  G.lives--;
  if (G.lives <= 0) { gameOver(); return; }
  loadLevel(G.world, true); G.state = 'playing'; updateHud();
}
function gameOver() {
  G.state = 'over';
  const isBest = G.score > best; if (isBest) best = G.score; save();
  el.finalScore.textContent = G.score.toLocaleString('en-US'); el.finalWorld.textContent = G.world; el.finalCoins.textContent = G.coins; el.finalKills.textContent = G.kills;
  el.bestOver.textContent = best.toLocaleString('en-US'); el.newBest.classList.toggle('hidden', !isBest);
  el.over.classList.remove('hidden'); el.hud.classList.add('off'); el.touch.classList.add('off');
  updateHud();
}

// ---------- Drawing ----------
function rr(x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
const H32 = (i) => { let h = (i * 374761393 + 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
function archWin(x, y, w, h) { ctx.beginPath(); ctx.moveTo(x, y + h); ctx.lineTo(x, y + w / 2); ctx.arc(x + w / 2, y + w / 2, w / 2, Math.PI, 0); ctx.lineTo(x + w, y + h); ctx.closePath(); ctx.fill(); }
function star8(cx, cy, r, col) { ctx.fillStyle = col; ctx.save(); ctx.translate(cx, cy); ctx.fillRect(-r * 0.72, -r * 0.72, r * 1.44, r * 1.44); ctx.rotate(Math.PI / 4); ctx.fillRect(-r * 0.72, -r * 0.72, r * 1.44, r * 1.44); ctx.restore(); }
function star5(cx, cy, r, col) { ctx.fillStyle = col; ctx.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rad = i % 2 ? r * 0.42 : r; ctx[i ? 'lineTo' : 'moveTo'](cx + Math.cos(a) * rad, cy + Math.sin(a) * rad); } ctx.closePath(); ctx.fill(); }

function skyline(par, base, col, winCol, seed, lit) {
  const vw = viewW(), vh = ROWS * T, W = 84;
  const i0 = Math.floor(cam.x * par / W) - 1, i1 = i0 + Math.ceil(vw / W) + 3;
  for (let i = i0; i <= i1; i++) {
    const x = i * W - cam.x * par, hh = H32(i + seed), k = H32(i * 7 + seed + 3);
    const bh = 46 + hh * 70, w = W - 4 - ((hh * 8) | 0), top = base - bh;
    ctx.fillStyle = col; ctx.fillRect(x, top, w, vh - top);
    if (k < 0.25) { // dome
      ctx.beginPath(); ctx.arc(x + w / 2, top, w * 0.32, Math.PI, 0); ctx.fill();
      ctx.fillRect(x + w / 2 - 1.5, top - w * 0.32 - 12, 3, 12);
      ctx.beginPath(); ctx.arc(x + w / 2, top - w * 0.32 - 13, 3, 0, TAU); ctx.fill();
    } else if (k < 0.4) { // minaret
      const tw = 22, tx = x + w / 2 - tw / 2, th2 = 58 + hh * 40;
      ctx.fillRect(tx, top - th2, tw, th2); ctx.fillRect(tx - 3, top - th2 - 5, tw + 6, 6);
      ctx.beginPath(); ctx.arc(tx + tw / 2, top - th2 - 5, 8, Math.PI, 0); ctx.fill();
      ctx.fillRect(tx + tw / 2 - 1, top - th2 - 22, 2, 10);
      if (lit) { ctx.fillStyle = winCol; archWin(tx + 7, top - th2 + 8, 8, 14); }
    } else if (k < 0.65) { for (let m = 0; m < w; m += 12) ctx.fillRect(x + m, top - 6, 7, 6); }
    ctx.fillStyle = winCol;
    for (let r2 = 0; r2 < 2; r2++) for (let c2 = 0; c2 < 2; c2++) {
      if (top + 18 + r2 * 34 + 18 > base + 20) continue;
      if (!lit || H32(i * 13 + r2 * 5 + c2 + seed) < 0.6) archWin(x + 10 + c2 * (w / 2 - 4), top + 14 + r2 * 34, 11, 18);
    }
  }
}
function duneY(par, x, base, amp, seed) { const wx = x + cam.x * par; return base - (Math.sin(wx * 0.0052 + seed) * 0.55 + Math.sin(wx * 0.0021 + seed * 2) * 0.45 + 0.3) * amp; }
function dunes(par, base, amp, col, seed) {
  const vw = viewW(), vh = ROWS * T;
  ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(0, vh);
  for (let x = 0; x <= vw + 20; x += 16) ctx.lineTo(x, duneY(par, x, base, amp, seed));
  ctx.lineTo(vw, vh); ctx.closePath(); ctx.fill();
}
function camel(x, y, ph, col) {
  ctx.save(); ctx.translate(x, y); ctx.fillStyle = col; ctx.strokeStyle = col; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.ellipse(0, -22, 15, 7, 0, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.arc(-3, -28, 6, Math.PI, 0); ctx.fill();
  ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(12, -24); ctx.quadraticCurveTo(20, -30, 19, -40); ctx.stroke();
  ctx.beginPath(); ctx.ellipse(22, -41, 5.5, 2.8, -0.2, 0, TAU); ctx.fill();
  ctx.lineWidth = 2.4;
  for (const [lx, s] of [[-10, 0], [-6, 1], [7, 2], [11, 3]]) { const sw = Math.sin(ph + s * 1.6) * 3; ctx.beginPath(); ctx.moveTo(lx, -18); ctx.lineTo(lx + sw, 0); ctx.stroke(); }
  ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(-15, -23); ctx.quadraticCurveTo(-20, -18, -18, -10); ctx.stroke();
  ctx.restore();
}
function garland(t, night) {
  const vw = viewW(), S2 = 220, par = 0.6, i0 = Math.floor(cam.x * par / S2) - 1;
  const cols = night ? ['#ffb347', '#ff6b9a', '#5ee6d0', '#ffd23f'] : ['#d8453b', '#1f6fd1', '#f2b134', '#1fa06b', '#f4efe0'];
  for (let i = i0; i <= i0 + Math.ceil(vw / S2) + 2; i++) {
    const x0 = i * S2 - cam.x * par, y0 = 14 + (H32(i) * 14 | 0), x1 = x0 + S2, y1 = 14 + (H32(i + 1) * 14 | 0), sag = 28;
    ctx.strokeStyle = night ? 'rgba(255,220,150,0.55)' : 'rgba(90,50,30,0.6)'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo((x0 + x1) / 2, (y0 + y1) / 2 + sag * 2, x1, y1); ctx.stroke();
    for (let j = 1; j < 9; j++) {
      const u = j / 9, px = lerp(lerp(x0, (x0 + x1) / 2, u), lerp((x0 + x1) / 2, x1, u), u), py = lerp(lerp(y0, (y0 + y1) / 2 + sag * 2, u), lerp((y0 + y1) / 2 + sag * 2, y1, u), u);
      const col = cols[(((i * 9 + j) % cols.length) + cols.length) % cols.length];
      if (night) {
        const fl = 0.75 + 0.25 * Math.sin(t * 5 + i * 3 + j);
        const gg = ctx.createRadialGradient(px, py + 9, 1, px, py + 9, 20); gg.addColorStop(0, col + 'aa'); gg.addColorStop(1, col + '00');
        ctx.globalAlpha = fl; ctx.fillStyle = gg; ctx.fillRect(px - 20, py - 11, 40, 40); ctx.globalAlpha = 1;
        ctx.fillStyle = col; rr(px - 4, py + 2, 8, 12, 3); ctx.fill(); ctx.fillStyle = '#5a3a1a'; ctx.fillRect(px - 3, py, 6, 3);
      } else {
        ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(px - 5, py); ctx.lineTo(px + 5, py); ctx.lineTo(px, py + 12); ctx.fill();
      }
    }
  }
}
function drawBackground(t) {
  const th = L.theme, vw = viewW(), vh = ROWS * T, ti = (L.n - 1) % 3;
  const g = ctx.createLinearGradient(0, 0, 0, vh);
  g.addColorStop(0, th.sky[0]); g.addColorStop(1, th.sky[1]); ctx.fillStyle = g; ctx.fillRect(0, 0, vw, vh);
  if (ti === 0) { // sun + soft clouds
    ctx.fillStyle = 'rgba(255,244,190,0.95)'; ctx.beginPath(); ctx.arc(vw * 0.8, 74, 32, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,244,190,0.25)'; ctx.beginPath(); ctx.arc(vw * 0.8, 74, 54, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    for (const c of clouds) {
      const x = c.x - cam.x * 0.25; if (x < -120 || x > vw + 120) continue;
      ctx.beginPath(); ctx.arc(x, c.y, 16 * c.s, 0, TAU); ctx.arc(x + 18 * c.s, c.y + 4, 12 * c.s, 0, TAU); ctx.arc(x - 18 * c.s, c.y + 5, 11 * c.s, 0, TAU); ctx.fill();
    }
  } else if (ti === 1) { // big low sun
    const sy = vh * 0.5; const gg = ctx.createRadialGradient(vw * 0.55, sy, 10, vw * 0.55, sy, 190); gg.addColorStop(0, 'rgba(255,250,200,0.9)'); gg.addColorStop(0.35, 'rgba(255,220,140,0.45)'); gg.addColorStop(1, 'rgba(255,200,120,0)');
    ctx.fillStyle = gg; ctx.fillRect(0, 0, vw, vh);
    ctx.fillStyle = '#fff6c8'; ctx.beginPath(); ctx.arc(vw * 0.55, sy, 52, 0, TAU); ctx.fill();
  } else { // stars + crescent
    const rnd = mulberry(5);
    for (let i = 0; i < 70; i++) { const x = rnd() * vw, y = rnd() * vh * 0.62; ctx.globalAlpha = 0.35 + 0.5 * Math.abs(Math.sin(t * 1.6 + i)); ctx.fillStyle = '#fff'; ctx.fillRect(x, y, i % 5 === 0 ? 3 : 2, i % 5 === 0 ? 3 : 2); }
    ctx.globalAlpha = 1;
    const mx = vw * 0.78, my = 78;
    const gm = ctx.createRadialGradient(mx, my, 10, mx, my, 70); gm.addColorStop(0, 'rgba(255,240,180,0.35)'); gm.addColorStop(1, 'rgba(255,240,180,0)'); ctx.fillStyle = gm; ctx.fillRect(mx - 80, my - 80, 160, 160);
    ctx.save(); ctx.beginPath(); ctx.arc(mx, my, 24, 0, TAU); ctx.clip();
    ctx.fillStyle = '#fff1b8'; ctx.beginPath(); ctx.rect(mx - 30, my - 30, 60, 60); ctx.arc(mx + 10, my - 5, 21, 0, TAU); ctx.fill('evenodd'); ctx.restore();
  }
  if (ti === 1) {
    dunes(0.12, vh * 0.66, 70, th.far, 1);
    // camel caravan on the far dune
    const span = vw + 500, bx = ((((-cam.x * 0.12 + t * 7) % span) + span) % span) - 250;
    for (let k = 0; k < 4; k++) { const x = bx + k * 48, y = duneY(0.12, x, vh * 0.66, 70, 1) + 4; camel(x, y, t * 3 + k, '#7a3f1e'); if (k === 0) { ctx.fillStyle = '#7a3f1e'; ctx.beginPath(); ctx.arc(x + 1, y - 38, 3.4, 0, TAU); ctx.fill(); ctx.fillRect(x - 3, y - 35, 7, 8); } }
    dunes(0.3, vh * 0.78, 56, th.mid, 4);
  } else {
    skyline(0.18, vh * 0.66, th.far, ti === 2 ? '#ffcf6b' : 'rgba(110,60,30,0.45)', 11, ti === 2);
    skyline(0.42, vh * 0.8, th.mid, ti === 2 ? '#ffb347' : 'rgba(80,40,20,0.5)', 29, ti === 2);
    garland(t, ti === 2);
  }
}
function drawTile(ch, x, y, c, r, t) {
  const th = L.theme;
  if (ch === '#') {
    ctx.fillStyle = th.dirt; ctx.fillRect(x, y, T, T);
    ctx.fillStyle = th.dirt2; const k = (c * 13 + r * 7) % 5; ctx.fillRect(x + 4 + k * 4, y + 14, 4, 3); ctx.fillRect(x + 20 - k * 3, y + 24, 5, 3);
    if (!isSolid(tile(c, r - 1))) {
      if (th.sand) {
        ctx.fillStyle = th.top[0]; ctx.fillRect(x, y, T, 8); ctx.fillStyle = th.top[1]; ctx.fillRect(x, y + 6, T, 3);
        ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(x + 8, y + 3, 5, Math.PI, 0); ctx.arc(x + 24, y + 3, 5, Math.PI, 0); ctx.stroke();
      } else {
        for (let i = 0; i < 4; i++) {
          ctx.fillStyle = th.top[(c * 4 + i) % th.top.length]; ctx.fillRect(x + i * 8, y, 8, 8);
          ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fillRect(x + i * 8, y + 7, 8, 1); ctx.fillRect(x + i * 8, y, 1, 8);
          ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.fillRect(x + i * 8 + 3, y + 3, 2, 2);
        }
        ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(x, y + 8, T, 2);
      }
    }
    if (!isSolid(tile(c - 1, r))) { ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.fillRect(x, y, 2, T); }
  } else if (ch === 'B') {
    ctx.fillStyle = th.brick; ctx.fillRect(x, y, T, T);
    ctx.fillStyle = th.brick2; ctx.fillRect(x, y, T, 2); ctx.fillRect(x, y + T - 2, T, 2); ctx.fillRect(x, y, 2, T); ctx.fillRect(x + T - 2, y, 2, T);
    star8(x + 16, y + 16, 11, th.brick2); star8(x + 16, y + 16, 6.5, th.brick);
    ctx.fillStyle = th.brick2; ctx.beginPath(); ctx.arc(x + 16, y + 16, 2.5, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.22)'; ctx.fillRect(x + 3, y + 3, 8, 2);
  } else if (ch === '?' || ch === 'U') {
    const used = ch === 'U';
    ctx.fillStyle = used ? '#8a7a6a' : '#ffc83a'; ctx.fillRect(x, y, T, T);
    ctx.fillStyle = used ? '#6a5a4a' : '#e08a10'; ctx.fillRect(x, y + T - 4, T, 4); ctx.fillRect(x + T - 4, y, 4, T);
    ctx.fillStyle = used ? '#9c8c7c' : '#fff1a0'; ctx.fillRect(x, y, T, 3); ctx.fillRect(x, y, 3, T);
    if (!used) {
      star8(x + 16, y + 16, 10, '#b8620a'); star8(x + 16, y + 16, 6, '#ffe08a'); ctx.fillStyle = '#b8620a'; ctx.beginPath(); ctx.arc(x + 16, y + 16, 2.4, 0, TAU); ctx.fill();
      const gl = (t * 1.5 + c) % 3; if (gl < 1) { ctx.fillStyle = `rgba(255,255,255,${0.6 * (1 - gl)})`; ctx.fillRect(x + gl * 24, y + 2, 4, T - 4); }
    } else { star8(x + 16, y + 16, 8, '#7a6a5a'); }
  } else if (ch === 'S') {
    ctx.fillStyle = th.stone; ctx.fillRect(x, y, T, T);
    ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(x, y, T, 3); ctx.fillRect(x, y, 3, T);
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(x, y + T - 3, T, 3); ctx.fillRect(x + T - 3, y, 3, T);
    ctx.fillStyle = 'rgba(0,0,0,0.14)'; archWin(x + 9, y + 8, 14, 18);
    ctx.fillStyle = 'rgba(0,0,0,0.1)'; ctx.fillRect(x + 4, y + 15, 24, 1);
  } else if (ch === '=') {
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = th.awn[i % 2]; ctx.fillRect(x + i * 8, y, 8, 8);
      ctx.beginPath(); ctx.arc(x + i * 8 + 4, y + 8, 4, 0, Math.PI); ctx.fill();
    }
    ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(x, y, T, 2);
    ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fillRect(x, y + 6, T, 2);
  } else if (ch === '^') { // prickly pear cactus
    const pad = (cx, cy, rx, ry) => {
      ctx.fillStyle = '#2f9a4a'; ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.2)'; ctx.lineWidth = 1; ctx.stroke();
      ctx.strokeStyle = '#f3ecd0'; ctx.lineWidth = 1;
      for (let i = 0; i < 5; i++) { const a = i * 1.25 + cx, px = cx + Math.cos(a) * rx * 0.55, py = cy + Math.sin(a) * ry * 0.55; ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + Math.cos(a) * 3, py + Math.sin(a) * 3 - 1); ctx.stroke(); }
    };
    pad(x + 16, y + 25, 11, 8); pad(x + 8, y + 16, 6, 8); pad(x + 24, y + 15, 6, 8);
    ctx.fillStyle = '#e0457b'; ctx.beginPath(); ctx.arc(x + 8, y + 7, 2.8, 0, TAU); ctx.arc(x + 24, y + 6, 2.8, 0, TAU); ctx.fill();
  }
}
function drawDecor(d, t) {
  const x = d.c * T, y = d.r * T, ti = (L.n - 1) % 3, night = ti === 2;
  if (d.k === 2) { // palm tree
    const h = 46 * d.s, lean = (d.c % 2 ? 1 : -1) * 6;
    ctx.strokeStyle = night ? '#4a3524' : '#7a4a2a'; ctx.lineWidth = 5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x + 16, y); ctx.quadraticCurveTo(x + 16 + lean, y - h * 0.5, x + 16 + lean * 1.5, y - h); ctx.stroke();
    ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(0,0,0,0.25)'; for (let i = 1; i < 6; i++) { const yy = y - h * i / 6; ctx.beginPath(); ctx.moveTo(x + 13 + lean * i / 8, yy); ctx.lineTo(x + 19 + lean * i / 8, yy); ctx.stroke(); }
    const tx = x + 16 + lean * 1.5, ty = y - h;
    ctx.strokeStyle = night ? '#1f6b4a' : '#2f9a3a'; ctx.lineWidth = 3;
    for (let i = 0; i < 7; i++) { const a = -Math.PI + (i / 6) * Math.PI, sw = Math.sin(t * 1.5 + d.c) * 2; ctx.beginPath(); ctx.moveTo(tx, ty); ctx.quadraticCurveTo(tx + Math.cos(a) * 14, ty + Math.sin(a) * 14 - 8, tx + Math.cos(a) * 26 + sw, ty + Math.sin(a) * 12 + 12); ctx.stroke(); }
    ctx.fillStyle = '#7a3f1e'; ctx.beginPath(); ctx.arc(tx - 3, ty + 3, 2.4, 0, TAU); ctx.arc(tx + 3, ty + 4, 2.4, 0, TAU); ctx.fill();
  } else if (d.k === 0) {
    if (ti === 1) { // dry bush + rocks
      ctx.fillStyle = '#b98a4a'; ctx.beginPath(); ctx.arc(x + 12, y - 5, 7 * d.s, Math.PI, 0); ctx.arc(x + 22, y - 4, 5 * d.s, Math.PI, 0); ctx.fill();
      ctx.fillStyle = '#9a7a5a'; ctx.beginPath(); ctx.ellipse(x + 6, y - 3, 6, 4, 0, Math.PI, 0); ctx.fill();
    } else { // clay jar (amphora)
      ctx.fillStyle = night ? '#8a4a2a' : '#c4602f'; ctx.beginPath(); ctx.moveTo(x + 12, y - 22 * d.s); ctx.quadraticCurveTo(x + 4, y - 12, x + 10, y); ctx.lineTo(x + 22, y); ctx.quadraticCurveTo(x + 28, y - 12, x + 20, y - 22 * d.s); ctx.closePath(); ctx.fill();
      ctx.fillStyle = night ? '#6a3a20' : '#a04820'; ctx.fillRect(x + 10, y - 26 * d.s, 12, 5 * d.s);
      ctx.strokeStyle = '#f2c14e'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(x + 8, y - 12); ctx.quadraticCurveTo(x + 16, y - 8, x + 24, y - 12); ctx.stroke();
    }
  } else { // standing brass lantern / cactus
    if (ti === 1) {
      ctx.fillStyle = '#2f9a4a'; rr(x + 13, y - 24 * d.s, 7, 24 * d.s, 3); ctx.fill(); rr(x + 6, y - 16 * d.s, 6, 12, 3); ctx.fill(); ctx.fillRect(x + 8, y - 8, 7, 3);
      rr(x + 21, y - 20 * d.s, 6, 11, 3); ctx.fill(); ctx.fillRect(x + 18, y - 10, 6, 3);
    } else {
      ctx.fillStyle = '#b98a2a'; ctx.fillRect(x + 15, y - 8, 3, 8);
      if (night) { const gg = ctx.createRadialGradient(x + 16, y - 20, 2, x + 16, y - 20, 28); gg.addColorStop(0, 'rgba(255,200,100,0.55)'); gg.addColorStop(1, 'rgba(255,200,100,0)'); ctx.fillStyle = gg; ctx.fillRect(x - 12, y - 48, 56, 56); }
      ctx.fillStyle = night ? '#ffcf6b' : '#e0a82a'; ctx.beginPath(); ctx.moveTo(x + 10, y - 10); ctx.lineTo(x + 22, y - 10); ctx.lineTo(x + 25, y - 22); ctx.lineTo(x + 16, y - 30); ctx.lineTo(x + 7, y - 22); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#8a5a14'; ctx.lineWidth = 1.2; ctx.stroke(); ctx.beginPath(); ctx.moveTo(x + 16, y - 29); ctx.lineTo(x + 16, y - 10); ctx.stroke();
    }
  }
}

const HERO = {
  robe: new Path2D('M24 46 Q40 40 56 46 L66 88 Q40 94 14 88 Z'),
  hood: new Path2D('M16 42 C10 20 28 6 48 -6 C42 8 62 14 64 42 Z'),
  beard: new Path2D('M26 36 Q40 64 54 36 Q48 46 40 47 Q32 46 26 36 Z'),
  stache: new Path2D('M30 38 Q40 32 50 38 Q40 41 30 38 Z'),
  nose: new Path2D('M40 29 Q43 35 39 36'),
};
function drawHero(x, y, w, h, dir, anim, sqx, sqy, power, t, air, dead) {
  const robe = power ? '#d8453b' : '#2f6fd6', hood = power ? '#a82b26' : '#2458b0', dk = power ? '#6e1a17' : '#17387a', skin = '#c98e5e';
  ctx.save();
  ctx.translate(x + w / 2, y + h);
  ctx.scale(sqx, sqy);
  if (power) { ctx.fillStyle = `rgba(255,214,90,${0.22 + 0.1 * Math.sin(t * 8)})`; ctx.beginPath(); ctx.arc(0, -17, 26, 0, TAU); ctx.fill(); }
  const s = 0.37; ctx.scale((dir || 1) * s, s); ctx.translate(-40, -96);
  const bob = air || dead ? 0 : Math.abs(Math.sin(anim)) * 2.5;
  const f = air ? 5 : Math.sin(anim) * 7;
  // babouches
  ctx.fillStyle = '#f2b134';
  for (const sgn of [-1, 1]) { const fx = 40 + sgn * 8 + sgn * f * (air ? 1 : 1), fy = 94 - (air ? (sgn > 0 ? 4 : 0) : Math.max(0, sgn * Math.cos(anim)) * 3); ctx.beginPath(); ctx.moveTo(fx - 8, fy + 2); ctx.quadraticCurveTo(fx - 6, fy - 6, fx + 4, fy - 4); ctx.quadraticCurveTo(fx + 12, fy - 6, fx + 16, fy - 2); ctx.quadraticCurveTo(fx + 10, fy + 3, fx - 8, fy + 2); ctx.fill(); ctx.fillStyle = '#b87a14'; ctx.fillRect(fx - 8, fy + 1, 22, 1.6); ctx.fillStyle = '#f2b134'; }
  ctx.translate(0, -bob);
  // back arm
  const arm = (sx, a) => {
    ctx.save(); ctx.translate(sx, 52); ctx.rotate(a);
    ctx.fillStyle = robe; ctx.beginPath(); ctx.ellipse(0, 9, 6.5, 12, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#f2c14e'; ctx.fillRect(-6, 17, 12, 2);
    ctx.fillStyle = skin; ctx.beginPath(); ctx.arc(0, 22, 3.8, 0, TAU); ctx.fill(); ctx.restore();
  };
  const sw = Math.sin(anim) * 0.6;
  arm(54, air ? -2.5 : -0.2 - sw);
  // robe
  ctx.fillStyle = robe; ctx.fill(HERO.robe);
  ctx.fillStyle = 'rgba(0,0,0,0.14)'; ctx.fillRect(40, 46, 26, 44);
  ctx.strokeStyle = '#f2c14e'; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.moveTo(40, 45); ctx.lineTo(40, 91); ctx.stroke();
  ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(15, 84); ctx.quadraticCurveTo(40, 90, 65, 84); ctx.stroke();
  ctx.fillStyle = '#f2c14e'; for (const by of [56, 66, 76]) { ctx.beginPath(); ctx.arc(40, by, 1.9, 0, TAU); ctx.fill(); }
  // hood
  ctx.fillStyle = hood; ctx.beginPath(); ctx.ellipse(40, 46, 23, 7, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = hood; ctx.fill(HERO.hood);
  ctx.strokeStyle = dk; ctx.lineWidth = 1.5; ctx.stroke(HERO.hood);
  ctx.fillStyle = dk; ctx.beginPath(); ctx.ellipse(40, 31, 18, 20, 0, 0, TAU); ctx.fill();
  // face
  ctx.fillStyle = skin; ctx.beginPath(); ctx.ellipse(40, 32, 14.5, 16.5, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.beginPath(); ctx.ellipse(40, 41, 12, 5, 0, 0, Math.PI); ctx.fill();
  ctx.strokeStyle = 'rgba(120,60,30,0.7)'; ctx.lineWidth = 1.2; ctx.stroke(HERO.nose);
  // eyes
  const blink = (t % 3.3) < 0.1;
  for (const ex of [34, 46]) {
    if (dead) { ctx.strokeStyle = '#1b1020'; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.moveTo(ex - 3, 26.5); ctx.lineTo(ex + 3, 32.5); ctx.moveTo(ex + 3, 26.5); ctx.lineTo(ex - 3, 32.5); ctx.stroke(); }
    else if (blink) { ctx.fillStyle = '#1b1020'; ctx.fillRect(ex - 3, 29.5, 6, 1.6); }
    else { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(ex, 29.5, 3.6, 3, 0, 0, TAU); ctx.fill(); ctx.fillStyle = '#1b1020'; ctx.beginPath(); ctx.arc(ex + 1.4, 29.5 + (air ? -0.6 : 0), 1.8, 0, TAU); ctx.fill(); }
  }
  ctx.strokeStyle = '#1b1020'; ctx.lineWidth = 2; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(30, 24.5 - (air ? 1.5 : 0)); ctx.lineTo(38, 24); ctx.moveTo(42, 24); ctx.lineTo(50, 24.5 - (air ? 1.5 : 0)); ctx.stroke();
  // beard + mustache
  ctx.fillStyle = '#2a1a14'; ctx.fill(HERO.beard); ctx.fill(HERO.stache);
  if (air || dead) { ctx.fillStyle = '#7a1f1f'; ctx.beginPath(); ctx.ellipse(40, 43, 3.2, 2.6, 0, 0, TAU); ctx.fill(); }
  // front arm
  arm(26, air ? 2.5 : 0.2 + sw);
  ctx.restore();
}
function drawEnemy(e, t) {
  const x = e.x, y = e.y;
  if (e.t === 'slime') { // scorpion
    const sq = e.dead && !e.fling ? 0.3 : 1 + Math.sin(e.ph + t * 6) * 0.05;
    ctx.save(); ctx.translate(x + e.w / 2, y + e.h); ctx.scale(1 / sq * (e.dead && !e.fling ? 1.3 : 1), sq);
    if (e.fling) ctx.scale(1, -1);
    ctx.scale(Math.sign(e.vx) || 1, 1.15); ctx.lineCap = 'round';
    ctx.strokeStyle = '#4a2010'; ctx.lineWidth = 1.6;
    for (let i = 0; i < 4; i++) { const sw = Math.sin(t * 14 + e.ph + i * 1.7) * 2.5; ctx.beginPath(); ctx.moveTo(i * 4 - 6, -6); ctx.lineTo(i * 4 - 8 + sw, 0); ctx.stroke(); }
    ctx.strokeStyle = '#c4552a'; ctx.lineWidth = 4.5;
    ctx.beginPath(); ctx.moveTo(-9, -8); ctx.bezierCurveTo(-20, -10, -17, -25, -5, -23); ctx.stroke();
    ctx.fillStyle = '#e8c04a'; ctx.beginPath(); ctx.moveTo(-6, -27); ctx.lineTo(1, -20); ctx.lineTo(-8, -21); ctx.fill();
    const bg = ctx.createLinearGradient(0, -14, 0, -2); bg.addColorStop(0, '#e0663a'); bg.addColorStop(1, '#8e3118');
    ctx.fillStyle = bg; ctx.beginPath(); ctx.ellipse(0, -8, 11, 6.5, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 1; for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(i * 4, -13); ctx.lineTo(i * 4, -3); ctx.stroke(); }
    ctx.fillStyle = '#c4552a'; for (const cy of [-12, -5]) { ctx.beginPath(); ctx.ellipse(12, cy, 4.2, 3, 0, 0, TAU); ctx.fill(); }
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(5, -12, 2.2, 0, TAU); ctx.fill(); ctx.fillStyle = '#1b1020'; ctx.beginPath(); ctx.arc(5.7, -12, 1.1, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#1b1020'; ctx.lineWidth = 1.3; ctx.beginPath(); ctx.moveTo(2.5, -15.5); ctx.lineTo(7.5, -14); ctx.stroke();
    ctx.restore();
  } else if (e.t === 'spiky') { // rolling hedgehog
    ctx.save(); ctx.translate(x + e.w / 2, y + e.h / 2); if (e.fling) ctx.scale(1, -1);
    ctx.rotate(e.dead ? 0 : t * 4 * (Math.sign(e.vx) || 1) * 0.3);
    ctx.fillStyle = '#4a2f1a';
    for (let i = 0; i < 9; i++) { const a = (i / 9) * TAU; ctx.beginPath(); ctx.moveTo(Math.cos(a - 0.2) * 9, Math.sin(a - 0.2) * 9); ctx.lineTo(Math.cos(a) * 17, Math.sin(a) * 17); ctx.lineTo(Math.cos(a + 0.2) * 9, Math.sin(a + 0.2) * 9); ctx.fill(); }
    ctx.fillStyle = '#d9a066'; ctx.beginPath(); ctx.arc(0, 0, 10, 0, TAU); ctx.fill();
    ctx.restore();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x + e.w / 2 - 4, y + e.h / 2 - 2, 3, 0, TAU); ctx.arc(x + e.w / 2 + 4, y + e.h / 2 - 2, 3, 0, TAU); ctx.fill();
    ctx.fillStyle = '#1b1020'; ctx.beginPath(); ctx.arc(x + e.w / 2 - 4, y + e.h / 2 - 2, 1.3, 0, TAU); ctx.arc(x + e.w / 2 + 4, y + e.h / 2 - 2, 1.3, 0, TAU); ctx.fill();
  } else if (e.t === 'bat') { // desert hawk
    ctx.save(); ctx.translate(x + e.w / 2, y + e.h / 2); if (e.fling) ctx.scale(1, -1);
    const fl = Math.sin(t * 14 + e.ph) * 0.7, d = Math.sign(e.vx) || -1;
    ctx.fillStyle = '#6b4a2b';
    for (const s of [-1, 1]) { ctx.save(); ctx.scale(s, 1); ctx.rotate(fl * 0.5); ctx.beginPath(); ctx.moveTo(4, 0); ctx.quadraticCurveTo(20, -14 * (0.5 + fl * 0.5), 26, 2); ctx.quadraticCurveTo(18, 4, 14, 2); ctx.quadraticCurveTo(9, 6, 4, 4); ctx.fill(); ctx.restore(); }
    ctx.fillStyle = '#a67c52'; ctx.beginPath(); ctx.ellipse(0, 0, 8, 7, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#f2c14e'; ctx.beginPath(); ctx.moveTo(d * 7, -2); ctx.lineTo(d * 14, 1); ctx.lineTo(d * 7, 3); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(d * 3, -2, 2.4, 0, TAU); ctx.fill();
    ctx.fillStyle = '#1b1020'; ctx.beginPath(); ctx.arc(d * 3.6, -2, 1.1, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#1b1020'; ctx.lineWidth = 1.3; ctx.beginPath(); ctx.moveTo(d * 0.5, -5.5); ctx.lineTo(d * 5.5, -3.5); ctx.stroke();
    ctx.restore();
  }
}

function render(now) {
  const t = now / 1000;
  ctx.setTransform(dpr * S, 0, 0, dpr * S, 0, 0);
  if (!L) return;
  const sx = G.shake > 0 ? rand(-G.shake, G.shake) * 0.3 : 0, sy = G.shake > 0 ? rand(-G.shake, G.shake) * 0.3 : 0;
  ctx.setTransform(dpr * S, 0, 0, dpr * S, dpr * sx, dpr * sy);
  drawBackground(t);
  ctx.save(); ctx.translate(-Math.floor(cam.x), 0);
  const c0 = Math.floor(cam.x / T) - 1, c1 = Math.ceil((cam.x + viewW()) / T) + 1;
  for (const d of L.decor) if (d.c >= c0 && d.c <= c1) drawDecor(d, t);
  // riad gate + flag
  { const fx = L.flagX * T, gy = L.gt[L.flagX] * T;
    ctx.fillStyle = '#ecd8ae'; ctx.fillRect(fx + 76, gy - 112, 100, 112);
    ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.fillRect(fx + 76, gy - 112, 6, 112);
    ctx.fillStyle = '#1fa06b'; for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.moveTo(fx + 72 + i * 22, gy - 112); ctx.lineTo(fx + 83 + i * 22, gy - 128); ctx.lineTo(fx + 94 + i * 22, gy - 112); ctx.fill(); }
    ctx.fillRect(fx + 72, gy - 114, 108, 4);
    for (let i = 0; i < 3; i++) star8(fx + 100 + i * 26, gy - 92, 7, i === 1 ? '#d8453b' : '#1f6fd1');
    ctx.fillStyle = '#2a1810'; ctx.beginPath(); ctx.moveTo(fx + 103, gy); ctx.lineTo(fx + 103, gy - 46); ctx.arc(fx + 126, gy - 46, 23, Math.PI, 0); ctx.lineTo(fx + 149, gy); ctx.fill();
    ctx.strokeStyle = '#f2c14e'; ctx.lineWidth = 3; ctx.stroke();
    const glow = ctx.createRadialGradient(fx + 126, gy - 20, 2, fx + 126, gy - 20, 30); glow.addColorStop(0, 'rgba(255,200,100,0.6)'); glow.addColorStop(1, 'rgba(255,200,100,0)'); ctx.fillStyle = glow; ctx.fillRect(fx + 96, gy - 70, 60, 70);
    ctx.fillStyle = '#e8e8f0'; ctx.fillRect(fx + 12, gy - 7 * T, 4, 7 * T);
    ctx.fillStyle = '#ffd23f'; ctx.beginPath(); ctx.arc(fx + 14, gy - 7 * T - 3, 6, 0, TAU); ctx.fill();
    const fy = G.state === 'win' ? Math.min(gy - 30, gy - 7 * T + 20 + G.winT * 180) : gy - 7 * T + 8;
    ctx.fillStyle = '#d8312f'; ctx.beginPath(); ctx.moveTo(fx + 16, fy); ctx.lineTo(fx + 16 + 40, fy + 12 + Math.sin(t * 5) * 2); ctx.lineTo(fx + 16, fy + 26); ctx.fill();
    star5(fx + 28, fy + 13 + Math.sin(t * 5) * 0.8, 6, '#1a8a4a');
  }
  for (let c = Math.max(0, c0); c <= Math.min(L.LEN - 1, c1); c++) for (let r = 0; r < ROWS; r++) {
    const ch = L.grid[r][c]; if (ch === ' ') continue;
    const b = bumps[r + ',' + c]; const off = b ? -Math.sin(b * Math.PI) * 9 : 0;
    drawTile(ch, c * T, r * T + off, c, r, t);
  }
  // checkpoints
  for (const e of ents) if (e.t === 'check') {
    ctx.fillStyle = '#e8e8f0'; ctx.fillRect(e.x + 10, e.y - 56, 3, 56);
    ctx.fillStyle = e.hit ? '#4dff9a' : '#ffd23f'; ctx.beginPath(); ctx.moveTo(e.x + 13, e.y - 56); ctx.lineTo(e.x + 36, e.y - 48 + Math.sin(t * 6) * 1.5); ctx.lineTo(e.x + 13, e.y - 40); ctx.fill();
  }
  // coins
  for (const e of ents) if (e.t === 'coin' && !e.got && e.x > cam.x - 40 && e.x < cam.x + viewW() + 40) {
    const sw = Math.abs(Math.cos(t * 4 + e.ph)); const cy = e.y + 8 + Math.sin(t * 3 + e.ph) * 2;
    ctx.save(); ctx.translate(e.x + 8, cy); ctx.scale(0.25 + sw * 0.75, 1);
    ctx.fillStyle = '#ffc800'; ctx.beginPath(); ctx.arc(0, 0, 8, 0, TAU); ctx.fill();
    ctx.fillStyle = '#ffe66a'; ctx.beginPath(); ctx.arc(0, 0, 6, 0, TAU); ctx.fill();
    star8(0, 0, 4.6, '#e0a000'); star8(0, 0, 2, '#ffe66a');
    ctx.restore();
  }
  // items
  for (const it of items) {
    ctx.save(); ctx.translate(it.x + 12, it.y + 12);
    ctx.fillStyle = 'rgba(255,230,100,0.35)'; ctx.beginPath(); ctx.arc(0, 0, 16 + Math.sin(t * 8) * 2, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1.4; ctx.lineCap = 'round';
    for (let i = -1; i <= 1; i += 2) { ctx.beginPath(); ctx.moveTo(i * 3, -10); ctx.quadraticCurveTo(i * 3 + Math.sin(t * 4 + i) * 4, -15, i * 3 + Math.sin(t * 3 + i) * 3, -20); ctx.stroke(); }
    ctx.fillStyle = '#3fbf5a'; for (const a of [-0.7, 0, 0.7]) { ctx.save(); ctx.translate(0, -8); ctx.rotate(a); ctx.beginPath(); ctx.ellipse(0, -4, 2.6, 5, 0, 0, TAU); ctx.fill(); ctx.restore(); }
    ctx.fillStyle = 'rgba(255,176,50,0.95)'; ctx.beginPath(); ctx.moveTo(-7, -8); ctx.lineTo(7, -8); ctx.lineTo(5.5, 10); ctx.lineTo(-5.5, 10); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(-5, -6, 2, 12);
    ctx.fillStyle = '#f2c14e'; ctx.fillRect(-8, -9.5, 16, 3); ctx.fillRect(-6.5, 8.5, 13, 2.5);
    ctx.fillStyle = '#c4852a'; ctx.fillRect(-6, 0, 12, 1.4);
    ctx.restore();
  }
  for (const e of ents) if ((e.t === 'slime' || e.t === 'spiky' || e.t === 'bat') && e.x > cam.x - 60 && e.x < cam.x + viewW() + 60 && !(e.dead && !e.fling && e.sq > 0.5)) drawEnemy(e, t);
  for (const s of seeds) { ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(s.life * 9); ctx.fillStyle = '#5a2d12'; ctx.beginPath(); ctx.ellipse(0, 0, 6, 3.6, 0, 0, TAU); ctx.fill(); ctx.fillStyle = '#9a5a2a'; ctx.beginPath(); ctx.ellipse(-1.5, -1, 2.6, 1, 0, 0, TAU); ctx.fill(); ctx.restore(); }
  // player
  if (P && G.state !== 'menu' && !(P.inv > 0 && Math.floor(t * 20) % 2)) {
    ctx.fillStyle = 'rgba(0,0,0,0.22)'; if (!P.dead) { ctx.beginPath(); ctx.ellipse(P.x + 11, shadowY(P) , 11, 3, 0, 0, TAU); ctx.fill(); }
    drawHero(P.x, P.y, P.w, P.h, P.dir, P.anim, P.sqx, P.sqy, P.power, t, !P.ground, P.dead);
  }
  for (const p of parts) {
    ctx.globalAlpha = clamp(p.life / p.max * 1.6, 0, 1); ctx.fillStyle = p.color;
    if (p.rot) { ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.life * 9); ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size); ctx.restore(); }
    else { ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, TAU); ctx.fill(); }
  }
  ctx.globalAlpha = 1;
  ctx.font = '700 14px Bungee, Rubik, sans-serif'; ctx.textAlign = 'center';
  for (const p of popups) { ctx.globalAlpha = clamp(p.life * 2, 0, 1); ctx.fillStyle = '#fff'; ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 3; ctx.strokeText(p.s, p.x, p.y); ctx.fillText(p.s, p.x, p.y); }
  ctx.globalAlpha = 1;
  ctx.restore();
  // dark theme vignette
  if (L.theme.dark) { const g = ctx.createRadialGradient(viewW() / 2, ROWS * T / 2, ROWS * T * 0.35, viewW() / 2, ROWS * T / 2, ROWS * T * 0.95); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,10,0.45)'); ctx.fillStyle = g; ctx.fillRect(0, 0, viewW(), ROWS * T); }
}
function shadowY(p) { for (let r = Math.floor((p.y + p.h) / T); r < ROWS; r++) { const ch = tile(Math.floor((p.x + 11) / T), r); if (isSolid(ch) || ch === '=') return r * T + 1; } return ROWS * T + 10; }

// ---------- Loop ----------
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = clamp((now - last) / 1000, 0, 0.05); last = now;
  if (G.state !== 'paused') update(dt);
  jumpPressed = false; shootPressed = false;
  render(now);
}

// ---------- Init ----------
layout();
loadLevel(1, false); G.state = 'menu';
el.bestMenu.textContent = best.toLocaleString('en-US');
if (reached > 1) { el.contBtn.classList.remove('hidden'); el.contLvl.textContent = reached; }
requestAnimationFrame((n) => { last = n; frame(n); });

if (location.search.includes('debug')) {
  debug = { G, get P() { return P; }, get L() { return L; }, K, start: newGame, load: (n) => { loadLevel(n, false); G.state = 'playing'; }, pressJump: () => { jumpPressed = true; }, pressShoot: () => { shootPressed = true; }, step: (dt) => { update(dt); jumpPressed = false; shootPressed = false; }, get ents() { return ents; } };
  window.__sp = debug;
}
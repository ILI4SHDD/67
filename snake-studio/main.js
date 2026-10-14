// ============================================================
//  SNAKE STUDIO : a fully customizable snake game
// ============================================================
const $ = (id) => document.getElementById(id);
const rnd = (a, b) => a + Math.random() * (b - a);

// ---------- settings ----------
const FRUITS = ['🍎', '🍌', '🍇', '🍓', '🍉', '🍩', '🍕', '🍔', '🧀', '🍪', '🐭', '🐸', '🦴', '💎', '🍄', '🌮'];
const SNAKE_COLORS = ['#4ade80', '#22d3ee', '#f472b6', '#facc15', '#fb923c', '#a78bfa', '#f87171', '#e2e8f0'];
const BG_COLORS = ['#0f172a', '#14532d', '#3b0764', '#7c2d12', '#082f49', '#111111', '#f5f0e1', '#164e63'];
const DEFAULTS = {
  speed: 5, ramp: true, fruit: '🍎', fruitImg: null, color: '#4ade80', headImg: null, headRound: true,
  bgColor: '#0f172a', bgImg: null, dim: 25, size: 21, wrap: 0, grid: true, powerups: true, obstacles: false, muted: false,
};
const SKEY = 'snakestudio-settings', BKEY = 'snakestudio-best';
let S = { ...DEFAULTS };
try { Object.assign(S, JSON.parse(localStorage.getItem(SKEY) || '{}')); } catch (e) { /* ignore */ }
let best = 0;
try { best = parseInt(localStorage.getItem(BKEY) || '0', 10) || 0; } catch (e) { /* ignore */ }

function toast(msg) {
  const t = document.createElement('div');
  t.textContent = msg;
  t.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:99;background:#1e293b;color:#fff;border:2px solid #f472b6;padding:8px 16px;border-radius:12px;font-weight:700;max-width:90vw;text-align:center';
  document.body.appendChild(t); setTimeout(() => t.remove(), 3200);
}
let warned = false;
function persist() {
  try { localStorage.setItem(SKEY, JSON.stringify(S)); }
  catch (e) { if (!warned) { warned = true; toast('Settings saved for this session only (image too big to store).'); } }
}

// ---------- images ----------
let headEl = null, fruitEl = null, bgEl = null;
function loadImg(src) { if (!src) return null; const im = new Image(); im.src = src; return im; }
function refreshImages() { headEl = loadImg(S.headImg); fruitEl = loadImg(S.fruitImg); bgEl = loadImg(S.bgImg); }
function readImage(file) {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = fr.result; };
    fr.onerror = rej; fr.readAsDataURL(file);
  });
}
async function processFile(file, kind) {
  if (!file || !file.type.startsWith('image/')) { toast('Please choose an image file.'); return; }
  let im;
  try { im = await readImage(file); } catch (e) { toast("Couldn't read that image. Try a JPG, PNG or WebP."); return; }
  const c = document.createElement('canvas'), x = c.getContext('2d');
  const iw = im.naturalWidth || im.width, ih = im.naturalHeight || im.height;
  if (kind === 'head') {
    c.width = c.height = 256; const m = Math.min(iw, ih);
    x.drawImage(im, (iw - m) / 2, (ih - m) / 2, m, m, 0, 0, 256, 256); S.headImg = c.toDataURL('image/png');
  } else if (kind === 'fruit') {
    c.width = c.height = 128; const k = Math.min(128 / iw, 128 / ih);
    x.drawImage(im, (128 - iw * k) / 2, (128 - ih * k) / 2, iw * k, ih * k); S.fruitImg = c.toDataURL('image/png');
  } else {
    const k = Math.min(1, 1280 / Math.max(iw, ih)); c.width = Math.round(iw * k); c.height = Math.round(ih * k);
    x.fillStyle = '#000'; x.fillRect(0, 0, c.width, c.height); x.drawImage(im, 0, 0, c.width, c.height); S.bgImg = c.toDataURL('image/jpeg', 0.82);
  }
  refreshImages(); persist(); syncUI();
}

// ---------- audio ----------
let ac = null;
function audio() {
  if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { ac = null; } }
  if (ac && ac.state === 'suspended') ac.resume();
  return ac;
}
function tone(f, d, type = 'sine', v = 0.12, at = 0, f2) {
  if (S.muted || !audio()) return;
  const t = ac.currentTime + at, o = ac.createOscillator(), g = ac.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + d);
  g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.001, t + d);
  o.connect(g).connect(ac.destination); o.start(t); o.stop(t + d + 0.02);
}
const sfx = {
  eat: (c) => { tone(420 + c * 70, 0.09, 'square', 0.08, 0, 700 + c * 90); tone(900 + c * 90, 0.1, 'sine', 0.06, 0.05); },
  bonus: () => [660, 880, 1100, 1480].forEach((f, i) => tone(f, 0.12, 'triangle', 0.12, i * 0.06)),
  power: () => [440, 660, 990].forEach((f, i) => tone(f, 0.12, 'sawtooth', 0.07, i * 0.07)),
  trim: () => tone(900, 0.2, 'triangle', 0.1, 0, 300),
  die: () => { tone(220, 0.5, 'sawtooth', 0.14, 0, 50); tone(110, 0.6, 'square', 0.1, 0.05, 40); },
  turn: () => tone(300, 0.025, 'square', 0.025),
};

// ---------- UI (studio) ----------
function speedLabel(v) { return v <= 2 ? 'Chill' : v <= 4 ? 'Easy' : v <= 6 ? 'Normal' : v <= 8 ? 'Fast' : 'Insane'; }
function isLight(hex) { const n = parseInt(hex.slice(1), 16); return ((n >> 16) * 299 + ((n >> 8) & 255) * 587 + (n & 255) * 114) / 1000 > 150; }
function buildUI() {
  const fg = $('fruitGrid');
  FRUITS.forEach((f) => { const b = document.createElement('button'); b.textContent = f; b.dataset.f = f; b.addEventListener('click', () => { S.fruit = f; S.fruitImg = null; refreshImages(); persist(); syncUI(); }); fg.appendChild(b); });
  const sc = $('snakeColors');
  SNAKE_COLORS.forEach((c) => { const b = document.createElement('button'); b.style.setProperty('--c', c); b.dataset.c = c; b.setAttribute('aria-label', 'Color ' + c); b.addEventListener('click', () => { S.color = c; persist(); syncUI(); }); sc.appendChild(b); });
  const rb = document.createElement('button'); rb.className = 'rainbow'; rb.dataset.c = 'rainbow'; rb.title = 'Rainbow'; rb.addEventListener('click', () => { S.color = 'rainbow'; persist(); syncUI(); }); sc.appendChild(rb);
  const bc = $('bgColors');
  BG_COLORS.forEach((c) => { const b = document.createElement('button'); b.style.setProperty('--c', c); b.dataset.c = c; b.setAttribute('aria-label', 'Background ' + c); b.addEventListener('click', () => { S.bgColor = c; S.bgImg = null; refreshImages(); persist(); syncUI(); }); bc.appendChild(b); });
  const cl = document.createElement('label'); cl.className = 'col'; cl.title = 'Pick any color'; cl.innerHTML = '<input type="color" id="bgPick" />'; bc.appendChild(cl);
  $('bgPick').addEventListener('input', (e) => { S.bgColor = e.target.value; S.bgImg = null; refreshImages(); persist(); syncUI(); });

  $('speed').addEventListener('input', (e) => { S.speed = +e.target.value; persist(); syncUI(); });
  $('ramp').addEventListener('change', (e) => { S.ramp = e.target.checked; persist(); });
  $('headRound').addEventListener('change', (e) => { S.headRound = e.target.checked; persist(); });
  $('gridLines').addEventListener('change', (e) => { S.grid = e.target.checked; persist(); });
  $('powerups').addEventListener('change', (e) => { S.powerups = e.target.checked; persist(); });
  $('obstacles').addEventListener('change', (e) => { S.obstacles = e.target.checked; persist(); });
  $('dim').addEventListener('input', (e) => { S.dim = +e.target.value; persist(); syncUI(); });
  $('sizeChips').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => { S.size = +b.dataset.v; persist(); syncUI(); }));
  $('wrapChips').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => { S.wrap = +b.dataset.v; persist(); syncUI(); }));
  $('fruitFile').addEventListener('change', (e) => { processFile(e.target.files[0], 'fruit'); e.target.value = ''; });
  $('fruitClear').addEventListener('click', () => { S.fruitImg = null; refreshImages(); persist(); syncUI(); });
  $('headClear').addEventListener('click', (e) => { e.stopPropagation(); S.headImg = null; refreshImages(); persist(); syncUI(); });
  $('bgClear').addEventListener('click', (e) => { e.stopPropagation(); S.bgImg = null; refreshImages(); persist(); syncUI(); });
  $('resetBtn').addEventListener('click', () => { S = { ...DEFAULTS, muted: S.muted }; refreshImages(); persist(); syncUI(); });
  [['headDrop', 'headFile', 'head'], ['bgDrop', 'bgFile', 'bg']].forEach(([d, f, kind]) => {
    const dz = $(d), inp = $(f);
    dz.addEventListener('click', () => inp.click());
    inp.addEventListener('change', (e) => { processFile(e.target.files[0], kind); e.target.value = ''; });
    ['dragenter', 'dragover'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add('over'); }));
    ['dragleave', 'drop'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove('over'); }));
    dz.addEventListener('drop', (e) => processFile(e.dataTransfer.files[0], kind));
  });
  $('muteBtn').addEventListener('click', () => { S.muted = !S.muted; persist(); syncUI(); });
}
function syncUI() {
  $('speed').value = S.speed; $('speedLbl').textContent = `${speedLabel(S.speed)} (${S.speed})`;
  $('ramp').checked = S.ramp; $('headRound').checked = S.headRound; $('gridLines').checked = S.grid;
  $('powerups').checked = S.powerups; $('obstacles').checked = S.obstacles;
  $('dim').value = S.dim; $('dimLbl').textContent = S.dim + '%';
  document.querySelectorAll('#fruitGrid button').forEach((b) => b.classList.toggle('on', !S.fruitImg && b.dataset.f === S.fruit));
  document.querySelectorAll('#snakeColors button').forEach((b) => b.classList.toggle('on', b.dataset.c === S.color));
  document.querySelectorAll('#bgColors button').forEach((b) => b.classList.toggle('on', !S.bgImg && b.dataset.c === S.bgColor));
  $('bgPick').value = /^#[0-9a-f]{6}$/i.test(S.bgColor) ? S.bgColor : '#0f172a';
  $('bgPick').parentElement.classList.toggle('on', !S.bgImg && !BG_COLORS.includes(S.bgColor));
  $('sizeChips').querySelectorAll('button').forEach((b) => b.classList.toggle('on', +b.dataset.v === S.size));
  $('wrapChips').querySelectorAll('button').forEach((b) => b.classList.toggle('on', +b.dataset.v === S.wrap));
  const set = (img, thumb, hint, drop, clear, src) => { img.src = src || ''; img.classList.toggle('hidden', !src); drop && drop.classList.toggle('has', !!src); clear.classList.toggle('hidden', !src); };
  set($('headThumb'), null, null, $('headDrop'), $('headClear'), S.headImg);
  set($('bgThumb'), null, null, $('bgDrop'), $('bgClear'), S.bgImg);
  set($('fruitThumb'), null, null, null, $('fruitClear'), S.fruitImg);
  $('muteBtn').textContent = S.muted ? '🔇' : '🔊';
  $('bestMenu').textContent = best.toLocaleString('en-US');
}

// ---------- shared drawing ----------
function drawBG(c, w, h, cols, rows, cell) {
  c.fillStyle = S.bgColor; c.fillRect(0, 0, w, h);
  const ready = bgEl && bgEl.complete && bgEl.naturalWidth;
  if (S.bgImg && ready) {
    const k = Math.max(w / bgEl.naturalWidth, h / bgEl.naturalHeight), iw = bgEl.naturalWidth * k, ih = bgEl.naturalHeight * k;
    c.drawImage(bgEl, (w - iw) / 2, (h - ih) / 2, iw, ih);
    if (S.dim) { c.fillStyle = `rgba(0,0,0,${S.dim / 100})`; c.fillRect(0, 0, w, h); }
  } else {
    c.fillStyle = isLight(S.bgColor) ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.045)';
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) if ((x + y) % 2) c.fillRect(x * cell, y * cell, cell, cell);
  }
  if (S.grid) {
    c.strokeStyle = S.bgImg ? 'rgba(255,255,255,0.12)' : isLight(S.bgColor) ? 'rgba(0,0,0,0.10)' : 'rgba(255,255,255,0.07)'; c.lineWidth = 1; c.beginPath();
    for (let x = 1; x < cols; x++) { c.moveTo(x * cell, 0); c.lineTo(x * cell, h); }
    for (let y = 1; y < rows; y++) { c.moveTo(0, y * cell); c.lineTo(w, y * cell); }
    c.stroke();
  }
}
function bodyColor(i, t) { return S.color === 'rainbow' ? `hsl(${(i * 14 + t * 90) % 360} 85% 58%)` : S.color; }
function drawSnake(c, pts, cell, dir, t, pulse) {
  const n = pts.length, wAt = (i) => cell * (0.82 - 0.34 * (i / Math.max(1, n - 1)));
  c.lineCap = 'round'; c.lineJoin = 'round';
  for (let pass = 0; pass < 2; pass++) {
    for (let i = n - 1; i >= 1; i--) {
      const a = pts[i], b = pts[i - 1];
      if (Math.hypot(a.x - b.x, a.y - b.y) > cell * 1.6) continue;
      c.lineWidth = wAt(i) + (pass === 0 ? cell * 0.16 : 0);
      c.strokeStyle = pass === 0 ? 'rgba(0,0,0,0.5)' : bodyColor(i, t);
      c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke();
    }
  }
  c.fillStyle = 'rgba(255,255,255,0.2)';
  for (let i = 2; i < n; i += 2) { c.beginPath(); c.arc(pts[i].x, pts[i].y, wAt(i) * 0.2, 0, 7); c.fill(); }
  // head
  const h = pts[0], sc = 1 + pulse * 0.28;
  if (S.headImg && headEl && headEl.complete && headEl.naturalWidth) {
    const hs = cell * 1.5 * sc;
    c.save(); c.translate(h.x, h.y);
    c.shadowColor = 'rgba(0,0,0,0.5)'; c.shadowBlur = cell * 0.25;
    if (S.headRound) { c.beginPath(); c.arc(0, 0, hs / 2, 0, 7); c.fillStyle = '#fff'; c.fill(); c.shadowBlur = 0; c.save(); c.clip(); c.drawImage(headEl, -hs / 2, -hs / 2, hs, hs); c.restore(); c.lineWidth = cell * 0.1; c.strokeStyle = S.color === 'rainbow' ? '#fff' : S.color; c.beginPath(); c.arc(0, 0, hs / 2, 0, 7); c.stroke(); }
    else { c.drawImage(headEl, -hs / 2, -hs / 2, hs, hs); c.shadowBlur = 0; }
    c.restore();
  } else {
    const r = cell * 0.55 * sc;
    c.fillStyle = 'rgba(0,0,0,0.5)'; c.beginPath(); c.arc(h.x, h.y, r + cell * 0.07, 0, 7); c.fill();
    c.fillStyle = bodyColor(0, t); c.beginPath(); c.arc(h.x, h.y, r, 0, 7); c.fill();
    const px = -dir.y, py = dir.x;
    if (Math.sin(t * 3) > 0.82) {
      c.strokeStyle = '#ef4444'; c.lineWidth = cell * 0.07; c.beginPath(); const tx = h.x + dir.x * r, ty = h.y + dir.y * r, ex = tx + dir.x * cell * 0.5, ey = ty + dir.y * cell * 0.5;
      c.moveTo(tx, ty); c.lineTo(ex, ey); c.moveTo(ex, ey); c.lineTo(ex + dir.x * cell * 0.15 + px * cell * 0.12, ey + dir.y * cell * 0.15 + py * cell * 0.12); c.moveTo(ex, ey); c.lineTo(ex + dir.x * cell * 0.15 - px * cell * 0.12, ey + dir.y * cell * 0.15 - py * cell * 0.12); c.stroke();
    }
    for (const s of [-1, 1]) {
      const ex = h.x + dir.x * cell * 0.13 + px * s * cell * 0.24, ey = h.y + dir.y * cell * 0.13 + py * s * cell * 0.24;
      c.fillStyle = '#fff'; c.beginPath(); c.arc(ex, ey, cell * 0.2, 0, 7); c.fill();
      c.fillStyle = '#111'; c.beginPath(); c.arc(ex + dir.x * cell * 0.07, ey + dir.y * cell * 0.07, cell * 0.1, 0, 7); c.fill();
    }
  }
}
function drawFruit(c, x, y, cell, t, golden) {
  const s = 1 + Math.sin(t * 5) * 0.06;
  if (golden) { c.fillStyle = `rgba(250,204,21,${0.3 + Math.sin(t * 8) * 0.12})`; c.beginPath(); c.arc(x, y, cell * 0.85, 0, 7); c.fill(); c.strokeStyle = '#facc15'; c.lineWidth = 3; c.beginPath(); c.arc(x, y, cell * 0.62, 0, 7); c.stroke(); }
  else { c.fillStyle = 'rgba(255,255,255,0.12)'; c.beginPath(); c.arc(x, y, cell * 0.62, 0, 7); c.fill(); }
  if (S.fruitImg && fruitEl && fruitEl.complete && fruitEl.naturalWidth) { const d = cell * 1.05 * s; c.drawImage(fruitEl, x - d / 2, y - d / 2, d, d); }
  else { c.font = `${cell * 0.88 * s}px 'Segoe UI Emoji', 'Apple Color Emoji', 'Noto Color Emoji', sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#fff'; c.fillText(S.fruit, x, y + cell * 0.05); }
}
const EFF = {
  turbo: { icon: '⚡', color: '#facc15', dur: 5 }, slow: { icon: '🐢', color: '#22d3ee', dur: 6 },
  ghost: { icon: '👻', color: '#a78bfa', dur: 6 }, dbl: { icon: '💎', color: '#f472b6', dur: 8 }, trim: { icon: '✂️', color: '#fb923c', dur: 0 },
};
function drawBadge(c, x, y, cell, type, t, ttl) {
  if (ttl !== undefined && ttl < 3 && Math.floor(t * 6) % 2) return;
  const e = EFF[type]; const b = Math.sin(t * 4) * cell * 0.05;
  c.fillStyle = e.color; c.globalAlpha = 0.35; c.beginPath(); c.arc(x, y + b, cell * 0.72, 0, 7); c.fill(); c.globalAlpha = 1;
  c.fillStyle = 'rgba(11,16,32,0.85)'; c.beginPath(); c.arc(x, y + b, cell * 0.5, 0, 7); c.fill(); c.strokeStyle = e.color; c.lineWidth = 2.5; c.stroke();
  c.font = `${cell * 0.6}px 'Segoe UI Emoji', 'Apple Color Emoji', 'Noto Color Emoji', sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#fff'; c.fillText(e.icon, x, y + b + 1);
}
function drawRock(c, x, y, cell) {
  const r = cell * 0.46;
  c.fillStyle = '#475569'; c.strokeStyle = '#1e293b'; c.lineWidth = 3;
  c.beginPath(); c.moveTo(x - r, y + r * 0.6); c.lineTo(x - r * 0.8, y - r * 0.4); c.lineTo(x - r * 0.2, y - r); c.lineTo(x + r * 0.7, y - r * 0.7); c.lineTo(x + r, y + r * 0.2); c.lineTo(x + r * 0.5, y + r * 0.8); c.closePath(); c.fill(); c.stroke();
  c.fillStyle = 'rgba(255,255,255,0.2)'; c.beginPath(); c.moveTo(x - r * 0.6, y - r * 0.3); c.lineTo(x - r * 0.1, y - r * 0.75); c.lineTo(x + r * 0.4, y - r * 0.5); c.lineTo(x - r * 0.1, y - r * 0.1); c.closePath(); c.fill();
}

// ---------- preview ----------
const pv = $('pv'), pc = pv.getContext('2d');
function drawPreview(t) {
  const cols = 14, rows = 10, cell = 40;
  pc.setTransform(1, 0, 0, 1, 0, 0);
  drawBG(pc, 560, 400, cols, rows, cell);
  if (S.obstacles) { drawRock(pc, 6.5 * cell, 7.5 * cell, cell); drawRock(pc, 2.5 * cell, 2.5 * cell, cell); }
  if (S.powerups) drawBadge(pc, 4.5 * cell, 2.5 * cell, cell, 'turbo', t);
  drawFruit(pc, 11.5 * cell, (3.5 + Math.sin(t * 1.5) * 0.2) * cell, cell, t, false);
  const pts = [];
  for (let i = 0; i < 9; i++) pts.push({ x: (9.2 - i * 0.82) * cell, y: (5.2 + Math.sin(t * 2.2 - i * 0.7) * 0.9) * cell });
  drawSnake(pc, pts, cell, { x: 1, y: 0 }, t, 0);
}

// ---------- game ----------
const cv = $('cv'), c2 = cv.getContext('2d');
const G = { state: 'menu', N: 21, cell: 30, dpr: 1, cur: [], prev: [], dir: { x: 1, y: 0 }, queue: [], fruit: null, bonus: null, pups: [], rocks: [], score: 0, eaten: 0, combo: 1, bestCombo: 1, lastEat: -99, eff: {}, grow: 0, acc: 0, alpha: 0, t: 0, shake: 0, parts: [], floats: [], pulse: 0, puT: 8, newBest: false };

function resizeBoard() {
  const wrap = $('boardWrap'); if (!wrap.clientWidth) return;
  const avail = Math.min(wrap.clientWidth, wrap.clientHeight, 780) - 8;
  G.dpr = Math.min(window.devicePixelRatio || 1, 2);
  G.cell = Math.max(10, Math.floor(avail / G.N));
  const css = G.cell * G.N;
  cv.style.width = css + 'px'; cv.style.height = css + 'px';
  cv.width = Math.round(css * G.dpr); cv.height = Math.round(css * G.dpr);
}
window.addEventListener('resize', resizeBoard);

function freeCell(minHeadDist = 0) {
  const occ = new Set();
  G.cur.forEach((p) => occ.add(p.x + ',' + p.y)); G.rocks.forEach((p) => occ.add(p.x + ',' + p.y)); G.pups.forEach((p) => occ.add(p.x + ',' + p.y));
  if (G.fruit) occ.add(G.fruit.x + ',' + G.fruit.y); if (G.bonus) occ.add(G.bonus.x + ',' + G.bonus.y);
  const list = [], h = G.cur[0];
  for (let y = 0; y < G.N; y++) for (let x = 0; x < G.N; x++) {
    if (occ.has(x + ',' + y)) continue;
    if (minHeadDist && Math.abs(x - h.x) + Math.abs(y - h.y) < minHeadDist) continue;
    list.push({ x, y });
  }
  return list.length ? list[Math.floor(Math.random() * list.length)] : null;
}
function newGame() {
  G.N = S.size; resizeBoard();
  const m = Math.floor(G.N / 2);
  G.cur = [{ x: m, y: m }, { x: m - 1, y: m }, { x: m - 2, y: m }]; G.prev = G.cur.map((p) => ({ ...p }));
  G.dir = { x: 1, y: 0 }; G.queue = []; G.fruit = null; G.bonus = null; G.pups = []; G.rocks = []; G.parts = []; G.floats = [];
  G.score = 0; G.eaten = 0; G.combo = 1; G.bestCombo = 1; G.lastEat = -99; G.eff = {}; G.grow = 0; G.acc = 0; G.alpha = 0; G.shake = 0; G.pulse = 0; G.puT = rnd(6, 10); G.newBest = false;
  G.fruit = freeCell(); G.state = 'ready';
  cv.style.borderStyle = S.wrap ? 'dashed' : 'solid'; cv.style.borderColor = S.wrap ? 'rgba(34,211,238,0.75)' : 'rgba(248,113,113,0.7)';
  $('ready').classList.remove('hidden'); ['pause', 'over'].forEach((i) => $(i).classList.add('hidden'));
  hud(); buildEffects();
}
function showGame() { $('menu').classList.add('hidden'); $('game').classList.remove('hidden'); document.body.style.overflow = 'hidden'; newGame(); }
function showMenu() { G.state = 'menu'; $('game').classList.add('hidden'); $('menu').classList.remove('hidden'); ['pause', 'over'].forEach((i) => $(i).classList.add('hidden')); document.body.style.overflow = ''; syncUI(); }

function curInterval() {
  let base = 210 - (S.speed - 1) * 17;
  if (S.ramp) base -= Math.min(G.eaten * 2, base * 0.3);
  if (G.eff.turbo > 0) base *= 0.62;
  if (G.eff.slow > 0) base *= 1.7;
  return base;
}
function setDir(dx, dy) {
  if (G.state !== 'play' && G.state !== 'ready') return;
  if (G.state === 'ready') { if (dx === -1) return; G.state = 'play'; $('ready').classList.add('hidden'); audio(); }
  const last = G.queue.length ? G.queue[G.queue.length - 1] : G.dir;
  if ((dx === -last.x && dy === -last.y) || (dx === last.x && dy === last.y)) return;
  if (G.queue.length < 2) { G.queue.push({ x: dx, y: dy }); sfx.turn(); }
}
function emit(x, y, n, col, sp = 5) {
  for (let i = 0; i < n; i++) { const a = rnd(0, 6.283), s = rnd(0.3, 1) * sp; G.parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rnd(0.4, 0.9), max: 0.9, c: col, s: rnd(0.08, 0.2) }); }
}
function floatTxt(x, y, text, color = '#fff') { G.floats.push({ x, y, text, color, life: 1 }); }
function hud() {
  $('score').textContent = G.score.toLocaleString('en-US'); $('best').textContent = Math.max(best, G.score).toLocaleString('en-US');
  $('len').textContent = G.cur.length; $('combo').textContent = '×' + G.combo;
}
function buildEffects() {
  const box = $('effects'); box.innerHTML = '';
  Object.keys(G.eff).forEach((k) => { if (G.eff[k] > 0) { const d = document.createElement('div'); d.className = 'fx'; d.dataset.k = k; d.style.setProperty('--c', EFF[k].color); d.innerHTML = `${EFF[k].icon}<i></i>`; box.appendChild(d); } });
}
function applyEffect(type, x, y) {
  sfx.power();
  if (type === 'trim') {
    const cut = Math.min(4, G.cur.length - 3);
    if (cut > 0) { for (let i = 0; i < cut; i++) { const p = G.cur.pop(); G.prev.pop(); emit(p.x + 0.5, p.y + 0.5, 4, '#fb923c', 3); } }
    sfx.trim(); floatTxt(x, y, cut > 0 ? `✂️ −${cut}` : '✂️', '#fb923c'); hud();
  } else { G.eff[type] = EFF[type].dur; buildEffects(); floatTxt(x, y, EFF[type].icon + ' ' + { turbo: 'TURBO', slow: 'SLOW-MO', ghost: 'GHOST', dbl: '×2 SCORE' }[type], EFF[type].color); }
  emit(x, y, 14, EFF[type].color, 5);
}
function eat(golden, x, y) {
  G.combo = G.t - G.lastEat < 4 ? Math.min(5, G.combo + 1) : 1; G.lastEat = G.t; G.bestCombo = Math.max(G.bestCombo, G.combo);
  const pts = Math.round((golden ? 50 : 10) * G.combo * (G.eff.dbl > 0 ? 2 : 1) * (1 + (S.speed - 1) * 0.08));
  G.score += pts; G.eaten++; G.grow += golden ? 1 : 0; G.pulse = 1;
  floatTxt(x, y, '+' + pts, golden ? '#facc15' : '#fff'); emit(x, y, golden ? 26 : 12, golden ? '#facc15' : bodyColor(0, G.t), golden ? 7 : 5);
  golden ? sfx.bonus() : sfx.eat(G.combo);
  const cb = $('comboBox'); cb.classList.remove('hot'); void cb.offsetWidth; if (G.combo > 1) cb.classList.add('hot');
  if (!golden) {
    G.fruit = freeCell();
    if (G.eaten % 5 === 0 && !G.bonus) { const f = freeCell(); if (f) G.bonus = { ...f, ttl: 8 }; }
    if (S.obstacles && G.eaten % 3 === 0 && G.rocks.length < 14) { const r = freeCell(5); if (r) G.rocks.push(r); }
  }
  hud();
}
function die(why) {
  if (G.state === 'dead') return;
  G.state = 'dead'; G.shake = 1; sfx.die();
  G.cur.forEach((p, i) => { if (i % 2 === 0) emit(p.x + 0.5, p.y + 0.5, 3, bodyColor(i, G.t), 6); });
  if (G.score > best) { best = G.score; G.newBest = true; try { localStorage.setItem(BKEY, String(best)); } catch (e) { /* ignore */ } }
  setTimeout(() => showOver(why), 900);
}
function showOver(why) {
  if (G.state !== 'dead') return;
  $('overTitle').textContent = why === 'win' ? 'PERFECT! 🏆' : why === 'wall' ? 'SPLAT! 🧱' : why === 'rock' ? 'BONK! 🪨' : 'OUCH! 🐍';
  $('finalScore').textContent = G.score.toLocaleString('en-US');
  $('newBest').classList.toggle('hidden', !G.newBest);
  $('stLen').textContent = G.cur.length; $('stFruit').textContent = G.eaten; $('stCombo').textContent = '×' + G.bestCombo; $('stBest').textContent = best.toLocaleString('en-US');
  $('over').classList.remove('hidden');
}
function tick() {
  if (G.queue.length) G.dir = G.queue.shift();
  const h = G.cur[0]; let nx = h.x + G.dir.x, ny = h.y + G.dir.y;
  if (S.wrap) { nx = (nx + G.N) % G.N; ny = (ny + G.N) % G.N; }
  else if (nx < 0 || ny < 0 || nx >= G.N || ny >= G.N) return die('wall');
  const ateF = G.fruit && G.fruit.x === nx && G.fruit.y === ny;
  const ateB = G.bonus && G.bonus.x === nx && G.bonus.y === ny;
  const growing = G.grow > 0 || ateF || ateB;
  if (G.rocks.some((r) => r.x === nx && r.y === ny)) return die('rock');
  if (!(G.eff.ghost > 0)) {
    const lim = growing ? G.cur.length : G.cur.length - 1;
    for (let i = 0; i < lim; i++) if (G.cur[i].x === nx && G.cur[i].y === ny) return die('body');
  }
  G.prev = G.cur.map((p) => ({ ...p })); G.cur.unshift({ x: nx, y: ny });
  if (growing) { G.prev.push({ ...G.prev[G.prev.length - 1] }); if (G.grow > 0) G.grow--; } else G.cur.pop();
  if (ateF) { const f = G.fruit; eat(false, f.x + 0.5, f.y + 0.5); if (!G.fruit) return die('win'); }
  if (ateB) { const b = G.bonus; G.bonus = null; eat(true, b.x + 0.5, b.y + 0.5); }
  const pi = G.pups.findIndex((p) => p.x === nx && p.y === ny);
  if (pi >= 0) { const p = G.pups.splice(pi, 1)[0]; applyEffect(p.type, p.x + 0.5, p.y + 0.5); }
  hud();
}
function update(dt) {
  G.t += dt;
  if (G.state === 'play') {
    let fxChanged = false;
    for (const k of Object.keys(G.eff)) if (G.eff[k] > 0) { G.eff[k] -= dt; if (G.eff[k] <= 0) { delete G.eff[k]; fxChanged = true; } }
    if (fxChanged) buildEffects();
    document.querySelectorAll('#effects .fx').forEach((e) => { const k = e.dataset.k; e.lastChild.style.transform = `scaleX(${Math.max(0, (G.eff[k] || 0) / EFF[k].dur)})`; });
    if (G.bonus) { G.bonus.ttl -= dt; if (G.bonus.ttl <= 0) G.bonus = null; }
    G.pups = G.pups.filter((p) => (p.ttl -= dt) > 0);
    if (S.powerups) { G.puT -= dt; if (G.puT <= 0) { G.puT = rnd(8, 13); if (G.pups.length < 1) { const f = freeCell(); if (f) { const types = ['turbo', 'slow', 'ghost', 'dbl', 'trim']; G.pups.push({ ...f, type: types[Math.floor(Math.random() * types.length)], ttl: 10 }); } } } }
    G.acc += dt * 1000;
    let iv = curInterval();
    while (G.acc >= iv && G.state === 'play') { G.acc -= iv; tick(); iv = curInterval(); }
    G.alpha = G.state === 'play' ? G.acc / iv : 0;
  }
  if (G.state !== 'pause') {
    for (const p of G.parts) { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 6 * dt; }
    G.parts = G.parts.filter((p) => p.life > 0);
    for (const f of G.floats) { f.life -= dt * 0.9; f.y -= dt * 1.2; }
    G.floats = G.floats.filter((f) => f.life > 0);
    G.pulse = Math.max(0, G.pulse - dt * 4); G.shake = Math.max(0, G.shake - dt * 1.4);
  }
}
function drawGame() {
  const s = G.cell * G.dpr, cell = G.cell, w = cell * G.N;
  c2.setTransform(G.dpr, 0, 0, G.dpr, 0, 0);
  c2.save();
  if (G.shake > 0) c2.translate(rnd(-1, 1) * G.shake * cell * 0.4, rnd(-1, 1) * G.shake * cell * 0.4);
  drawBG(c2, w, w, G.N, G.N, cell);
  G.rocks.forEach((r) => drawRock(c2, (r.x + 0.5) * cell, (r.y + 0.5) * cell, cell));
  G.pups.forEach((p) => drawBadge(c2, (p.x + 0.5) * cell, (p.y + 0.5) * cell, cell, p.type, G.t, p.ttl));
  if (G.fruit) drawFruit(c2, (G.fruit.x + 0.5) * cell, (G.fruit.y + 0.5) * cell, cell, G.t, false);
  if (G.bonus) {
    drawFruit(c2, (G.bonus.x + 0.5) * cell, (G.bonus.y + 0.5) * cell, cell, G.t, true);
    c2.strokeStyle = '#fff'; c2.lineWidth = 3; c2.beginPath(); c2.arc((G.bonus.x + 0.5) * cell, (G.bonus.y + 0.5) * cell, cell * 0.78, -Math.PI / 2, -Math.PI / 2 + (G.bonus.ttl / 8) * 6.283); c2.stroke();
  }
  const a = G.alpha, pts = G.cur.map((p, i) => {
    const q = G.prev[i] || p; let x = p.x, y = p.y;
    if (Math.abs(p.x - q.x) <= 1 && Math.abs(p.y - q.y) <= 1) { x = q.x + (p.x - q.x) * a; y = q.y + (p.y - q.y) * a; }
    return { x: (x + 0.5) * cell, y: (y + 0.5) * cell };
  });
  if (G.eff.ghost > 0) c2.globalAlpha = 0.55; if (G.state === 'dead') c2.globalAlpha = 0.6 + Math.sin(G.t * 30) * 0.3;
  if (G.eff.turbo > 0 && G.state === 'play' && Math.random() < 0.6) emit(G.cur[0].x + 0.5 - G.dir.x * 0.6, G.cur[0].y + 0.5 - G.dir.y * 0.6, 1, '#facc15', 1.5);
  const sdir = G.queue.length && G.state === 'play' ? G.dir : G.dir;
  drawSnake(c2, pts, cell, sdir, G.t, G.pulse);
  c2.globalAlpha = 1;
  for (const p of G.parts) { c2.globalAlpha = Math.max(0, p.life / p.max); c2.fillStyle = p.c; c2.beginPath(); c2.arc(p.x * cell, p.y * cell, p.s * cell, 0, 7); c2.fill(); }
  c2.globalAlpha = 1;
  for (const f of G.floats) { c2.globalAlpha = Math.min(1, f.life * 1.6); c2.font = `800 ${cell * 0.7}px 'Baloo 2', sans-serif`; c2.textAlign = 'center'; c2.lineWidth = 4; c2.strokeStyle = 'rgba(0,0,0,0.7)'; c2.strokeText(f.text, f.x * cell, f.y * cell); c2.fillStyle = f.color; c2.fillText(f.text, f.x * cell, f.y * cell); }
  c2.globalAlpha = 1; c2.restore();
  void s;
}
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - last) / 1000, 0.05); last = now;
  if (G.state === 'menu') { drawPreview(now / 1000); return; }
  update(dt); drawGame();
}
requestAnimationFrame(frame);

// ---------- controls ----------
function setPause(p) {
  if (p && G.state === 'play') { G.state = 'pause'; $('pause').classList.remove('hidden'); }
  else if (!p && G.state === 'pause') { G.state = 'play'; $('pause').classList.add('hidden'); }
}
window.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if (G.state === 'menu') { if (k === 'enter' && document.activeElement.tagName !== 'INPUT') showGame(); return; }
  const map = { arrowup: [0, -1], w: [0, -1], z: [0, -1], arrowdown: [0, 1], s: [0, 1], arrowleft: [-1, 0], a: [-1, 0], q: [-1, 0], arrowright: [1, 0], d: [1, 0] };
  if (map[k]) { e.preventDefault(); setDir(...map[k]); }
  else if (k === ' ' || k === 'p' || k === 'escape') { e.preventDefault(); if (G.state === 'pause') setPause(false); else if (G.state === 'play') setPause(true); else if (G.state === 'dead' && !$('over').classList.contains('hidden') && k === ' ') showGame(); }
  else if (k === 'enter' && G.state === 'dead' && !$('over').classList.contains('hidden')) showGame();
  else if (k === 'm') { S.muted = !S.muted; persist(); }
});
let sw = null;
const gm = $('game');
gm.addEventListener('pointerdown', (e) => { if (e.target.closest('.hud') || e.pointerType === 'mouse') return; sw = { x: e.clientX, y: e.clientY }; });
gm.addEventListener('pointermove', (e) => {
  if (!sw) return; const dx = e.clientX - sw.x, dy = e.clientY - sw.y;
  if (Math.max(Math.abs(dx), Math.abs(dy)) > 22) { Math.abs(dx) > Math.abs(dy) ? setDir(Math.sign(dx), 0) : setDir(0, Math.sign(dy)); sw = { x: e.clientX, y: e.clientY }; }
});
['pointerup', 'pointercancel'].forEach((t) => gm.addEventListener(t, () => { sw = null; }));
gm.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
document.addEventListener('visibilitychange', () => { if (document.hidden) setPause(true); });
$('pauseBtn').addEventListener('click', () => (G.state === 'pause' ? setPause(false) : setPause(true)));
$('resumeBtn').addEventListener('click', () => setPause(false));
$('menuBtn').addEventListener('click', showMenu);
$('toStudio').addEventListener('click', showMenu);
$('playBtn').addEventListener('click', () => { audio(); showGame(); });
$('retryBtn').addEventListener('click', showGame);

// ---------- init ----------
refreshImages(); buildUI(); syncUI();
if (location.search.includes('debug')) {
  window.__sn = { G, S, tick, setDir, freeCell, step: (n = 1) => { for (let i = 0; i < n; i++) if (G.state === 'play') tick(); G.alpha = 0; }, showGame, refreshImages, applyEffect };
}
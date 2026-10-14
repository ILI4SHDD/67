'use strict';
const $ = (id) => document.getElementById(id);
const cv = $('cv'), ctx = cv.getContext('2d');

// ---------------------------------------------------------------- settings
const NORMS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]; // R L U D F B
const PRESETS = {
  classic: ['#d62839', '#ff8a1f', '#f4f4f4', '#ffd60a', '#16a34a', '#2563eb'],
  pastel: ['#ff8fa3', '#ffc48a', '#fff7ed', '#fff1a6', '#a7e8bd', '#9cc9ff'],
  neon: ['#ff2d55', '#ff9500', '#ffffff', '#fff200', '#00ff8c', '#00c2ff'],
  candy: ['#ff4d8d', '#ff9f1c', '#fdf0ff', '#ffe66d', '#2ec4b6', '#8a5cf6'],
  earth: ['#c2410c', '#d97706', '#fef3c7', '#facc15', '#15803d', '#0e7490'],
};
const SCHEME_NAMES = { classic: 'Classic', pastel: 'Pastel', neon: 'Neon', candy: 'Candy', earth: 'Earth', custom: 'Custom' };
const BODIES = { Black: '#0d0d10', Graphite: '#3a3f4b', White: '#e9e9ee', Navy: '#12204a' };
const FACE_LABEL = ['Right', 'Left', 'Up', 'Down', 'Front', 'Back'];
const PATTERNS = [
  ['Checkerboard', 'R2 L2 U2 D2 F2 B2'],
  ['Cube in cube', "F L F U' R U F2 L2 U' L' B D' B' L2 U"],
  ['Pons asinorum', "F2 B2 U D' R2 L2 U D'"],
];
const SK = 'rubik-settings';
const bestKey = (n) => (n === 3 ? 'rubik-best' : 'rubik-best-' + n);
const DEF = { n: 3, scheme: 'classic', colors: PRESETS.classic.slice(), body: BODIES.Black, style: 'round', speed: 1, bg: 'dark', spin: false, muted: false, viewDrag: false };
function load() {
  try {
    const o = JSON.parse(localStorage.getItem(SK));
    if (o && typeof o === 'object') {
      const s = Object.assign({}, DEF, o);
      if (!Array.isArray(s.colors) || s.colors.length !== 6) s.colors = DEF.colors.slice();
      if (![2, 3, 4].includes(s.n)) s.n = 3;
      return s;
    }
  } catch (e) { /* ignore */ }
  return Object.assign({}, DEF, { colors: DEF.colors.slice() });
}
let S = load();
const save = () => { try { localStorage.setItem(SK, JSON.stringify(S)); } catch (e) { /* ignore */ } };
const readBest = (n) => { try { return parseFloat(localStorage.getItem(bestKey(n))) || 0; } catch (e) { return 0; } };
const fmt = (ms) => { const s = ms / 1000; return Math.floor(s / 60) + ':' + (s % 60).toFixed(2).padStart(5, '0'); };

// ---------------------------------------------------------------- audio
let AC = null;
function sfx(kind) {
  if (S.muted) return;
  try {
    AC = AC || new (window.AudioContext || window.webkitAudioContext)();
    const t = AC.currentTime, o = AC.createOscillator(), g = AC.createGain();
    o.connect(g); g.connect(AC.destination);
    if (kind === 'turn') { o.type = 'square'; o.frequency.setValueAtTime(220, t); o.frequency.exponentialRampToValueAtTime(90, t + 0.07); g.gain.setValueAtTime(0.035, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09); o.start(t); o.stop(t + 0.1); }
    else { [523, 659, 784, 1046].forEach((f, i) => { const o2 = AC.createOscillator(), g2 = AC.createGain(); o2.connect(g2); g2.connect(AC.destination); o2.type = 'triangle'; o2.frequency.value = f; g2.gain.setValueAtTime(0.0001, t + i * 0.1); g2.gain.exponentialRampToValueAtTime(0.1, t + i * 0.1 + 0.02); g2.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.1 + 0.35); o2.start(t + i * 0.1); o2.stop(t + i * 0.1 + 0.4); }); }
  } catch (e) { /* ignore */ }
}

// ---------------------------------------------------------------- cube model
let N = S.n, cubies = [];
let hist = [], queue = [], cur = null;
let scrambling = false, solving = false, ready = false, started = false, running = false, tStart = 0, moves = 0, elapsed = 0;

function build(n) {
  N = n; cubies = []; const o = (N - 1) / 2;
  for (let x = 0; x < N; x++) for (let y = 0; y < N; y++) for (let z = 0; z < N; z++) {
    const p = [x - o, y - o, z - o], f = {};
    NORMS.forEach((nn, i) => { if (Math.abs(p[0] * nn[0] + p[1] * nn[1] + p[2] * nn[2] - o) < 0.01) f[nn.join(',')] = i; });
    cubies.push({ p, f });
  }
}
// exact quarter turn about axis a (right-handed), d = +1 / -1
function rq(v, a, d) {
  const [x, y, z] = v;
  if (a === 0) return d > 0 ? [x, -z, y] : [x, z, -y];
  if (a === 1) return d > 0 ? [z, y, -x] : [-z, y, x];
  return d > 0 ? [-y, x, z] : [y, -x, z];
}
function turnNow(a, l, d) {
  for (const c of cubies) {
    if (Math.abs(c.p[a] - l) > 0.01) continue;
    c.p = rq(c.p, a, d);
    const nf = {};
    for (const k in c.f) nf[rq(k.split(',').map(Number), a, d).join(',')] = c.f[k];
    c.f = nf;
  }
}
function isSolved() {
  const seen = {};
  for (const c of cubies) for (const k in c.f) { if (seen[k] === undefined) seen[k] = c.f[k]; else if (seen[k] !== c.f[k]) return false; }
  return true;
}
const idle = () => !cur && !queue.length;

function pushHist(m) {
  const t = hist[hist.length - 1];
  if (t && t.a === m.a && Math.abs(t.l - m.l) < 0.01 && t.d === -m.d) hist.pop(); else hist.push({ a: m.a, l: m.l, d: m.d });
}
function startMove() {
  cur = queue.shift(); cur.t = 0;
  cur.dur = Math.max(55, (cur.fast ? 95 : 300) / S.speed);
  if (cur.rec) pushHist(cur);
  if (cur.user) {
    moves++;
    if (ready && !started) { started = true; running = true; tStart = performance.now(); }
    sfx('turn');
  } else if (!cur.fast) sfx('turn');
}
function finishMove() {
  const m = cur; turnNow(m.a, m.l, m.d); cur = null;
  if (running && !queue.length && isSolved()) win();
  if (!queue.length) {
    if (scrambling) { scrambling = false; ready = true; started = false; running = false; moves = 0; elapsed = 0; setHint('Go! The timer starts with your first move.'); }
    if (solving) { solving = false; hist = []; setHint('Solved by the computer — scramble to try yourself!'); }
  }
}
function layers() { const o = (N - 1) / 2, a = []; for (let i = 0; i < N; i++) a.push(i - o); return a; }

function resetCube(clearHint) {
  queue = []; cur = null; scrambling = false; solving = false; ready = false; started = false; running = false; moves = 0; elapsed = 0; hist = [];
  build(N); if (clearHint) setHint('Drag a sticker to turn a layer · drag the background to rotate the cube');
}
function scramble() {
  if (scrambling || solving) return;
  resetCube(false);
  scrambling = true; setHint('Scrambling…');
  const len = N === 2 ? 12 : N === 3 ? 22 : 38, L = layers(); let pa = -1, pl = null;
  for (let i = 0; i < len; i++) {
    let a, l;
    do {
      a = (Math.random() * 3) | 0;
      l = N === 4 ? L[(Math.random() * N) | 0] : (Math.random() < 0.5 ? L[0] : L[N - 1]);
    } while (a === pa && l === pl);
    pa = a; pl = l;
    queue.push({ a, l, d: Math.random() < 0.5 ? 1 : -1, rec: true, user: false, fast: true });
  }
}
function undo() {
  if (!idle() || !hist.length) return;
  const m = hist.pop();
  queue.push({ a: m.a, l: m.l, d: -m.d, rec: false, user: false });
}
function solve() {
  if (!idle() || !hist.length) return;
  solving = true; running = false; ready = false; started = false;
  for (let i = hist.length - 1; i >= 0; i--) queue.push({ a: hist[i].a, l: hist[i].l, d: -hist[i].d, rec: false, user: false, fast: true });
  hist = []; setHint('Solving…');
}
// notation
const FACE = { R: [0, 1, -1], L: [0, -1, 1], U: [1, 1, -1], D: [1, -1, 1], F: [2, 1, -1], B: [2, -1, 1] };
function notate(str, opt) {
  opt = opt || {};
  for (const tk of str.trim().split(/\s+/)) {
    const m = /^([UDLRFBMES])(2|')?$/i.exec(tk); if (!m) continue;
    let ch = m[1], prime = m[2] === "'", dbl = m[2] === '2';
    if (ch === ch.toLowerCase() && !opt.keyboard) ch = ch.toUpperCase();
    const o = (N - 1) / 2; let a, l, d;
    if (FACE[ch]) { const f = FACE[ch]; a = f[0]; l = f[1] * o; d = f[2]; }
    else { if (N % 2 === 0) continue; a = ch === 'M' ? 0 : ch === 'E' ? 1 : 2; l = 0; d = ch === 'M' ? 1 : ch === 'E' ? 1 : -1; }
    if (prime) d = -d;
    for (let i = 0; i < (dbl ? 2 : 1); i++) queue.push({ a, l, d, rec: true, user: !!opt.user, fast: !!opt.fast });
  }
}
function applyPattern(s) {
  if (N !== 3) setSize(3);
  resetCube(false); notate(s, { fast: true }); setHint('Pattern ready — Solve / Undo to go back, or Scramble to play.');
}

// ---------------------------------------------------------------- view + render
let yaw = -0.62, pitch = 0.5, zoom = 1, W = 0, H = 0, DPR = 1, k0 = 1, DIST = 10;
function rotA(v, a, ang) {
  const c = Math.cos(ang), s = Math.sin(ang), x = v[0], y = v[1], z = v[2];
  if (a === 0) return [x, y * c - z * s, y * s + z * c];
  if (a === 1) return [x * c + z * s, y, -x * s + z * c];
  return [x * c - y * s, x * s + y * c, z];
}
const viewV = (v) => rotA(rotA(v, 1, yaw), 0, pitch);
function projV(w) { const k = (k0 * DIST) / (DIST - w[2]); return [W / 2 + w[0] * k, H / 2 - w[1] * k]; }
const proj = (v) => projV(viewV(v));

function resize() {
  const r = cv.getBoundingClientRect(); DPR = Math.min(2, window.devicePixelRatio || 1);
  W = r.width; H = r.height; cv.width = Math.max(1, Math.round(W * DPR)); cv.height = Math.max(1, Math.round(H * DPR));
}
const rgbCache = {};
function rgb(h) { return rgbCache[h] || (rgbCache[h] = [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]); }
function shade(h, f) { const c = rgb(h); return `rgb(${Math.min(255, c[0] * f) | 0},${Math.min(255, c[1] * f) | 0},${Math.min(255, c[2] * f) | 0})`; }
const LIGHT = (() => { const l = [-0.35, 0.7, 0.62], m = Math.hypot(...l); return l.map((v) => v / m); })();

let faces = [];
function draw() {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0); ctx.clearRect(0, 0, W, H);
  k0 = (Math.min(W, H) * 0.36 / N) * zoom; DIST = N * 2.4 + 5;
  const list = [], ang = cur ? cur.d * (Math.PI / 2) * ease(Math.min(1, cur.t / cur.dur)) : 0;
  const cam = [0, 0, DIST];
  for (const c of cubies) {
    const inL = cur && Math.abs(c.p[cur.a] - cur.l) < 0.01;
    for (let ni = 0; ni < 6; ni++) {
      const n = NORMS[ni], ai = ni >> 1, key = n.join(','), col = c.f[key];
      const cc = [c.p[0] + n[0] * 0.5, c.p[1] + n[1] * 0.5, c.p[2] + n[2] * 0.5];
      const aj = (ai + 1) % 3, ak = (ai + 2) % 3, pts = [];
      for (const [su, sv] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { const p = cc.slice(); p[aj] += su * 0.5; p[ak] += sv * 0.5; pts.push(p); }
      let nn = n, cw = cc, pp = pts;
      if (inL) { nn = rotA(n, cur.a, ang); cw = rotA(cc, cur.a, ang); pp = pts.map((p) => rotA(p, cur.a, ang)); }
      const nv = rotA(rotA(nn, 1, yaw), 0, pitch), cvv = viewV(cw);
      const dot = nv[0] * (cam[0] - cvv[0]) + nv[1] * (cam[1] - cvv[1]) + nv[2] * (cam[2] - cvv[2]);
      if (dot <= 0) continue;
      list.push({ c, key, col, n, nv, depth: (cam[0] - cvv[0]) ** 2 + (cam[1] - cvv[1]) ** 2 + (cam[2] - cvv[2]) ** 2, pts: pp.map((p) => projV(viewV(p))) });
    }
  }
  list.sort((a, b) => b.depth - a.depth);
  faces = list;
  const body = S.body, st = S.style;
  for (const f of list) {
    const P = f.pts;
    ctx.lineJoin = 'round';
    if (f.col === undefined) { ctx.fillStyle = ctx.strokeStyle = shade(body, 0.6 + 0.4 * Math.max(0, f.nv[0] * LIGHT[0] + f.nv[1] * LIGHT[1] + f.nv[2] * LIGHT[2])); path(P, 1); ctx.lineWidth = 1; ctx.fill(); ctx.stroke(); continue; }
    const lum = 0.62 + 0.45 * Math.max(0, f.nv[0] * LIGHT[0] + f.nv[1] * LIGHT[1] + f.nv[2] * LIGHT[2]);
    const bodyCol = shade(body, 0.7 + 0.3 * lum);
    ctx.fillStyle = ctx.strokeStyle = bodyCol; path(P, 1); ctx.lineWidth = 1.2; ctx.fill(); ctx.stroke();
    const color = shade(S.colors[f.col], lum);
    if (st === 'flat') { ctx.fillStyle = color; path(P, 0.88); ctx.fill(); }
    else if (st === 'tiles') { ctx.fillStyle = color; ctx.strokeStyle = bodyCol; path(P, 0.96); ctx.lineWidth = Math.max(1, k0 * 0.07); ctx.fill(); ctx.stroke(); }
    else { ctx.fillStyle = ctx.strokeStyle = color; path(P, 0.74); ctx.lineWidth = k0 * 0.15; ctx.fill(); ctx.stroke(); }
    if (f.col !== undefined && st !== 'tiles') { // soft gloss
      const m = center(P); ctx.fillStyle = 'rgba(255,255,255,0.10)'; ctx.beginPath(); ctx.ellipse(m[0] - k0 * 0.12, m[1] - k0 * 0.16, k0 * 0.2, k0 * 0.1, -0.5, 0, 6.3); ctx.fill();
    }
  }
}
function center(P) { return [(P[0][0] + P[1][0] + P[2][0] + P[3][0]) / 4, (P[0][1] + P[1][1] + P[2][1] + P[3][1]) / 4]; }
function path(P, s) { const m = center(P); ctx.beginPath(); P.forEach((p, i) => { const x = m[0] + (p[0] - m[0]) * s, y = m[1] + (p[1] - m[1]) * s; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.closePath(); }
const ease = (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);

// ---------------------------------------------------------------- loop / hud
let last = 0, dragging = false, lastTime = '', lastMoves = -1;
function frame(now) {
  const dt = Math.min(50, now - (last || now)); last = now;
  if (!cur && queue.length) startMove();
  if (cur) { cur.t += dt; if (cur.t >= cur.dur) { finishMove(); if (!cur && queue.length) startMove(); } }
  if (S.spin && !dragging && !panelOpen()) yaw += dt * 0.0004;
  if (running) elapsed = performance.now() - tStart;
  const ts = fmt(elapsed); if (ts !== lastTime) { lastTime = ts; $('time').textContent = ts; }
  if (moves !== lastMoves) { lastMoves = moves; $('moves').textContent = moves; }
  draw(); requestAnimationFrame(frame);
}
function setHint(t) { const h = $('hint'); h.textContent = t; h.classList.remove('off'); clearTimeout(setHint.t); setHint.t = setTimeout(() => h.classList.add('off'), 6000); }
function showBest() { const b = readBest(N); $('best').textContent = b ? fmt(b) : '—'; }

// ---------------------------------------------------------------- win
function win() {
  running = false; ready = false; started = false;
  elapsed = performance.now() - tStart; const t = elapsed, prev = readBest(N), nb = !prev || t < prev;
  if (nb) { try { localStorage.setItem(bestKey(N), String(Math.round(t))); } catch (e) { /* ignore */ } }
  showBest(); sfx('win'); confetti();
  $('rTitle').textContent = nb ? 'New record!' : 'Solved!';
  $('rSub').textContent = `${N}×${N} in ${fmt(t)} · ${moves} moves` + (!nb && prev ? ` · best ${fmt(prev)}` : '');
  setTimeout(() => $('result').classList.remove('hidden'), 700);
}
const cf = $('confetti'), cx = cf.getContext('2d'); let parts = [], cfOn = false;
function confetti() {
  cf.width = innerWidth; cf.height = innerHeight;
  for (let i = 0; i < 150; i++) parts.push({ x: innerWidth / 2 + (Math.random() - 0.5) * 200, y: innerHeight * 0.45, vx: (Math.random() - 0.5) * 14, vy: -Math.random() * 14 - 3, c: S.colors[(Math.random() * 6) | 0], r: Math.random() * 6.3, s: 5 + Math.random() * 6 });
  if (!cfOn) { cfOn = true; requestAnimationFrame(cfLoop); }
}
function cfLoop() {
  cx.clearRect(0, 0, cf.width, cf.height);
  parts.forEach((p) => { p.x += p.vx; p.y += p.vy; p.vy += 0.35; p.vx *= 0.99; p.r += 0.15; cx.save(); cx.translate(p.x, p.y); cx.rotate(p.r); cx.fillStyle = p.c; cx.fillRect(-p.s / 2, -p.s / 3, p.s, p.s * 0.6); cx.restore(); });
  parts = parts.filter((p) => p.y < cf.height + 20);
  if (parts.length) requestAnimationFrame(cfLoop); else { cfOn = false; cx.clearRect(0, 0, cf.width, cf.height); }
}

// ---------------------------------------------------------------- input
const ptrs = new Map(); let drag = null, pinch0 = 0, zoom0 = 1;
function inPoly(P, x, y) { let ins = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { if ((P[i][1] > y) !== (P[j][1] > y) && x < ((P[j][0] - P[i][0]) * (y - P[i][1])) / (P[j][1] - P[i][1]) + P[i][0]) ins = !ins; } return ins; }
function pick(x, y) { for (let i = faces.length - 1; i >= 0; i--) { const f = faces[i]; if (f.col !== undefined && inPoly(f.pts, x, y)) return f; } return null; }
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
function turnFromDrag(hit, dx, dy) {
  const n = hit.n, ai = n.findIndex((v) => v !== 0), c = [hit.c.p[0] + n[0] * 0.5, hit.c.p[1] + n[1] * 0.5, hit.c.p[2] + n[2] * 0.5], sc = proj(c);
  let best = null;
  for (let aj = 0; aj < 3; aj++) {
    if (aj === ai) continue;
    const e = [c[0], c[1], c[2]]; e[aj] += 1; const sp = proj(e), vx = sp[0] - sc[0], vy = sp[1] - sc[1], L = Math.hypot(vx, vy) || 1, dot = (dx * vx + dy * vy) / L;
    if (!best || Math.abs(dot) > Math.abs(best.dot)) best = { aj, dot };
  }
  const a = [0, 0, 0]; a[best.aj] = best.dot >= 0 ? 1 : -1;
  const w = cross(n, a), wi = w.findIndex((v) => v !== 0);
  queue.push({ a: wi, l: hit.c.p[wi], d: w[wi], rec: true, user: true });
}
function pos(e) { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
cv.addEventListener('pointerdown', (e) => {
  cv.setPointerCapture(e.pointerId); const [x, y] = pos(e); ptrs.set(e.pointerId, [x, y]);
  if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch0 = Math.hypot(a[0] - b[0], a[1] - b[1]); zoom0 = zoom; drag = null; return; }
  dragging = true;
  const hit = idle() && !scrambling && !solving && !(S.viewDrag !== e.shiftKey) ? pick(x, y) : null;
  drag = { x0: x, y0: y, lx: x, ly: y, hit, mode: hit ? 'pending' : 'view' };
});
cv.addEventListener('pointermove', (e) => {
  if (!ptrs.has(e.pointerId)) return; const [x, y] = pos(e); ptrs.set(e.pointerId, [x, y]);
  if (ptrs.size === 2) { const [a, b] = [...ptrs.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]); if (pinch0) zoom = Math.max(0.5, Math.min(1.8, (zoom0 * d) / pinch0)); return; }
  if (!drag) return;
  if (drag.mode === 'pending') { if (Math.hypot(x - drag.x0, y - drag.y0) > 14) { turnFromDrag(drag.hit, x - drag.x0, y - drag.y0); drag.mode = 'done'; } }
  else if (drag.mode === 'view') { yaw += (x - drag.lx) * 0.01; pitch = Math.max(-1.5, Math.min(1.5, pitch + (y - drag.ly) * 0.01)); drag.lx = x; drag.ly = y; }
});
const up = (e) => { ptrs.delete(e.pointerId); if (!ptrs.size) { dragging = false; drag = null; pinch0 = 0; } };
cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
cv.addEventListener('wheel', (e) => { e.preventDefault(); zoom = Math.max(0.5, Math.min(1.8, zoom * (e.deltaY > 0 ? 0.92 : 1.08))); }, { passive: false });
addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const k = e.key;
  if (k === 'Escape') { closePanel(); $('result').classList.add('hidden'); return; }
  if (panelOpen() || !$('result').classList.contains('hidden')) return;
  if (k === 'ArrowLeft') yaw -= 0.15; else if (k === 'ArrowRight') yaw += 0.15; else if (k === 'ArrowUp') pitch = Math.max(-1.5, pitch - 0.15); else if (k === 'ArrowDown') pitch = Math.min(1.5, pitch + 0.15);
  else if (k === 'Enter') { e.preventDefault(); scramble(); }
  else if (k === 'Backspace') { e.preventDefault(); undo(); }
  else if (/^[udlrfbmesUDLRFBMES]$/.test(k) && !scrambling && !solving) notate((k.toUpperCase()) + (k === k.toLowerCase() ? '' : "'"), { user: true, keyboard: true });
});

// ---------------------------------------------------------------- UI
const panelOpen = () => !$('panel').classList.contains('hidden');
function closePanel() { $('panel').classList.add('hidden'); }
function setSize(n) { S.n = n; N = n; save(); resetCube(true); syncUI(); showBest(); }
function applyBg() { document.documentElement.dataset.bg = S.bg; }
function syncUI() {
  document.querySelectorAll('#sizes button').forEach((b) => b.classList.toggle('on', +b.dataset.n === S.n));
  document.querySelectorAll('#schemes button').forEach((b) => b.classList.toggle('on', b.dataset.v === S.scheme));
  document.querySelectorAll('#styles button').forEach((b) => b.classList.toggle('on', b.dataset.v === S.style));
  document.querySelectorAll('#bgs button').forEach((b) => b.classList.toggle('on', b.dataset.v === S.bg));
  document.querySelectorAll('#bodies button').forEach((b) => b.classList.toggle('on', b.dataset.v === S.body));
  document.querySelectorAll('#picks input').forEach((i, idx) => { i.value = S.colors[idx]; });
  $('speed').value = S.speed; $('spdVal').textContent = S.speed + '×'; $('spin').checked = S.spin; $('viewDrag').checked = S.viewDrag; $('sound').checked = !S.muted;
  applyBg();
}
(function initUI() {
  const sch = $('schemes'); Object.keys(SCHEME_NAMES).forEach((k) => { const b = document.createElement('button'); b.dataset.v = k; b.textContent = SCHEME_NAMES[k]; sch.appendChild(b); });
  sch.addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; S.scheme = b.dataset.v; if (PRESETS[S.scheme]) S.colors = PRESETS[S.scheme].slice(); save(); syncUI(); });
  const pk = $('picks'); FACE_LABEL.forEach((l, i) => { const lab = document.createElement('label'), inp = document.createElement('input'); inp.type = 'color'; lab.append(inp, l); inp.addEventListener('input', () => { S.colors[i] = inp.value; S.scheme = 'custom'; save(); syncUI(); }); pk.appendChild(lab); });
  const bd = $('bodies'); Object.keys(BODIES).forEach((k) => { const b = document.createElement('button'); b.dataset.v = BODIES[k]; b.textContent = k; bd.appendChild(b); });
  bd.addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; S.body = b.dataset.v; save(); syncUI(); });
  $('styles').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; S.style = b.dataset.v; save(); syncUI(); });
  $('bgs').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; S.bg = b.dataset.v; save(); syncUI(); });
  $('sizes').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b && +b.dataset.n !== S.n) setSize(+b.dataset.n); });
  const pt = $('patterns'); PATTERNS.forEach(([name, s]) => { const b = document.createElement('button'); b.textContent = name; b.addEventListener('click', () => { closePanel(); applyPattern(s); }); pt.appendChild(b); });
  $('speed').addEventListener('input', (e) => { S.speed = +e.target.value; save(); syncUI(); });
  $('spin').addEventListener('change', (e) => { S.spin = e.target.checked; save(); });
  $('viewDrag').addEventListener('change', (e) => { S.viewDrag = e.target.checked; save(); });
  $('sound').addEventListener('change', (e) => { S.muted = !e.target.checked; save(); });
  $('defBtn').addEventListener('click', () => { const n = S.n; S = Object.assign({}, DEF, { colors: DEF.colors.slice(), n }); save(); syncUI(); });
  $('setBtn').addEventListener('click', () => $('panel').classList.remove('hidden'));
  $('closePanel').addEventListener('click', closePanel);
  $('panel').addEventListener('pointerdown', (e) => { if (e.target === $('panel')) closePanel(); });
  $('scrBtn').addEventListener('click', scramble); $('undoBtn').addEventListener('click', undo); $('solveBtn').addEventListener('click', solve);
  $('resetBtn').addEventListener('click', () => { resetCube(true); });
  $('againBtn').addEventListener('click', () => { $('result').classList.add('hidden'); scramble(); });
  $('closeRes').addEventListener('click', () => $('result').classList.add('hidden'));
})();

new ResizeObserver(resize).observe(cv); addEventListener('resize', resize);
build(N); syncUI(); showBest(); resize(); requestAnimationFrame(frame);
if (location.search.includes('debug')) {
  window.__rc = { get N() { return N; }, get cubies() { return cubies; }, get hist() { return hist; }, get S() { return S; }, get faces() { return faces; }, get ready() { return ready; }, get running() { return running; }, get moves() { return moves; }, isSolved, scramble, notate, idle, undo, solve, resetCube, proj, setSize, applyPattern, win, setView(y, p) { yaw = y; pitch = p; } };
}
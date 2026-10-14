'use strict';
const $ = (id) => document.getElementById(id);
const cv = $('cv'), ctx = cv.getContext('2d');
const SK = 'buddy-settings', BK = 'buddy-best';

// ------------------------------------------------------------ settings
const EMOJIS = ['😎', '😡', '🤡', '👽', '🤖', '💀', '🐵', '🐷', '🐸', '🎃', '👻', '🦄', '🤓', '😱', '🥸', '🧟'];
const ROOMS = { room: '🏠 Room', padded: '🧸 Padded', gym: '🥊 Gym', space: '🚀 Space', beach: '🏖 Beach', city: '🌃 City' };
const DEF = { name: 'Buddy', head: { type: 'face', emoji: '😎', img: null }, skin: '#f2c18d', shirt: '#3b82f6', pants: '#374151', size: 1, headSize: 1, room: 'room', grav: 1, hang: false, muted: false };
function loadS() {
  try { const o = JSON.parse(localStorage.getItem(SK)); if (o && typeof o === 'object') return Object.assign({}, DEF, o, { head: Object.assign({}, DEF.head, o.head || {}) }); } catch (e) { /* ignore */ }
  return JSON.parse(JSON.stringify(DEF));
}
let S = loadS();
const saveS = () => { try { localStorage.setItem(SK, JSON.stringify(S)); } catch (e) { /* ignore */ } };
let bestHit = 0; try { bestHit = parseInt(localStorage.getItem(BK)) || 0; } catch (e) { /* ignore */ }
let headImg = null;
function loadHeadImg() { headImg = null; if (S.head.type === 'photo' && S.head.img) { const i = new Image(); i.onload = () => { headImg = i; drawFacePv(); }; i.src = S.head.img; } }

// ------------------------------------------------------------ audio
let AC = null;
function actx() { try { AC = AC || new (window.AudioContext || window.webkitAudioContext)(); return AC; } catch (e) { return null; } }
function tone(type, f0, f1, dur, vol) {
  if (S.muted) return; const a = actx(); if (!a) return; const t = a.currentTime, o = a.createOscillator(), g = a.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + dur + 0.02);
}
function noise(dur, freq, kind, vol) {
  if (S.muted) return; const a = actx(); if (!a) return; const n = Math.floor(a.sampleRate * dur), b = a.createBuffer(1, n, a.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const s = a.createBufferSource(); s.buffer = b; const f = a.createBiquadFilter(); f.type = kind; f.frequency.value = freq; const g = a.createGain(); g.gain.value = vol;
  s.connect(f); f.connect(g); g.connect(a.destination); s.start();
}
const SND = {
  thump: (v) => { tone('sine', 140, 50, 0.14, 0.5 * v); noise(0.08, 400, 'lowpass', 0.4 * v); },
  bonk: (v) => { tone('triangle', 420, 120, 0.12, 0.5 * v); noise(0.04, 1800, 'bandpass', 0.3 * v); },
  bong: (v) => { tone('triangle', 520, 480, 0.4, 0.4 * v); tone('sine', 1040, 900, 0.3, 0.15 * v); },
  smash: (v) => { tone('sine', 110, 40, 0.25, 0.6 * v); noise(0.2, 900, 'lowpass', 0.5 * v); },
  bang: () => { noise(0.18, 3000, 'highpass', 0.5); tone('square', 200, 40, 0.1, 0.25); },
  boom: () => { noise(0.8, 300, 'lowpass', 1); tone('sine', 90, 30, 0.6, 0.7); },
  zap: () => { tone('sawtooth', 700 + Math.random() * 500, 200, 0.06, 0.12); },
  splat: () => { noise(0.14, 700, 'bandpass', 0.5); },
  boing: (v) => { tone('sine', 180, 420, 0.18, 0.3 * v); },
  ko: () => { tone('triangle', 500, 100, 0.7, 0.4); },
  whoosh: () => { noise(0.12, 1200, 'bandpass', 0.15); },
};
const sfx = (n, v) => { try { SND[n](v == null ? 1 : Math.min(1.4, v)); } catch (e) { /* ignore */ } };

// ------------------------------------------------------------ world
let W = 0, H = 0, DPR = 1, FLOOR = 0, SC = 1, bg = null, dec = null, dctx = null;
const DT = 1 / 480, SUB = 8;
const G0 = 2000; // px/s^2 at scale 1
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const sc = () => clamp(H / 430, 0.55, 1.6);
const s = () => sc() * S.size;
const hr = () => 26 * S.headSize * s();

let P = {}, cons = [], CAPS = [], hook = null, ropeLen = 60;
const NAMES = ['H', 'SL', 'SR', 'HL', 'HR', 'EL', 'ER', 'WL', 'WR', 'KL', 'KR', 'FL', 'FR'];
let health = 100, ko = false, koT = 0, standing = true, standT = 0, hurt = 0, total = 0, combo = 0, comboT = 0, lastImpact = 0, slow = false, shake = 0, grab = null;

function mk(x, y, r, m) { return { x, y, ox: x, oy: y, r, m: m || 1, ix: 0, iy: 0 }; }
function buildBuddy() {
  const u = s(), R = hr(), cx = W / 2, fy = FLOOR;
  const footY = fy - 8 * u, kneeY = footY - 38 * u, hipY = kneeY - 38 * u, shY = hipY - 58 * u, headY = shY - 8 * u - R;
  P = {
    H: mk(cx, headY, R, 1.4), SL: mk(cx - 17 * u, shY, 11 * u, 1.3), SR: mk(cx + 17 * u, shY, 11 * u, 1.3), HL: mk(cx - 11 * u, hipY, 11 * u, 1.5), HR: mk(cx + 11 * u, hipY, 11 * u, 1.5),
    EL: mk(cx - 24 * u, shY + 28 * u, 7 * u), ER: mk(cx + 24 * u, shY + 28 * u, 7 * u), WL: mk(cx - 26 * u, shY + 56 * u, 7 * u), WR: mk(cx + 26 * u, shY + 56 * u, 7 * u),
    KL: mk(cx - 11 * u, kneeY, 8 * u), KR: mk(cx + 11 * u, kneeY, 8 * u), FL: mk(cx - 12 * u, footY, 8 * u), FR: mk(cx + 12 * u, footY, 8 * u),
  };
  const pairs = [['SL', 'SR'], ['HL', 'HR'], ['SL', 'HL'], ['SR', 'HR'], ['SL', 'HR'], ['SR', 'HL'], ['H', 'SL'], ['H', 'SR'], ['SL', 'EL'], ['EL', 'WL'], ['SR', 'ER'], ['ER', 'WR'], ['HL', 'KL'], ['KL', 'FL'], ['HR', 'KR'], ['KR', 'FR']];
  cons = pairs.map(([a, b]) => ({ a: P[a], b: P[b], len: Math.hypot(P[a].x - P[b].x, P[a].y - P[b].y) }));
  // soft limb-spacing constraints keep the pose human
  [['SL', 'KL'], ['SR', 'KR'], ['HL', 'FL'], ['HR', 'FR']].forEach(([a, b]) => { const l = Math.hypot(P[a].x - P[b].x, P[a].y - P[b].y); cons.push({ a: P[a], b: P[b], len: l, min: true, soft: 0.1 }); });
  CAPS = [[P.SL, P.SR, 12], [P.HL, P.HR, 12], [P.SL, P.HL, 12], [P.SR, P.HR, 12], [P.SL, P.HR, 12], [P.SR, P.HL, 12], [P.SL, P.EL, 8], [P.EL, P.WL, 7], [P.SR, P.ER, 8], [P.ER, P.WR, 7], [P.HL, P.KL, 9], [P.KL, P.FL, 8], [P.HR, P.KR, 9], [P.KR, P.FR, 8], [P.H, P.H, 26 * S.headSize]].map(([a, b, r], i) => ({ a, b, r: i === 14 ? R : r * u }));
  health = 100; ko = false; koT = 0; standing = !S.hang; hurt = 0; grab = null;
  if (S.hang) { hook = { x: cx, y: 12 }; ropeLen = Math.max(40, FLOOR - 12 - (shY - headY) - (fy - shY) - 40 * u); }
  else hook = null;
  setHP();
}
function resetPose() { buildBuddy(); }

// ------------------------------------------------------------ geometry helpers
function closest(c, x, y) {
  const ax = c.a.x, ay = c.a.y, bx = c.b.x, by = c.b.y, dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
  const t = l2 < 1e-6 ? 0 : clamp(((x - ax) * dx + (y - ay) * dy) / l2, 0, 1);
  return { t, x: ax + dx * t, y: ay + dy * t };
}
const applyV = (p, vx, vy) => { p.ox -= vx * DT; p.oy -= vy * DT; };
const vel = (p) => [(p.x - p.ox) / DT, (p.y - p.oy) / DT];
const center = () => ({ x: (P.HL.x + P.HR.x + P.SL.x + P.SR.x) / 4, y: (P.HL.y + P.HR.y + P.SL.y + P.SR.y) / 4 });

// ------------------------------------------------------------ effects
let parts = [], bullets = [], projs = [], zapT = 0;
function addP(o) { parts.push(Object.assign({ x: 0, y: 0, vx: 0, vy: 0, t: 0, life: 0.6, g: 800, size: 6, col: '#fff', kind: 'dot', rot: 0 }, o)); }
function burst(x, y, n, col, sp, size, life) { for (let i = 0; i < n; i++) { const a = Math.random() * 6.3, v = sp * (0.3 + Math.random()); addP({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - sp * 0.2, col, size: size * (0.5 + Math.random()), life: (life || 0.6) * (0.6 + Math.random() * 0.6) }); } }
function stars(x, y, n) { for (let i = 0; i < n; i++) { const a = Math.random() * 6.3, v = 200 + Math.random() * 300; addP({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, kind: 'star', size: 8 + Math.random() * 8, col: ['#fde047', '#fff', '#fb923c'][i % 3], life: 0.5 + Math.random() * 0.3, g: 300, rot: Math.random() * 6 }); } }
function floatText(x, y, txt, col, size, tilt) { x = clamp(x, 70, Math.max(80, W - 70)); y = clamp(y, 70, H); addP({ x, y, vy: -90, g: 0, kind: 'text', txt, col, size, life: 0.9, rot: tilt == null ? (Math.random() - 0.5) * 0.5 : tilt }); }
function dec2(fn) { if (dctx) { dctx.save(); fn(dctx); dctx.restore(); } }
function splat(x, y, col, r) { dec2((c) => { c.fillStyle = col; c.globalAlpha = 0.85; c.beginPath(); c.arc(x, y, r, 0, 6.3); c.fill(); for (let i = 0; i < 9; i++) { const a = Math.random() * 6.3, d = r * (1 + Math.random() * 1.6); c.beginPath(); c.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, r * (0.15 + Math.random() * 0.3), 0, 6.3); c.fill(); } }); }
function hole(x, y) { dec2((c) => { c.fillStyle = 'rgba(0,0,0,0.75)'; c.beginPath(); c.arc(x, y, 3.5 * sc(), 0, 6.3); c.fill(); c.strokeStyle = 'rgba(0,0,0,0.3)'; c.lineWidth = 1.5; for (let i = 0; i < 5; i++) { const a = Math.random() * 6.3; c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(a) * 10 * sc(), y + Math.sin(a) * 10 * sc()); c.stroke(); } }); }
function scorch(x, y, r) { dec2((c) => { const g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, 'rgba(0,0,0,0.45)'); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, 6.3); c.fill(); }); }

// ------------------------------------------------------------ damage
const WORDS_KO = ['KO!', 'K.O.!!', 'NIGHT NIGHT!'];
function setHP() {
  const f = $('hpfill'); f.style.width = Math.max(0, health) + '%'; f.style.background = health > 50 ? 'linear-gradient(90deg,#22c55e,#a3e635)' : health > 25 ? 'linear-gradient(90deg,#f59e0b,#fde047)' : 'linear-gradient(90deg,#dc2626,#f97316)';
}
function damage(amount, x, y, word, snd, vol) {
  amount = Math.round(amount); if (amount < 1) return;
  if (ko) amount = Math.max(1, Math.round(amount * 0.3));
  total += amount; $('score').textContent = total;
  if (amount > bestHit) { bestHit = amount; try { localStorage.setItem(BK, String(bestHit)); } catch (e) { /* ignore */ } floatText(x, y - 50 * sc(), 'NEW BEST HIT!', '#a3e635', 20 * sc(), 0); }
  combo++; comboT = 1.6; $('combo').textContent = combo > 2 ? `COMBO ×${combo}` : '';
  hurt = 0.7; shake = Math.min(14, shake + amount * 0.15);
  if (word) floatText(x, y - 18 * sc(), word, '#fde047', clamp(20 + amount * 0.4, 24, 46) * sc());
  floatText(x + 22 * sc(), y + 6, '-' + amount, '#fff', 17 * sc(), 0.1);
  stars(x, y, Math.min(8, 2 + (amount / 8) | 0));
  if (snd) sfx(snd, clamp(amount / 22, 0.4, 1.4));
  if (!ko) { health = Math.max(0, health - amount); setHP(); if (health <= 0) doKO(); }
}
function doKO() { ko = true; koT = 0; standing = false; sfx('ko'); const c = center(); floatText(c.x, c.y - 90 * sc(), WORDS_KO[(Math.random() * 3) | 0], '#f87171', 54 * sc(), 0); }
function revive() { health = 100; ko = false; koT = 0; setHP(); }
function standUp() { revive(); const hang = S.hang; buildBuddy(); S.hang = hang; }

// ------------------------------------------------------------ tools
const TOOLS = [
  { id: 'grab', ico: '✋', name: 'Grab', kind: 'grab' },
  { id: 'fist', ico: '👊', name: 'Fist', kind: 'melee', pow: 900, r: 34, dmg: 1, word: 'POW!', snd: 'thump' },
  { id: 'bat', ico: '🏏', name: 'Bat', kind: 'melee', pow: 1500, r: 52, dmg: 1.1, word: 'BONK!', snd: 'bonk' },
  { id: 'hammer', ico: '🔨', name: 'Hammer', kind: 'melee', pow: 1700, r: 46, dmg: 1.3, word: 'SMASH!', snd: 'smash' },
  { id: 'pan', ico: '🍳', name: 'Pan', kind: 'melee', pow: 1200, r: 44, dmg: 1, word: 'BONG!', snd: 'bong' },
  { id: 'glove', ico: '🥊', name: 'Glove', kind: 'melee', pow: 1300, r: 40, dmg: 1, word: 'WHAM!', snd: 'thump' },
  { id: 'brick', ico: '🧱', name: 'Brick', kind: 'throw', r: 15, m: 2, dm: 1, word: 'THUD!', snd: 'thump' },
  { id: 'bowl', ico: '🎳', name: 'Bowling', kind: 'throw', r: 22, m: 4, dm: 1.2, word: 'STRIKE!', snd: 'smash' },
  { id: 'tomato', ico: '🍅', name: 'Tomato', kind: 'throw', r: 14, m: 0.6, dm: 0.5, word: 'SPLAT!', snd: 'splat', splat: true },
  { id: 'anvil', ico: '⚓', name: 'Anvil', kind: 'drop', r: 28, m: 12, dm: 2.4, word: 'CRUNCH!', snd: 'smash' },
  { id: 'gun', ico: '🔫', name: 'Gun', kind: 'gun', pow: 650, dmg: 1 },
  { id: 'bomb', ico: '💣', name: 'Bomb', kind: 'throw', r: 14, m: 2, bomb: true },
  { id: 'rocket', ico: '🚀', name: 'Rocket', kind: 'rocket' },
  { id: 'zap', ico: '⚡', name: 'Taser', kind: 'zap' },
];
let tool = TOOLS[1];
function selectTool(id) { tool = TOOLS.find((t) => t.id === id) || tool; document.querySelectorAll('.tool').forEach((b) => b.classList.toggle('on', b.dataset.id === tool.id)); }

function melee(t, x, y, dx, dy, mult) {
  const u = s(), R = t.r * u; let best = 0, hp = null;
  const touched = new Set();
  for (const c of CAPS) {
    const q = closest(c, x, y), d = Math.hypot(x - q.x, y - q.y) - c.r;
    if (d < R) {
      const w = (0.4 + 0.6 * (1 - Math.max(0, d) / R)) * t.pow * sc() * mult;
      for (const [p, k] of [[c.a, 1 - q.t], [c.b, q.t]]) { if (k <= 0) continue; p.ix += dx * w * k; p.iy += dy * w * k; touched.add(p); }
      if (w > best) { best = w; hp = q; }
    }
  }
  if (!hp) return false;
  const cap = t.pow * sc() * 1.15 * mult;
  touched.forEach((p) => { const m = Math.hypot(p.ix, p.iy); if (m > cap) { p.ix *= cap / m; p.iy *= cap / m; } applyV(p, p.ix / p.m, p.iy / p.m); p.ix = p.iy = 0; });
  damage((best * t.dmg) / 60, hp.x, hp.y, t.word, t.snd);
  return true;
}
function dirFromClick(x) { const c = center(); const sx = Math.sign(c.x - x) || (Math.random() < 0.5 ? -1 : 1); const v = Math.hypot(ptr.vx, ptr.vy); if (v > 350) return [ptr.vx / v, ptr.vy / v]; return [sx * 0.96, -0.28]; }

function nearestCap(x, y, maxD) {
  let best = null;
  for (const c of CAPS) { const q = closest(c, x, y), d = Math.hypot(x - q.x, y - q.y) - c.r; if (d < maxD && (!best || d < best.d)) best = { c, q, d }; }
  return best;
}
function shoot(x, y) {
  const fromLeft = x < W / 2, sx = fromLeft ? -10 : W + 10, sy = FLOOR - 30 * sc();
  bullets.push({ x1: sx, y1: sy, x2: x, y2: y, t: 0 });
  sfx('bang'); shake = Math.min(14, shake + 2);
  const hit = nearestCap(x, y, 6 * sc());
  if (hit) {
    const dx = fromLeft ? 1 : -1, w = tool.pow * sc();
    applyV(hit.c.a, dx * w * (1 - hit.q.t) / hit.c.a.m, -w * 0.12); if (hit.c.b !== hit.c.a) applyV(hit.c.b, dx * w * hit.q.t / hit.c.b.m, -w * 0.12);
    damage(8 + Math.random() * 6, hit.q.x, hit.q.y, 'BANG!', null);
  } else if (y < FLOOR) { hole(x, y); burst(x, y, 5, '#d1d5db', 160, 3, 0.3); } else burst(x, y, 5, '#d1d5db', 160, 3, 0.3);
}
function explode(x, y, R, power) {
  R *= sc(); sfx('boom'); shake = 18;
  for (let i = 0; i < 26; i++) { const a = Math.random() * 6.3, v = 80 + Math.random() * 380; addP({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, kind: 'fire', size: (14 + Math.random() * 22) * sc(), life: 0.45 + Math.random() * 0.4, g: -100 }); }
  for (let i = 0; i < 14; i++) addP({ x, y, vx: (Math.random() - 0.5) * 300, vy: -Math.random() * 300, kind: 'smoke', size: (16 + Math.random() * 18) * sc(), life: 1 + Math.random(), g: -60, col: '#555' });
  if (y > FLOOR - R * 0.6) scorch(x, Math.min(y, FLOOR - 4), R * 0.45); else scorch(x, y, R * 0.3);
  let maxd = 0, near = null;
  for (const k of NAMES) {
    const p = P[k], dx = p.x - x, dy = p.y - y, d = Math.hypot(dx, dy);
    if (d < R) { const f = 1 - d / R, v = power * f * f * 1.2 + power * 0.25 * f; applyV(p, (dx / (d || 1)) * v / p.m, (dy / (d || 1)) * v / p.m - 300 * f); if (f > maxd) { maxd = f; near = p; } }
  }
  for (const o of projs) { const dx = o.x - x, dy = o.y - y, d = Math.hypot(dx, dy); if (d < R && !o.dead) { o.vx += (dx / (d || 1)) * power * (1 - d / R); o.vy += (dy / (d || 1)) * power * (1 - d / R); } }
  if (near) damage(14 + maxd * 46, near.x, near.y, 'BOOM!', null);
}

// projectiles
function spawnProj(t, x, y, vx, vy, held) { const p = { t, x, y, vx, vy, r: t.r * sc(), m: t.m, rot: 0, spin: (Math.random() - 0.5) * 10, held: !!held, fuse: t.bomb ? 1.8 : 0, life: 0, hitCD: 0, dead: false, still: 0 }; projs.push(p); return p; }
function updProj(p, dt) {
  if (p.dead) return;
  p.life += dt; p.hitCD -= dt;
  if (p.held) { p.vx = ptr.vx; p.vy = ptr.vy; p.x = ptr.x; p.y = ptr.y; } else { p.vy += G0 * sc() * S.grav * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.spin * dt; }
  if (!p.held) {
    if (p.y + p.r > FLOOR) { p.y = FLOOR - p.r; if (Math.abs(p.vy) > 250) { if (p.t.splat) { splat(p.x, FLOOR - 2, '#dc2626', 16 * sc()); burst(p.x, p.y, 10, '#dc2626', 260, 4); sfx('splat'); p.dead = true; return; } sfx('boing', 0.3); } p.vy *= -0.35; p.vx *= 0.8; p.spin *= 0.7; }
    if (p.x - p.r < 0) { p.x = p.r; p.vx *= -0.5; if (p.t.splat) { splat(p.x, p.y, '#dc2626', 16 * sc()); p.dead = true; sfx('splat'); } }
    if (p.x + p.r > W) { p.x = W - p.r; p.vx *= -0.5; if (p.t.splat) { splat(p.x, p.y, '#dc2626', 16 * sc()); p.dead = true; sfx('splat'); } }
    if (p.y - p.r < -400) p.y = -400 + p.r;
  }
  if (p.t.bomb) { p.fuse -= dt; if (p.fuse <= 0) { p.dead = true; explode(p.x, p.y, 230, 2300); if (p.held) { ptr.held = null; } return; } }
  // collide with buddy
  for (const c of CAPS) {
    const q = closest(c, p.x, p.y), dx = q.x - p.x, dy = q.y - p.y, d = Math.hypot(dx, dy), minD = p.r + c.r;
    if (d < minD) {
      const nx = d > 1e-4 ? dx / d : 0, ny = d > 1e-4 ? dy / d : -1;
      const pa = c.a, pb = c.b, pm = pa.m * (1 - q.t) + pb.m * q.t, pv = [(pa.x - pa.ox) / DT * (1 - q.t) + (pb.x - pb.ox) / DT * q.t, (pa.y - pa.oy) / DT * (1 - q.t) + (pb.y - pb.oy) / DT * q.t];
      const vn = (pv[0] - p.vx) * nx + (pv[1] - p.vy) * ny;
      const push = minD - d;
      for (const [pt, k] of [[pa, 1 - q.t], [pb, q.t]]) { if (k <= 0 || pt.dead) continue; pt.x += nx * push * k; pt.y += ny * push * k; pt.ox += nx * push * k; pt.oy += ny * push * k; }
      if (vn < 0) {
        const e = 0.45, j = (-(1 + e) * vn) / (1 / pm + 1 / p.m);
        pa.ox -= (nx * j / pm) * (1 - q.t) * DT; pa.oy -= (ny * j / pm) * (1 - q.t) * DT;
        if (pb !== pa) { pb.ox -= (nx * j / pm) * q.t * DT; pb.oy -= (ny * j / pm) * q.t * DT; }
        p.vx += (nx * j) / p.m * -1; p.vy += (ny * j) / p.m * -1;
        if (p.hitCD <= 0 && j > 250) {
          p.hitCD = 0.25; const t = p.t;
          if (t.splat) { splat(q.x, q.y, '#dc2626', 14 * sc()); burst(q.x, q.y, 14, '#dc2626', 300, 4); p.dead = true; }
          if (t.bomb) { /* bombs just bounce */ } else damage((j / 70) * (t.dm || 1), q.x, q.y, t.word, t.snd);
        }
      }
    }
  }
  if (p.life > 25 && !p.held) p.dead = true;
}
function launchRocket(x, y) {
  const fromLeft = x > W / 2, sx = fromLeft ? -40 : W + 40, sy = clamp(y + (Math.random() - 0.5) * 80, 40, FLOOR - 20), a = Math.atan2(y - sy, x - sx);
  projs.push({ t: { id: 'rocket', r: 10 }, x: sx, y: sy, vx: Math.cos(a) * 1500 * sc(), vy: Math.sin(a) * 1500 * sc(), r: 10 * sc(), m: 3, rocket: true, tx: x, ty: y, life: 0, hitCD: 0, dead: false, rot: a });
  sfx('whoosh');
}
function updRocket(p, dt) {
  p.x += p.vx * dt; p.y += p.vy * dt; p.life += dt;
  if (Math.random() < 0.6) addP({ x: p.x, y: p.y, vx: (Math.random() - 0.5) * 60, vy: (Math.random() - 0.5) * 60, kind: 'smoke', size: 8 * sc(), life: 0.5, g: -30, col: '#aaa' });
  let boom = Math.hypot(p.x - p.tx, p.y - p.ty) < 18 || p.y > FLOOR || p.x < -80 || p.x > W + 80 || p.life > 3;
  for (const c of CAPS) { const q = closest(c, p.x, p.y); if (Math.hypot(q.x - p.x, q.y - p.y) < c.r + p.r) { boom = true; break; } }
  if (boom) { p.dead = true; explode(p.x, Math.min(p.y, FLOOR), 210, 2100); }
}

// ------------------------------------------------------------ input
const ptr = { x: 0, y: 0, px: 0, py: 0, vx: 0, vy: 0, down: false, id: null, held: null, lastT: 0, inside: false, swing: -1 };
let hitCD = 0, gunCD = 0;
function pos(e) { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
cv.addEventListener('pointerdown', (e) => {
  actx(); cv.setPointerCapture(e.pointerId); const [x, y] = pos(e); ptr.x = ptr.px = x; ptr.y = ptr.py = y; ptr.vx = ptr.vy = 0; ptr.down = true; ptr.id = e.pointerId; ptr.inside = true; ptr.lastT = performance.now(); ptr.swing = 0;
  hideHint();
  const t = tool;
  if (t.kind === 'melee') { const d = dirFromClick(x); melee(t, x, y, d[0], d[1], 1); sfx('whoosh'); }
  else if (t.kind === 'grab') { const h = nearestCap(x, y, 46 * s()); if (h) { grab = h.q.t < 0.5 ? h.c.a : h.c.b; if (h.c.a === h.c.b) grab = h.c.a; standing = false; } }
  else if (t.kind === 'throw') { ptr.held = spawnProj(t, x, y, 0, 0, true); }
  else if (t.kind === 'drop') { spawnProj(t, x, -40, 0, 700 * sc(), false); sfx('whoosh'); }
  else if (t.kind === 'gun') { shoot(x, y); gunCD = 0.11; }
  else if (t.kind === 'rocket') launchRocket(x, y);
});
cv.addEventListener('pointermove', (e) => {
  const [x, y] = pos(e), now = performance.now(), dt = Math.max(4, now - ptr.lastT); ptr.lastT = now;
  const vx = ((x - ptr.x) / dt) * 1000, vy = ((y - ptr.y) / dt) * 1000;
  ptr.vx = ptr.vx * 0.5 + vx * 0.5; ptr.vy = ptr.vy * 0.5 + vy * 0.5; ptr.px = ptr.x; ptr.py = ptr.y; ptr.x = x; ptr.y = y; ptr.inside = true;
  if (ptr.down && tool.kind === 'melee' && hitCD <= 0) {
    const sp = Math.hypot(ptr.vx, ptr.vy);
    if (sp > 500) { if (melee(tool, x, y, ptr.vx / sp, ptr.vy / sp, clamp(sp / 1500, 0.4, 1.3))) hitCD = 0.14; }
  }
});
const release = (e) => {
  if (e.pointerId !== ptr.id) return; ptr.down = false; ptr.id = null; grab = null;
  if (ptr.held) { const p = ptr.held; p.held = false; const sp = Math.hypot(ptr.vx, ptr.vy), k = sp > 3000 ? 3000 / sp : 1; p.vx = ptr.vx * k; p.vy = ptr.vy * k; ptr.held = null; sfx('whoosh'); }
};
cv.addEventListener('pointerup', release); cv.addEventListener('pointercancel', release);
cv.addEventListener('pointerleave', () => { ptr.inside = false; });
function hideHint() { $('hint').classList.add('off'); }

// ------------------------------------------------------------ physics step
function step(dt) {
  const g = G0 * sc() * S.grav, u = s();
  // assist (stand up)
  const st = standing && !ko && !S.hang ? (0.25 + 0.75 * health / 100) : 0;
  const mx = (P.HL.x + P.HR.x) / 2, my = (P.HL.y + P.HR.y) / 2;
  if (st > 0 && !grab) {
    const k = 0.012 * st * Math.max(0, 1 - hurt * 1.1);
    const pull = (p, tx, ty, kk) => { p.x += (tx - p.x) * kk; p.y += (ty - p.y) * kk; p.ox += (tx - p.x) * 0; };
    const hipT = FLOOR - 8 * u - 76 * u * (0.7 + 0.3 * health / 100);
    pull(P.HL, mx - 11 * u, hipT, k * 0.8); pull(P.HR, mx + 11 * u, hipT, k * 0.8);
    pull(P.SL, mx - 17 * u, my - 58 * u, k); pull(P.SR, mx + 17 * u, my - 58 * u, k); pull(P.H, mx, my - 66 * u - hr(), k);
    pull(P.FL, mx - 12 * u, FLOOR - 8 * u, k * 0.8); pull(P.FR, mx + 12 * u, FLOOR - 8 * u, k * 0.8);
    pull(P.KL, mx - 11 * u, (hipT + FLOOR - 8 * u) / 2, k * 0.6); pull(P.KR, mx + 11 * u, (hipT + FLOOR - 8 * u) / 2, k * 0.6);
  }
  // integrate
  for (const k of NAMES) {
    const p = P[k], vx = (p.x - p.ox) * 0.9993, vy = (p.y - p.oy) * 0.9993;
    p.ox = p.x; p.oy = p.y; p.x += vx; p.y += vy + g * dt * dt;
  }
  // grab spring
  if (grab && ptr.down) { grab.x += (ptr.x - grab.x) * 0.3; grab.y += (ptr.y - grab.y) * 0.3; }
  // constraints
  for (let it = 0; it < 5; it++) {
    for (const c of cons) {
      const dx = c.b.x - c.a.x, dy = c.b.y - c.a.y, d = Math.hypot(dx, dy) || 1e-4;
      let diff = (d - c.len) / d;
      if (c.min) { if (d > c.len * 0.0 + c.len) continue; diff = ((d - c.len) / d) * c.soft; } // soft: only pushes apart if too close
      const wa = 1 / c.a.m, wb = 1 / c.b.m, sum = wa + wb;
      c.a.x += dx * diff * (wa / sum); c.a.y += dy * diff * (wa / sum); c.b.x -= dx * diff * (wb / sum); c.b.y -= dy * diff * (wb / sum);
    }
    if (hook) for (const k of ['SL', 'SR']) { const p = P[k], dx = p.x - hook.x, dy = p.y - hook.y, d = Math.hypot(dx, dy); if (d > ropeLen) { p.x -= (dx / d) * (d - ropeLen); p.y -= (dy / d) * (d - ropeLen); } }
    // bounds
    for (const k of NAMES) {
      const p = P[k], r = Math.min(p.r, 14 * u);
      const top = r, bot = FLOOR - r, left = r, right = W - r;
      if (p.y > bot) { impact(p, 'y', p.y - p.oy); const vy = p.y - p.oy; p.y = bot; p.oy = p.y + (vy > 1.5 ? vy * 0.3 : 0); p.ox += (p.x - p.ox) * 0.3; }
      if (p.y < top) { impact(p, 'y', p.y - p.oy); p.y = top; p.oy = p.y; }
      if (p.x < left) { impact(p, 'x', p.x - p.ox); const vx = p.x - p.ox; p.x = left; p.ox = p.x + vx * 0.35; }
      if (p.x > right) { impact(p, 'x', p.x - p.ox); const vx = p.x - p.ox; p.x = right; p.ox = p.x + vx * 0.35; }
    }
  }
  // projectiles
  for (const p of projs) p.rocket ? updRocket(p, dt) : updProj(p, dt);
}
function impact(p, axis, v) {
  const sp = Math.abs(v) / DT;
  if (sp > 700 * sc() && lastImpact <= 0) { lastImpact = 0.18; const dm = (sp - 500 * sc()) / 75; damage(dm, p.x, p.y, dm > 20 ? 'OOF!' : '', 'boing', 0.8); if (dm > 12) burst(p.x, Math.min(p.y, FLOOR), 8, '#d6c7a8', 200, 4); }
}

// ------------------------------------------------------------ render
function drawBG() {
  const c = bg.getContext('2d'); c.setTransform(DPR, 0, 0, DPR, 0, 0); c.clearRect(0, 0, W, H);
  const fh = H - FLOOR, r = S.room;
  const grad = (a, b) => { const g = c.createLinearGradient(0, 0, 0, FLOOR); g.addColorStop(0, a); g.addColorStop(1, b); return g; };
  if (r === 'room') {
    c.fillStyle = grad('#c9784f', '#a95a38'); c.fillRect(0, 0, W, FLOOR);
    c.strokeStyle = 'rgba(60,20,10,0.35)'; c.lineWidth = 2; const bh = 34 * sc(), bw = 96 * sc();
    for (let y = 0, row = 0; y < FLOOR; y += bh, row++) { c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke(); for (let x = (row % 2) * bw / 2; x < W; x += bw) { c.beginPath(); c.moveTo(x, y); c.lineTo(x, y + bh); c.stroke(); } }
    c.fillStyle = '#7c4a2a'; c.fillRect(0, FLOOR, W, fh); c.strokeStyle = 'rgba(0,0,0,.25)'; for (let x = 0; x < W; x += 70 * sc()) { c.beginPath(); c.moveTo(x, FLOOR); c.lineTo(x - 30, H); c.stroke(); }
  } else if (r === 'padded') {
    c.fillStyle = '#d5d9e0'; c.fillRect(0, 0, W, FLOOR); const t = 70 * sc();
    for (let y = 0; y < FLOOR; y += t) for (let x = 0; x < W; x += t) { const g = c.createRadialGradient(x + t / 2, y + t / 2, 2, x + t / 2, y + t / 2, t * 0.7); g.addColorStop(0, '#f1f3f7'); g.addColorStop(1, '#aeb4c0'); c.fillStyle = g; c.fillRect(x + 2, y + 2, t - 4, t - 4); c.fillStyle = '#8b92a0'; c.beginPath(); c.arc(x + t / 2, y + t / 2, 3, 0, 6.3); c.fill(); }
    c.fillStyle = '#6b7280'; c.fillRect(0, FLOOR, W, fh);
  } else if (r === 'gym') {
    c.fillStyle = grad('#1e3a8a', '#2563eb'); c.fillRect(0, 0, W, FLOOR); c.fillStyle = 'rgba(255,255,255,.12)'; for (let x = 0; x < W; x += 60 * sc()) c.fillRect(x, 0, 14 * sc(), FLOOR);
    c.fillStyle = '#fde047'; c.fillRect(0, FLOOR * 0.55, W, 6); c.fillStyle = '#b91c1c'; c.fillRect(0, FLOOR, W, fh); c.fillStyle = 'rgba(255,255,255,.5)'; c.fillRect(0, FLOOR + 8, W, 3);
  } else if (r === 'space') {
    c.fillStyle = grad('#02030f', '#1b1b4b'); c.fillRect(0, 0, W, FLOOR); for (let i = 0; i < 90; i++) { c.fillStyle = `rgba(255,255,255,${0.3 + Math.random() * 0.7})`; c.fillRect(Math.random() * W, Math.random() * FLOOR, 1 + Math.random() * 2, 1 + Math.random() * 2); }
    const g = c.createRadialGradient(W * 0.8, FLOOR * 0.3, 5, W * 0.8, FLOOR * 0.3, 70 * sc()); g.addColorStop(0, '#60a5fa'); g.addColorStop(1, '#1e3a8a'); c.fillStyle = g; c.beginPath(); c.arc(W * 0.8, FLOOR * 0.3, 70 * sc(), 0, 6.3); c.fill();
    c.fillStyle = '#4b5563'; c.fillRect(0, FLOOR, W, fh); c.fillStyle = '#9ca3af'; c.fillRect(0, FLOOR, W, 4);
  } else if (r === 'beach') {
    c.fillStyle = grad('#38bdf8', '#bae6fd'); c.fillRect(0, 0, W, FLOOR); c.fillStyle = '#facc15'; c.beginPath(); c.arc(W * 0.15, FLOOR * 0.25, 40 * sc(), 0, 6.3); c.fill();
    c.fillStyle = '#0ea5e9'; c.fillRect(0, FLOOR * 0.62, W, FLOOR * 0.2); c.fillStyle = 'rgba(255,255,255,.5)'; for (let x = 0; x < W; x += 50) c.fillRect(x, FLOOR * 0.66, 26, 3);
    c.fillStyle = '#f5d9a0'; c.fillRect(0, FLOOR * 0.82, W, FLOOR * 0.18 + fh);
  } else {
    c.fillStyle = grad('#0b1026', '#3b2a6b'); c.fillRect(0, 0, W, FLOOR);
    for (let x = 0, i = 0; x < W; x += 54 * sc(), i++) { const h = (80 + ((i * 53) % 140)) * sc(); c.fillStyle = '#12142e'; c.fillRect(x, FLOOR - h, 50 * sc(), h); c.fillStyle = '#fde68a'; for (let y = FLOOR - h + 10; y < FLOOR - 10; y += 22 * sc()) for (let wx = x + 8; wx < x + 42 * sc(); wx += 16 * sc()) if (((wx * 7 + y * 3) | 0) % 5 > 1) c.fillRect(wx, y, 6, 9);
    }
    c.fillStyle = '#1f2937'; c.fillRect(0, FLOOR, W, fh); c.fillStyle = '#fde047'; for (let x = 0; x < W; x += 80) c.fillRect(x, FLOOR + fh / 2, 40, 4);
  }
}
function emojiAt(c, e, x, y, size, rot) { c.save(); c.translate(x, y); if (rot) c.rotate(rot); c.font = `${size}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(e, 0, 0); c.restore(); }
function limb(a, b, w, col) { ctx.lineCap = 'round'; ctx.strokeStyle = 'rgba(20,10,30,.85)'; ctx.lineWidth = w + 4; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); ctx.strokeStyle = col; ctx.lineWidth = w; ctx.stroke(); }
function drawFace(c, R, mode) {
  // mode: 'norm' | 'hurt' | 'ko'
  c.fillStyle = S.skin; c.beginPath(); c.arc(0, 0, R, 0, 6.3); c.fill();
  c.strokeStyle = '#2b1a14'; c.fillStyle = '#2b1a14'; c.lineWidth = Math.max(2, R * 0.09); c.lineCap = 'round';
  const ex = R * 0.36, ey = -R * 0.12;
  if (mode === 'ko') { for (const sx of [-1, 1]) { c.beginPath(); c.moveTo(sx * ex - R * 0.14, ey - R * 0.14); c.lineTo(sx * ex + R * 0.14, ey + R * 0.14); c.moveTo(sx * ex + R * 0.14, ey - R * 0.14); c.lineTo(sx * ex - R * 0.14, ey + R * 0.14); c.stroke(); } c.beginPath(); c.arc(0, R * 0.45, R * 0.12, 0, 6.3); c.stroke(); }
  else if (mode === 'hurt') { for (const sx of [-1, 1]) { c.beginPath(); c.moveTo(sx * ex - R * 0.12, ey - R * 0.12 * sx); c.lineTo(sx * ex + R * 0.12, ey + R * 0.1 * sx); c.stroke(); } c.beginPath(); c.ellipse(0, R * 0.45, R * 0.22, R * 0.18, 0, 0, 6.3); c.fill(); }
  else { for (const sx of [-1, 1]) { c.beginPath(); c.arc(sx * ex, ey, R * 0.1, 0, 6.3); c.fill(); } c.beginPath(); c.arc(0, R * 0.2, R * 0.4, 0.25, Math.PI - 0.25); c.stroke(); }
  c.fillStyle = 'rgba(255,90,90,.35)'; c.beginPath(); c.arc(-R * 0.55, R * 0.18, R * 0.16, 0, 6.3); c.arc(R * 0.55, R * 0.18, R * 0.16, 0, 6.3); c.fill();
}
function drawHead(c, R, mode) {
  c.save(); c.beginPath(); c.arc(0, 0, R, 0, 6.3); c.clip();
  if (S.head.type === 'photo' && headImg) c.drawImage(headImg, -R, -R, 2 * R, 2 * R);
  else if (S.head.type === 'emoji') { c.fillStyle = S.skin; c.fillRect(-R, -R, 2 * R, 2 * R); emojiAt(c, S.head.emoji, 0, R * 0.06, R * 1.55, 0); }
  else drawFace(c, R, mode);
  c.restore();
  c.strokeStyle = 'rgba(20,10,30,.9)'; c.lineWidth = Math.max(3, R * 0.1); c.beginPath(); c.arc(0, 0, R, 0, 6.3); c.stroke();
  if (mode === 'ko' && S.head.type !== 'face') { c.strokeStyle = '#111'; c.lineWidth = R * 0.12; c.lineCap = 'round'; for (const sx of [-1, 1]) { const x = sx * R * 0.36, y = -R * 0.1; c.beginPath(); c.moveTo(x - R * 0.15, y - R * 0.15); c.lineTo(x + R * 0.15, y + R * 0.15); c.moveTo(x + R * 0.15, y - R * 0.15); c.lineTo(x - R * 0.15, y + R * 0.15); c.stroke(); } }
}
function drawBuddy() {
  const u = s(), R = hr();
  if (hook) { ctx.strokeStyle = '#d6b27a'; ctx.lineWidth = 3 * sc(); ctx.beginPath(); ctx.moveTo(hook.x, 0); ctx.lineTo(hook.x, hook.y); ctx.stroke(); ctx.fillStyle = '#6b7280'; ctx.beginPath(); ctx.arc(hook.x, hook.y, 6 * sc(), 0, 6.3); ctx.fill(); ctx.strokeStyle = '#d6b27a'; ctx.beginPath(); ctx.moveTo(hook.x, hook.y); ctx.lineTo(P.SL.x, P.SL.y); ctx.moveTo(hook.x, hook.y); ctx.lineTo(P.SR.x, P.SR.y); ctx.stroke(); }
  // legs
  limb(P.HL, P.KL, 17 * u, S.pants); limb(P.KL, P.FL, 15 * u, S.pants); limb(P.HR, P.KR, 17 * u, S.pants); limb(P.KR, P.FR, 15 * u, S.pants);
  for (const f of [P.FL, P.FR]) { ctx.fillStyle = '#2a1a12'; ctx.strokeStyle = '#000'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(f.x, f.y + 3 * u, 11 * u, 7 * u, 0, 0, 6.3); ctx.fill(); ctx.stroke(); }
  // torso
  ctx.lineJoin = 'round'; const tp = () => { ctx.beginPath(); ctx.moveTo(P.SL.x, P.SL.y); ctx.lineTo(P.SR.x, P.SR.y); ctx.lineTo(P.HR.x, P.HR.y); ctx.lineTo(P.HL.x, P.HL.y); ctx.closePath(); };
  tp(); ctx.strokeStyle = 'rgba(20,10,30,.85)'; ctx.lineWidth = 24 * u + 4; ctx.stroke(); tp(); ctx.fillStyle = S.shirt; ctx.strokeStyle = S.shirt; ctx.lineWidth = 24 * u; ctx.stroke(); ctx.fill();
  // arms
  limb(P.SL, P.EL, 14 * u, S.shirt); limb(P.EL, P.WL, 12 * u, S.skin); limb(P.SR, P.ER, 14 * u, S.shirt); limb(P.ER, P.WR, 12 * u, S.skin);
  for (const h of [P.WL, P.WR]) { ctx.fillStyle = S.skin; ctx.strokeStyle = 'rgba(20,10,30,.85)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(h.x, h.y, 8 * u, 0, 6.3); ctx.fill(); ctx.stroke(); }
  // neck + head
  const sx = (P.SL.x + P.SR.x) / 2, sy = (P.SL.y + P.SR.y) / 2; limb({ x: sx, y: sy }, P.H, 10 * u, S.skin);
  const ang = Math.atan2(P.H.x - sx, -(P.H.y - sy));
  ctx.save(); ctx.translate(P.H.x, P.H.y); ctx.rotate(ang); drawHead(ctx, R, ko ? 'ko' : hurt > 0.15 ? 'hurt' : 'norm');
  if (health < 55 || ko) { ctx.fillStyle = 'rgba(120,60,160,.28)'; ctx.beginPath(); ctx.arc(R * 0.3, -R * 0.25, R * 0.3, 0, 6.3); ctx.fill(); emojiAt(ctx, '🩹', -R * 0.35, -R * 0.55, R * 0.7, -0.4); }
  if (health < 25 && !ko) emojiAt(ctx, '💢', R * 0.8, -R * 0.8, R * 0.6, 0);
  ctx.restore();
  if (ko) for (let i = 0; i < 3; i++) { const a = koT * 4 + i * 2.1; emojiAt(ctx, '⭐', P.H.x + Math.cos(a) * R * 1.1, P.H.y - R * 1.15 + Math.sin(a) * R * 0.3, 18 * sc(), 0); }
}
function drawProj(p) {
  const r = p.r;
  if (p.rocket) { emojiAt(ctx, '🚀', p.x, p.y, r * 3.2, p.rot + Math.PI / 4); return; }
  if (p.t.id === 'anvil') { ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot * 0.1); const k = r / 28; ctx.fillStyle = '#374151'; ctx.strokeStyle = '#111'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-34 * k, -18 * k); ctx.lineTo(34 * k, -18 * k); ctx.lineTo(44 * k, -8 * k); ctx.lineTo(18 * k, -4 * k); ctx.lineTo(14 * k, 10 * k); ctx.lineTo(26 * k, 22 * k); ctx.lineTo(-26 * k, 22 * k); ctx.lineTo(-14 * k, 10 * k); ctx.lineTo(-18 * k, -4 * k); ctx.lineTo(-34 * k, -8 * k); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.fillStyle = 'rgba(255,255,255,.2)'; ctx.fillRect(-30 * k, -16 * k, 60 * k, 4 * k); ctx.restore(); return; }
  emojiAt(ctx, p.t.ico, p.x, p.y, r * 2.3, p.rot);
  if (p.t.bomb) { const f = Math.floor(p.fuse * 6) % 2; if (f) { ctx.fillStyle = 'rgba(255,60,0,.55)'; ctx.beginPath(); ctx.arc(p.x, p.y, r * 1.2, 0, 6.3); ctx.fill(); } }
}
function drawCursor() {
  if (!ptr.inside && !ptr.down) return; const t = tool, x = ptr.x, y = ptr.y, size = 52 * sc();
  let rot = 0, ox = 0, oy = 0;
  if (ptr.swing >= 0) { ptr.swing += 0.09; if (ptr.swing > 1) ptr.swing = -1; }
  const sw = ptr.swing >= 0 ? Math.sin(ptr.swing * Math.PI) : 0;
  if (t.kind === 'melee') { rot = -0.7 + sw * 1.5; if (t.id === 'fist' || t.id === 'glove') { ox = sw * 14; rot = 0; } }
  if (t.kind === 'gun') { rot = -0.2; ox = -gunKick * 6; }
  if (t.kind === 'grab') emojiAt(ctx, ptr.down ? '✊' : '✋', x, y, size, 0);
  else if (t.kind === 'zap' && ptr.down) emojiAt(ctx, '⚡', x, y, size * 1.2, 0);
  else if (!(ptr.held && t.kind === 'throw') && t.id !== 'anvil') emojiAt(ctx, t.ico, x + ox, y + oy, size, rot);
  else if (t.id === 'anvil') emojiAt(ctx, '⚓', x, y, size, 0);
  if (t.kind === 'zap' && ptr.down) { ctx.strokeStyle = '#fde047'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x, y); const h = nearestCap(x, y, 80 * s()); if (h) { let px = x, py = y; for (let i = 1; i <= 5; i++) { px = x + (h.q.x - x) * i / 5 + (Math.random() - 0.5) * 20; py = y + (h.q.y - y) * i / 5 + (Math.random() - 0.5) * 20; ctx.lineTo(px, py); } } ctx.stroke(); }
}
let gunKick = 0;
function drawParts() {
  for (const p of parts) {
    const a = 1 - p.t / p.life; ctx.globalAlpha = Math.max(0, p.kind === 'smoke' ? a * 0.6 : a);
    if (p.kind === 'dot') { ctx.fillStyle = p.col; ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, 6.3); ctx.fill(); }
    else if (p.kind === 'smoke') { ctx.fillStyle = p.col; ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (1.3 - a * 0.4), 0, 6.3); ctx.fill(); }
    else if (p.kind === 'fire') { const g = ctx.createRadialGradient(p.x, p.y, 1, p.x, p.y, p.size); g.addColorStop(0, '#fff7c2'); g.addColorStop(0.4, '#fb923c'); g.addColorStop(1, 'rgba(220,38,38,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, 6.3); ctx.fill(); }
    else if (p.kind === 'star') { ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot + p.t * 6); ctx.fillStyle = p.col; ctx.beginPath(); for (let i = 0; i < 10; i++) { const r = i % 2 ? p.size * 0.45 : p.size; const an = (i * Math.PI) / 5 - Math.PI / 2; ctx.lineTo(Math.cos(an) * r, Math.sin(an) * r); } ctx.closePath(); ctx.fill(); ctx.restore(); }
    else if (p.kind === 'text') { ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); const sc2 = a > 0.8 ? 1 + (a - 0.8) * 3 : 1; ctx.scale(sc2, sc2); ctx.font = `${p.size}px Bungee, Fredoka, Impact, sans-serif`; ctx.textAlign = 'center'; ctx.lineWidth = Math.max(3, p.size * 0.18); ctx.strokeStyle = '#1a0b2e'; ctx.lineJoin = 'round'; ctx.strokeText(p.txt, 0, 0); ctx.fillStyle = p.col; ctx.fillText(p.txt, 0, 0); ctx.restore(); }
    ctx.globalAlpha = 1;
  }
}
function draw() {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  const sh = shake > 0.3 ? [(Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake] : [0, 0];
  ctx.save(); ctx.translate(sh[0], sh[1]);
  ctx.drawImage(bg, 0, 0, W, H); ctx.drawImage(dec, 0, 0, W, H);
  drawBuddy();
  for (const p of projs) if (!p.dead) drawProj(p);
  for (const b of bullets) { ctx.strokeStyle = `rgba(255,240,150,${1 - b.t / 0.12})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(b.x1, b.y1); ctx.lineTo(b.x2, b.y2); ctx.stroke(); }
  drawParts(); drawCursor();
  ctx.restore();
}

// ------------------------------------------------------------ loop
let last = 0, acc = 0;
function frame(now) {
  const dtf = Math.min(0.05, (now - (last || now)) / 1000); last = now;
  const ts = slow ? 0.3 : 1; acc += SUB * ts * (dtf * 60);
  let n = Math.floor(acc); acc -= n; n = Math.min(n, 24);
  for (let i = 0; i < n; i++) step(DT);
  const fd = dtf * ts;
  hurt = Math.max(0, hurt - fd); shake *= 0.9; lastImpact -= fd; hitCD -= fd; gunKick *= 0.8;
  projs = projs.filter((p) => !p.dead); bullets.forEach((b) => (b.t += fd)); bullets = bullets.filter((b) => b.t < 0.12);
  for (const p of parts) { p.t += fd; p.vy += p.g * fd; p.x += p.vx * fd; p.y += p.vy * fd; } parts = parts.filter((p) => p.t < p.life);
  if (comboT > 0) { comboT -= fd; if (comboT <= 0) { combo = 0; $('combo').textContent = ''; } }
  if (ko) { koT += fd; if (koT > 4.5) revive(); }
  // held weapons
  if (ptr.down && tool.kind === 'gun') { gunCD -= fd; if (gunCD <= 0) { shoot(ptr.x + (Math.random() - 0.5) * 6, ptr.y + (Math.random() - 0.5) * 6); gunKick = 1; gunCD = 0.11; } }
  if (ptr.down && tool.kind === 'zap') { zapT -= fd; const h = nearestCap(ptr.x, ptr.y, 70 * s()); if (h && zapT <= 0) { zapT = 0.045; sfx('zap'); for (const k of NAMES) { if (Math.hypot(P[k].x - ptr.x, P[k].y - ptr.y) < 200 * s()) applyV(P[k], (Math.random() - 0.5) * 900, (Math.random() - 0.5) * 900); } if (Math.random() < 0.3) damage(2 + Math.random() * 2, h.q.x, h.q.y, Math.random() < 0.1 ? 'ZZZAP!' : '', null); burst(h.q.x, h.q.y, 2, '#fde047', 200, 2.5, 0.25); } }
  // standing detection
  if (standing && !S.hang) { const m = center(), hx = (P.HL.x + P.HR.x) / 2, hy = (P.HL.y + P.HR.y) / 2, sx = (P.SL.x + P.SR.x) / 2, sy = (P.SL.y + P.SR.y) / 2; const tilt = Math.abs(Math.atan2(sx - hx, hy - sy)); if (tilt > 0.85 || hy > FLOOR - 30 * s() || m.y < 0) standT += fd; else standT = 0; if (standT > 0.25) { standing = false; standT = 0; } }
  draw(); requestAnimationFrame(frame);
}
function resize() {
  const r = cv.getBoundingClientRect(); DPR = Math.min(2, window.devicePixelRatio || 1); const ow = W, oh = H;
  W = r.width; H = r.height; if (!W || !H) return; cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR); FLOOR = H - Math.max(46, H * 0.1);
  bg = document.createElement('canvas'); bg.width = cv.width; bg.height = cv.height;
  const od = dec; dec = document.createElement('canvas'); dec.width = cv.width; dec.height = cv.height; dctx = dec.getContext('2d'); dctx.scale(DPR, DPR);
  if (od && ow) dctx.drawImage(od, 0, 0, ow, oh);
  drawBG(); if (!ow || Math.abs(ow - W) > 40 || Math.abs(oh - H) > 40 || !P.H) buildBuddy();
}

// ------------------------------------------------------------ UI
function drawFacePv() {
  const c = $('facePv').getContext('2d'); c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, 96, 96); c.save(); c.translate(48, 48); drawHead(c, 40, 'norm'); c.restore();
}
function setHead(h) { S.head = Object.assign({}, S.head, h); saveS(); loadHeadImg(); syncUI(); }
function syncUI() {
  $('bname').textContent = S.name || 'Buddy'; $('nameIn').value = S.name;
  $('skin').value = S.skin; $('shirt').value = S.shirt; $('pants').value = S.pants;
  $('size').value = S.size; $('szv').textContent = S.size + '×'; $('headSize').value = S.headSize; $('hsv').textContent = S.headSize + '×';
  $('hang').checked = S.hang; $('sound').checked = !S.muted;
  document.querySelectorAll('#emojis button').forEach((b) => b.classList.toggle('on', S.head.type === 'emoji' && b.textContent === S.head.emoji));
  document.querySelectorAll('#rooms button').forEach((b) => b.classList.toggle('on', b.dataset.v === S.room));
  document.querySelectorAll('#gravs button').forEach((b) => b.classList.toggle('on', +b.dataset.v === S.grav));
  $('slowBtn').classList.toggle('on', slow); drawFacePv();
}
(function init() {
  const tl = $('tools'); TOOLS.forEach((t) => { const b = document.createElement('button'); b.className = 'tool'; b.dataset.id = t.id; b.innerHTML = `<span class="e">${t.ico}</span><small>${t.name}</small>`; b.addEventListener('click', () => selectTool(t.id)); tl.appendChild(b); });
  const eg = $('emojis'); EMOJIS.forEach((e) => { const b = document.createElement('button'); b.textContent = e; b.addEventListener('click', () => setHead({ type: 'emoji', emoji: e })); eg.appendChild(b); });
  const rm = $('rooms'); Object.keys(ROOMS).forEach((k) => { const b = document.createElement('button'); b.dataset.v = k; b.textContent = ROOMS[k]; b.addEventListener('click', () => { S.room = k; saveS(); if (bg) drawBG(); syncUI(); }); rm.appendChild(b); });
  $('gravs').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { S.grav = +b.dataset.v; saveS(); syncUI(); } });
  $('faceDef').addEventListener('click', () => setHead({ type: 'face' }));
  $('headFile').addEventListener('change', (e) => {
    const f = e.target.files && e.target.files[0]; if (!f) return; const url = URL.createObjectURL(f), im = new Image();
    im.onload = () => { const c = document.createElement('canvas'); c.width = c.height = 256; const m = Math.min(im.width, im.height), cx = c.getContext('2d'); cx.drawImage(im, (im.width - m) / 2, (im.height - m) / 2, m, m, 0, 0, 256, 256); URL.revokeObjectURL(url); setHead({ type: 'photo', img: c.toDataURL('image/jpeg', 0.85) }); };
    im.src = url; e.target.value = '';
  });
  $('nameIn').addEventListener('input', (e) => { S.name = e.target.value; saveS(); $('bname').textContent = S.name || 'Buddy'; });
  for (const k of ['skin', 'shirt', 'pants']) $(k).addEventListener('input', (e) => { S[k] = e.target.value; saveS(); drawFacePv(); });
  $('size').addEventListener('change', (e) => { S.size = +e.target.value; saveS(); buildBuddy(); syncUI(); }); $('size').addEventListener('input', (e) => { $('szv').textContent = e.target.value + '×'; });
  $('headSize').addEventListener('change', (e) => { S.headSize = +e.target.value; saveS(); buildBuddy(); syncUI(); }); $('headSize').addEventListener('input', (e) => { $('hsv').textContent = e.target.value + '×'; });
  $('hang').addEventListener('change', (e) => { S.hang = e.target.checked; saveS(); buildBuddy(); });
  $('sound').addEventListener('change', (e) => { S.muted = !e.target.checked; saveS(); });
  $('setBtn').addEventListener('click', () => { $('panel').classList.remove('hidden'); hideHint(); });
  const close = () => $('panel').classList.add('hidden'); $('closePanel').addEventListener('click', close); $('doneBtn').addEventListener('click', close);
  $('panel').addEventListener('pointerdown', (e) => { if (e.target === $('panel')) close(); });
  $('slowBtn').addEventListener('click', () => { slow = !slow; syncUI(); });
  $('standBtn').addEventListener('click', () => { standUp(); });
  $('cleanBtn').addEventListener('click', () => { if (dctx) dctx.clearRect(0, 0, W, H); parts = []; });
  setTimeout(hideHint, 9000);
})();
new ResizeObserver(resize).observe(cv);
selectTool('fist'); loadHeadImg(); syncUI(); resize(); requestAnimationFrame(frame);
if (location.search.includes('debug')) window.__kb = { get P() { return P; }, get S() { return S; }, get health() { return health; }, get ko() { return ko; }, get total() { return total; }, get standing() { return standing; }, get projs() { return projs; }, get FLOOR() { return FLOOR; }, get W() { return W; }, get H() { return H; }, selectTool, melee, TOOLS, center, explode, shoot, setHead, standUp, damage, get tool() { return tool; } };
'use strict';
const $ = (id) => document.getElementById(id);
const cv = $('cv'), ctx = cv.getContext('2d');
const SK = 'potpeak-settings', BK = 'potpeak-best', TK = 'potpeak-time';
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ------------------------------------------------------------ settings
const HAMMERS = {
  sledge: { n: '🔨 Sledge', c: [[1, -11, 9], [1, 0, 9], [1, 11, 9]] },
  pick: { n: '⛏ Pickaxe', c: [[1, -8, 5], [1, 8, 5], [1, -17, 4], [1, 17, 4], [1, -26, 3.5], [1, 26, 3.5]] },
  axe: { n: '🪓 Axe', c: [[1, 0, 6], [1, 12, 6], [1, 22, 5]] },
  spoon: { n: '🥄 Spoon', c: [[1, 0, 14]] },
};
const LENGTHS = { short: 90, normal: 115, long: 145 };
const GRIPS = { grippy: 12, normal: 7, slippery: 3 };
const SPEEDS = { calm: 6, normal: 9, wild: 15 };
const TR = 0.38, VCAP = 380;
const EMOJIS = ['🧔', '😎', '🤡', '👽', '🤖', '💀', '🐵', '🐷', '🐸', '🎃', '👻', '🦄', '🤓', '😱', '🥸', '🧟'];
const DEF = { head: { type: 'face', emoji: '🧔', img: null }, hammer: 'sledge', len: 'normal', grip: 'normal', speed: 'normal', pot: '#4b5563', skin: '#f2c18d', grav: 1, muted: false };
function loadS() {
  try { const o = JSON.parse(localStorage.getItem(SK)); if (o && typeof o === 'object') return Object.assign({}, DEF, o, { head: Object.assign({}, DEF.head, o.head || {}) }); } catch (e) { /* ignore */ }
  return JSON.parse(JSON.stringify(DEF));
}
let S = loadS();
const saveS = () => { try { localStorage.setItem(SK, JSON.stringify(S)); } catch (e) { /* ignore */ } };
let bestAlt = 0, bestTime = 0; try { bestAlt = parseInt(localStorage.getItem(BK)) || 0; bestTime = parseInt(localStorage.getItem(TK)) || 0; } catch (e) { /* ignore */ }
let headImg = null;
function loadHeadImg() { headImg = null; if (S.head.type === 'photo' && S.head.img) { const i = new Image(); i.onload = () => { headImg = i; drawFacePv(); }; i.src = S.head.img; } }

// ------------------------------------------------------------ audio
let AC = null;
function actx() { try { AC = AC || new (window.AudioContext || window.webkitAudioContext)(); return AC; } catch (e) { return null; } }
function noise(dur, freq, kind, vol) {
  if (S.muted) return; const a = actx(); if (!a) return; const n = Math.floor(a.sampleRate * dur), b = a.createBuffer(1, n, a.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const s = a.createBufferSource(); s.buffer = b; const f = a.createBiquadFilter(); f.type = kind; f.frequency.value = freq; const g = a.createGain(); g.gain.value = vol; s.connect(f); f.connect(g); g.connect(a.destination); s.start();
}
function tone(type, f0, f1, dur, vol) {
  if (S.muted) return; const a = actx(); if (!a) return; const t = a.currentTime, o = a.createOscillator(), g = a.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + dur + 0.02);
}
let lastSnd = 0;
function thunk(v, hard) { const now = performance.now(); if (now - lastSnd < 70) return; lastSnd = now; const vol = clamp(v / 1200, 0.05, 0.6); if (hard) { tone('sine', 110, 40, 0.18, vol); noise(0.1, 500, 'lowpass', vol); } else { tone('triangle', 900, 500, 0.08, vol * 0.5); noise(0.05, 2500, 'bandpass', vol * 0.5); } }

// ------------------------------------------------------------ level
const R = 26, GRAV = 1500, UNIT = 20; // 20 px = 1 m
let polys = [], flag = { x: 0, y: 0 }, END_Y = -4000;
function rng(seed) { let s = seed; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; }
function mkPoly(pts) { let a = 1e9, b = 1e9, c = -1e9, d = -1e9; for (const p of pts) { a = Math.min(a, p[0]); b = Math.min(b, p[1]); c = Math.max(c, p[0]); d = Math.max(d, p[1]); } let ar = 0; for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; ar += p[0] * q[1] - q[0] * p[1]; } return { pts, bb: [a, b, c, d], area: ar }; }
function boulder(cx, cy, r, rnd) { const pts = [], n = 14; for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2, k = 0.88 + rnd() * 0.2; pts.push([cx + Math.cos(a) * r * k, cy + Math.sin(a) * r * k]); } return mkPoly(pts); }
function buildLevel() {
  const rnd = rng(11); polys = [];
  const pts = [[-800, 0]]; let x = -800, y = 0; const add = (dx, dy) => { x += dx; y += dy; pts.push([x, y]); };
  const rocks = [];
  add(1100, 0);
  let guard = 0;
  while (y > -3950 && guard++ < 80) {
    const d = clamp(-y / 4000, 0, 1);
    const ang = ((28 + 40 * d + (rnd() - 0.5) * 10) * Math.PI) / 180, len = 200 + rnd() * 120;
    add(Math.cos(ang) * len, -Math.sin(ang) * len);
    add(100 + rnd() * 100 - 50 * d, 0);
    const h = 90 + 300 * d + rnd() * 60;
    if (rnd() < 0.8 - 0.7 * d) { const r = 46 + rnd() * 26; rocks.push(boulder(x - r * 0.75, y - r * 0.7, r, rnd)); }
    add(0, -h);
    add(90 + rnd() * 110, 0);
    if (guard === 5 || guard === 12) { // canyon
      add(30, 0); add(0, 380); add(220, 0);
      for (let i = 0; i < 3; i++) rocks.push(boulder(x + 140 + i * 130, y - 40 - i * 110, 52 + rnd() * 18, rnd));
      add(380, -440); add(120, 0);
    } else if (rnd() < 0.2 && d > 0.2) { add(30, 0); add(0, 150); add(170, 0); add(0, -150); }
  }
  add(260, 0); flag = { x: x - 130, y }; END_Y = y;
  add(300, 0); pts.push([x, 1500]); pts.push([-800, 1500]);
  polys.push(mkPoly(pts));
  rocks.forEach((r) => polys.push(r));
  polys.push(mkPoly([[-1600, -5400], [-800, -5400], [-800, 1500], [-1600, 1500]]));
  polys.push(mkPoly([[x, -5400], [x + 800, -5400], [x + 800, 1500], [x, 1500]]));
}
// nearest-surface query: returns {nx, ny, d} when a circle (x,y,r) overlaps poly
function near(poly, x, y, r) {
  const b = poly.bb; if (x < b[0] - r || x > b[2] + r || y < b[1] - r || y > b[3] + r) return null;
  const p = poly.pts, n = p.length; let best = 1e18, bx = 0, by = 0, inside = false;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const ax = p[j][0], ay = p[j][1], ex = p[i][0], ey = p[i][1], dx = ex - ax, dy = ey - ay, l2 = dx * dx + dy * dy;
    let t = l2 > 0 ? ((x - ax) * dx + (y - ay) * dy) / l2 : 0; t = t < 0 ? 0 : t > 1 ? 1 : t;
    const qx = ax + dx * t, qy = ay + dy * t, d2 = (x - qx) * (x - qx) + (y - qy) * (y - qy);
    if (d2 < best) { best = d2; bx = qx; by = qy; }
    if ((ay > y) !== (ey > y) && x < ((ex - ax) * (y - ay)) / (ey - ay) + ax) inside = !inside;
  }
  const dist = Math.sqrt(best);
  if (inside) { if (dist < 1e-6) return { nx: 0, ny: -1, d: r }; return { nx: (bx - x) / dist, ny: (by - y) / dist, d: r + dist }; }
  if (dist < r) { if (dist < 1e-6) return { nx: 0, ny: -1, d: r }; return { nx: (x - bx) / dist, ny: (y - by) / dist, d: r - dist }; }
  return null;
}

// ------------------------------------------------------------ player
let px = 120, py = -R, vx = 0, vy = 0, th = -0.3, omega = 0, tgt = -0.3, started = false, paused = true, won = false;
let falls = 0, peakAlt = 0, alt = 0, runT = 0, impactV = 0, still = 0, camps = 0;
const SH = -34; // shoulder offset above pot centre
const BODY = [[0, 0, R], [0, -26, 15], [0, -52, 12]];
function resetPlayer() { px = 120; py = -R; vx = vy = 0; th = tgt = -0.3; omega = 0; falls = 0; peakAlt = 0; alt = 0; runT = 0; started = false; won = false; camps = 0; cam.x = px; cam.y = py - 60; $('falls').textContent = 0; $('time').textContent = '0:00'; }
const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };
const hamLen = () => LENGTHS[S.len] || 115;
function hammerCircles() {
  const L = hamLen(), c = Math.cos(th), s = Math.sin(th), sx = px, sy = py + SH, out = [];
  const add = (t, off, r, soft) => out.push({ x: sx + c * L * t - s * off, y: sy + s * L * t + c * off, r, soft });
  add(0.45, 0, 5, true); add(0.75, 0, 5, true);
  for (const [t, off, r] of HAMMERS[S.hammer].c) add(t, off, r, false);
  return out;
}
function contacts(dt) {
  const grip = GRIPS[S.grip], mub = S.grip === 'slippery' ? 0.35 : S.grip === 'grippy' ? 0.9 : 0.65;
  // hammer
  for (const h of hammerCircles()) {
    const sy = py + SH;
    for (const pl of polys) {
      const q = near(pl, h.x, h.y, h.r); if (!q) continue;
      const rx = -omega * (h.y - sy), ry = omega * (h.x - px);
      px += q.nx * q.d * 0.85; py += q.ny * q.d * 0.85;
      const vn = (vx + rx) * q.nx + (vy + ry) * q.ny;
      if (vn < 0) {
        const bn = vx * q.nx + vy * q.ny, add = Math.min(-vn * TR, Math.max(0, VCAP - bn)); vx += add * q.nx; vy += add * q.ny;
        const tx = -q.ny, ty = q.nx, vt = (vx + rx) * tx + (vy + ry) * ty, lim = (0.9 * -vn + grip) * (h.soft ? 0.3 : 1), dv = clamp(-vt, -lim, lim) * TR;
        vx += dv * tx; vy += dv * ty; if (-vn > 180) thunk(-vn, false);
      }
    }
  }
  // body
  for (const [ox, oy, r] of BODY) {
    for (const pl of polys) {
      const q = near(pl, px + ox, py + oy, r); if (!q) continue;
      px += q.nx * q.d * 0.9; py += q.ny * q.d * 0.9;
      const vn = vx * q.nx + vy * q.ny;
      if (vn < 0) {
        const e = 0.08; vx -= (1 + e) * vn * q.nx; vy -= (1 + e) * vn * q.ny; if (-vn > impactV) impactV = -vn;
        const tx = -q.ny, ty = q.nx, vt = vx * tx + vy * ty, lim = mub * (-vn * (1 + e) + GRAV * S.grav * dt * Math.max(0, -q.ny) * 1.2), dv = clamp(-vt, -lim, lim);
        vx += dv * tx; vy += dv * ty; if (-vn > 300) thunk(-vn, true);
      }
    }
  }
}
function stepPhys(dt) {
  const d = angDiff(tgt, th), wmax = SPEEDS[S.speed], w = clamp(d * 28, -wmax, wmax); th += w * dt; omega = w;
  vy += GRAV * S.grav * dt; if (vy > 2800) vy = 2800;
  px += vx * dt; py += vy * dt;
  contacts(dt); contacts(dt);
  vx *= 0.9996; vy *= 0.9996; const sp = Math.hypot(vx, vy); if (sp > 2600) { vx *= 2600 / sp; vy *= 2600 / sp; }
}

// ------------------------------------------------------------ camera + render
const cam = { x: 120, y: -90 }; let W = 0, H = 0, DPR = 1, K = 1, mx = 0, my = 0, bot = null;
function resize() { DPR = Math.min(2, window.devicePixelRatio || 1); W = innerWidth; H = innerHeight; cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR); K = Math.min(H / 640, W / 520); mx = W * 0.7; my = H * 0.4; }
const sx = (x) => (x - cam.x) * K + W / 2, sy = (y) => (y - cam.y) * K + H / 2;
let rockPat = null;
function makePat() {
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d'); g.fillStyle = 'rgba(0,0,0,0)'; g.clearRect(0, 0, 256, 256); const r = rng(5);
  for (let i = 0; i < 70; i++) { g.fillStyle = r() < 0.5 ? 'rgba(0,0,0,0.10)' : 'rgba(255,255,255,0.07)'; g.beginPath(); g.ellipse(r() * 256, r() * 256, 8 + r() * 26, 5 + r() * 14, r() * 3, 0, 6.3); g.fill(); }
  g.strokeStyle = 'rgba(0,0,0,0.18)'; g.lineWidth = 2; for (let i = 0; i < 18; i++) { g.beginPath(); let x0 = r() * 256, y0 = r() * 256; g.moveTo(x0, y0); for (let k = 0; k < 3; k++) { x0 += (r() - 0.5) * 50; y0 += (r() - 0.5) * 50; g.lineTo(x0, y0); } g.stroke(); }
  rockPat = ctx.createPattern(c, 'repeat');
}
function lerpC(a, b, t) { return a.map((v, i) => Math.round(v + (b[i] - v) * t)); }
const C = { s0: [92, 168, 255], s1: [28, 42, 110], s2: [8, 10, 34] };
function drawSky() {
  const a = clamp(alt / 200, 0, 1), top = a < 0.55 ? lerpC(C.s0, C.s1, a / 0.55) : lerpC(C.s1, C.s2, (a - 0.55) / 0.45), bot2 = lerpC([190, 226, 255], [70, 90, 160], a);
  const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, `rgb(${top})`); g.addColorStop(1, `rgb(${bot2})`); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  if (a > 0.45) { ctx.fillStyle = `rgba(255,255,255,${(a - 0.45) * 1.4})`; const r = rng(3); for (let i = 0; i < 70; i++) ctx.fillRect(r() * W, r() * H, 1 + r() * 1.6, 1 + r() * 1.6); }
  // distant ridges
  for (const [par, col, hgt] of [[0.12, '#6f86c8', 160], [0.25, '#4f6aa8', 110]]) {
    ctx.fillStyle = col; ctx.globalAlpha = 0.55 * (1 - a * 0.6); ctx.beginPath(); ctx.moveTo(0, H);
    const base = H * 0.78 - (cam.y * par * -1 * 0.12) * 0 - (-cam.y) * par * K * 0.4 + 40;
    for (let x = 0; x <= W; x += 24) { const wx = x / K + cam.x * par; ctx.lineTo(x, base - (Math.sin(wx * 0.004) * 0.5 + Math.sin(wx * 0.011 + 1) * 0.3 + 0.8) * hgt * K * 0.6); }
    ctx.lineTo(W, H); ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1;
  }
  // clouds
  const r = rng(9); ctx.fillStyle = `rgba(255,255,255,${0.75 - a * 0.5})`;
  for (let i = 0; i < 16; i++) { const wx = r() * 8000 - 1200, wy = -r() * 3600 + 200, par = 0.5; const cx2 = (wx - cam.x * par) * K + W / 2, cy2 = (wy - cam.y * par) * K + H / 2; const wrap = (((cx2 % (W + 400)) + (W + 400)) % (W + 400)) - 200; ctx.beginPath(); ctx.ellipse(wrap, cy2, 70 * K, 22 * K, 0, 0, 6.3); ctx.ellipse(wrap + 40 * K, cy2 - 12 * K, 46 * K, 20 * K, 0, 0, 6.3); ctx.ellipse(wrap - 40 * K, cy2 - 6 * K, 40 * K, 18 * K, 0, 0, 6.3); ctx.fill(); }
}
function rockGrad() {
  const g = ctx.createLinearGradient(0, sy(0), 0, sy(-4000)); g.addColorStop(0, '#7a6440'); g.addColorStop(0.3, '#6e6a5a'); g.addColorStop(0.6, '#7c8190'); g.addColorStop(1, '#e7eef7'); return g;
}
function drawTerrain() {
  const g = rockGrad(); ctx.lineJoin = 'round';
  for (const pl of polys) {
    const b = pl.bb; if (sx(b[2]) < -20 || sx(b[0]) > W + 20 || sy(b[3]) < -20 || sy(b[1]) > H + 20) continue;
    ctx.beginPath(); pl.pts.forEach((p, i) => (i ? ctx.lineTo(sx(p[0]), sy(p[1])) : ctx.moveTo(sx(p[0]), sy(p[1])))); ctx.closePath();
    ctx.fillStyle = g; ctx.fill();
    ctx.save(); ctx.clip(); ctx.translate(-cam.x * K % 256, -cam.y * K % 256); ctx.scale(K, K); ctx.fillStyle = rockPat; ctx.fillRect(-300, -300, (W + 600) / K, (H + 600) / K); ctx.restore();
    ctx.strokeStyle = 'rgba(20,16,10,.8)'; ctx.lineWidth = 3 * K; ctx.stroke();
    // grass / snow on up-facing edges
    const n = pl.pts.length, sgn = pl.area > 0 ? 1 : -1;
    for (let i = 0; i < n; i++) {
      const a = pl.pts[i], c = pl.pts[(i + 1) % n], ex = c[0] - a[0], ey = c[1] - a[1], L = Math.hypot(ex, ey) || 1, nyy = (-sgn * ex) / L;
      if (nyy < -0.45 && L > 1) {
        const al = -a[1] / UNIT; ctx.strokeStyle = al < 70 ? '#4fa24a' : al < 140 ? '#8a9a6a' : '#f4f8ff'; ctx.lineWidth = 9 * K; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(sx(a[0]), sy(a[1]) - 1 * K); ctx.lineTo(sx(c[0]), sy(c[1]) - 1 * K); ctx.stroke();
      }
    }
  }
  // flag
  const fx = sx(flag.x), fy = sy(flag.y); ctx.strokeStyle = '#3b2a1a'; ctx.lineWidth = 5 * K; ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(fx, fy - 130 * K); ctx.stroke();
  ctx.fillStyle = '#ef4444'; ctx.beginPath(); ctx.moveTo(fx, fy - 130 * K); ctx.lineTo(fx + 70 * K, fy - 112 * K + Math.sin(performance.now() / 200) * 5 * K); ctx.lineTo(fx, fy - 92 * K); ctx.fill();
}
function drawHeadAt(c, r) {
  c.save(); c.beginPath(); c.arc(0, 0, r, 0, 6.3); c.clip();
  if (S.head.type === 'photo' && headImg) c.drawImage(headImg, -r, -r, 2 * r, 2 * r);
  else if (S.head.type === 'emoji') { c.fillStyle = S.skin; c.fillRect(-r, -r, 2 * r, 2 * r); c.font = `${r * 1.6}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(S.head.emoji, 0, r * 0.06); }
  else {
    c.fillStyle = S.skin; c.fillRect(-r, -r, 2 * r, 2 * r); c.fillStyle = '#5b3a22'; c.beginPath(); c.arc(0, r * 0.25, r * 0.95, 0.15, Math.PI - 0.15); c.fill(); c.fillStyle = S.skin; c.beginPath(); c.arc(0, r * 0.08, r * 0.62, 0, 6.3); c.fill();
    c.fillStyle = '#222'; c.beginPath(); c.arc(-r * 0.3, -r * 0.1, r * 0.1, 0, 6.3); c.arc(r * 0.3, -r * 0.1, r * 0.1, 0, 6.3); c.fill(); c.strokeStyle = '#222'; c.lineWidth = r * 0.1; c.beginPath(); c.arc(0, r * 0.25, r * 0.22, 0.2, Math.PI - 0.2); c.stroke();
  }
  c.restore(); c.strokeStyle = 'rgba(20,10,10,.9)'; c.lineWidth = Math.max(2, r * 0.14); c.beginPath(); c.arc(0, 0, r, 0, 6.3); c.stroke();
}
function drawHammerHead() {
  ctx.fillStyle = '#9aa0aa'; ctx.strokeStyle = '#1f2330'; ctx.lineWidth = 2; ctx.lineJoin = 'round';
  if (S.hammer === 'sledge') { ctx.beginPath(); ctx.rect(-10, -21, 20, 42); ctx.fill(); ctx.stroke(); }
  else if (S.hammer === 'pick') { ctx.lineWidth = 7; ctx.strokeStyle = '#1f2330'; ctx.beginPath(); ctx.moveTo(-6, -30); ctx.quadraticCurveTo(10, 0, -6, 30); ctx.stroke(); ctx.lineWidth = 4.5; ctx.strokeStyle = '#aab1bd'; ctx.stroke(); }
  else if (S.hammer === 'axe') { ctx.beginPath(); ctx.moveTo(-6, -4); ctx.lineTo(-10, 26); ctx.quadraticCurveTo(8, 18, 6, -4); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#6b4a2a'; ctx.fillRect(-6, -6, 12, 6); }
  else { ctx.fillStyle = '#b07a3f'; ctx.beginPath(); ctx.ellipse(6, 0, 13, 15, 0, 0, 6.3); ctx.fill(); ctx.stroke(); }
}
function drawPlayer() {
  const x = sx(px), y = sy(py), k = K; ctx.save(); ctx.translate(x, y); ctx.scale(k, k);
  const L = hamLen(), c = Math.cos(th), s = Math.sin(th), shy = SH;
  // torso + arms
  ctx.fillStyle = S.skin; ctx.strokeStyle = 'rgba(20,10,10,.9)'; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.roundRect(-13, -50, 26, 34, 8); ctx.fill(); ctx.stroke();
  // pot
  const g = ctx.createRadialGradient(-8, -8, 4, 0, 0, R * 1.1); g.addColorStop(0, '#9aa3b2'); g.addColorStop(0.25, S.pot); g.addColorStop(1, '#14161d');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, R, 0, 6.3); ctx.fill(); ctx.lineWidth = 3; ctx.stroke();
  ctx.fillStyle = '#2a2d36'; ctx.beginPath(); ctx.ellipse(0, -R * 0.62, R * 0.86, R * 0.26, 0, 0, 6.3); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = '#1b1d24'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(-R, -4, 6, -1.4, 1.4, true); ctx.moveTo(R, -10); ctx.arc(R, -4, 6, -1.6, 1.4); ctx.stroke();
  // head
  const head = () => { ctx.save(); ctx.translate(0, -54 + Math.sin(performance.now() / 400) * 0.6); drawHeadAt(ctx, 14); ctx.restore(); };
  head();
  // arm + handle + hammer
  const hx = c * L * 0.28, hy = shy + s * L * 0.28;
  ctx.strokeStyle = 'rgba(20,10,10,.9)'; ctx.lineWidth = 11; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(0, shy); ctx.lineTo(hx, hy); ctx.stroke();
  ctx.strokeStyle = S.skin; ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(0, shy); ctx.lineTo(hx, hy); ctx.stroke();
  ctx.strokeStyle = '#1f1408'; ctx.lineWidth = 9; ctx.beginPath(); ctx.moveTo(c * -10, shy - s * 10); ctx.lineTo(c * L, shy + s * L); ctx.stroke();
  ctx.strokeStyle = '#8a5a2b'; ctx.lineWidth = 5.5; ctx.stroke();
  ctx.fillStyle = S.skin; ctx.strokeStyle = 'rgba(20,10,10,.9)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(hx, hy, 5.5, 0, 6.3); ctx.fill(); ctx.stroke();
  ctx.save(); ctx.translate(c * L, shy + s * L); ctx.rotate(th); drawHammerHead(); ctx.restore();
  ctx.restore();
}
function draw() {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0); drawSky(); drawTerrain(); drawPlayer();
  // aim hint
  if (!started && !paused) { ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.setLineDash([6, 8]); ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(mx, my, 14, 0, 6.3); ctx.stroke(); ctx.setLineDash([]); }
}

// ------------------------------------------------------------ hud
const TOASTS_FALL = ['Ouch.', 'That looked painful.', 'Gravity: 1 — You: 0', 'The mountain does not care.', 'So close, too.', 'Nice try!', 'Again?', 'Well. That happened.'];
let toastT = 0;
function toast(t, ms) { const e = $('toast'); e.textContent = t; e.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => e.classList.remove('on'), ms || 2200); }
const fmtT = (ms) => { const s = Math.floor(ms / 1000); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
let saveCD = 0;
function hud(dt) {
  alt = Math.max(0, Math.round((-(py + R)) / UNIT * 10) / 10 * 1); alt = Math.max(0, (-py - R) / UNIT);
  const mAlt = Math.floor(alt); $('alt').textContent = mAlt;
  if (alt > bestAlt) { bestAlt = Math.floor(alt); saveCD = 1; } $('best').textContent = bestAlt;
  const tot = (-END_Y) / UNIT;
  $('mfill').style.height = clamp(alt / tot, 0, 1) * 100 + '%'; $('mbest').style.bottom = clamp(bestAlt / tot, 0, 1) * 100 + '%';
  if (saveCD > 0) { saveCD -= dt; if (saveCD <= 0) { try { localStorage.setItem(BK, String(bestAlt)); } catch (e) { /* ignore */ } } }
  if (started && !won) { runT += dt * 1000; $('time').textContent = fmtT(runT); }
  // falls
  if (alt > peakAlt) peakAlt = alt;
  if (impactV > 900 && peakAlt - alt > 7) { falls++; $('falls').textContent = falls; const drop = Math.round(peakAlt - alt); toast(drop > 40 ? 'WOW. −' + drop + ' m' : TOASTS_FALL[(Math.random() * TOASTS_FALL.length) | 0] + ' −' + drop + ' m', 2600); peakAlt = alt; }
  impactV = 0;
  const sp = Math.hypot(vx, vy); still = sp < 60 ? still + dt : 0; if (still > 1.2) peakAlt = alt;
  const camp = Math.floor(alt / 40); if (camp > camps && camp < 5) { camps = camp; toast('⛺ Camp ' + camp + ' · ' + Math.floor(alt) + ' m', 2200); }
  // win
  if (!won && Math.hypot(px - flag.x, py - (flag.y - R)) < 110) win();
}
function win() {
  won = true; const t = runT; let nb = !bestTime || t < bestTime; if (nb) { bestTime = Math.round(t); try { localStorage.setItem(TK, String(bestTime)); localStorage.setItem(BK, String(Math.floor((-END_Y) / UNIT))); } catch (e) { /* ignore */ } }
  bestAlt = Math.max(bestAlt, Math.floor((-END_Y) / UNIT)); try { localStorage.setItem(BK, String(bestAlt)); } catch (e) { /* ignore */ }
  $('winSub').textContent = `Summit in ${fmtT(t)} · ${falls} fall${falls === 1 ? '' : 's'}` + (nb ? ' · new best time!' : ` · best ${fmtT(bestTime)}`);
  tone('triangle', 440, 880, 0.5, 0.3); setTimeout(() => $('win').classList.remove('hidden'), 900);
}

// ------------------------------------------------------------ input + loop
function setTarget(e) { const r = cv.getBoundingClientRect(); mx = e.clientX - r.left; my = e.clientY - r.top; }
cv.addEventListener('pointermove', (e) => { setTarget(e); if (!paused && !started && Math.hypot(e.movementX || 1, e.movementY || 1) > 0) started = true; });
cv.addEventListener('pointerdown', (e) => { actx(); setTarget(e); cv.setPointerCapture(e.pointerId); if (!paused) started = true; });
addEventListener('keydown', (e) => { if (e.key === 'r' || e.key === 'R') restart(); if (e.key === 'Escape') { $('panel').classList.add('hidden'); } });
let last = 0, acc = 0;
function frame(now) {
  const dtf = Math.min(0.05, (now - (last || now)) / 1000); last = now;
  if (!paused) {
    acc += dtf; const DT = 1 / 240; let n = 0;
    const shx = sx(px), shy = sy(py + SH);
    if (bot) tgt = bot(now); else tgt = Math.atan2(my - shy, mx - shx);
    while (acc >= DT && n < 12) { stepPhys(DT); acc -= DT; n++; } if (acc > DT) acc = 0;
    hud(dtf);
  }
  const tx = px, ty = py - 50 + (vy > 300 ? 40 : 0); cam.x += (tx - cam.x) * Math.min(1, dtf * 5); cam.y += (ty - cam.y) * Math.min(1, dtf * 5);
  draw(); requestAnimationFrame(frame);
}
function restart() { resetPlayer(); $('win').classList.add('hidden'); }

// ------------------------------------------------------------ UI
function drawFacePv() { const c = $('facePv').getContext('2d'); c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, 96, 96); c.save(); c.translate(48, 48); drawHeadAt(c, 40); c.restore(); }
function setHead(h) { S.head = Object.assign({}, S.head, h); saveS(); loadHeadImg(); syncUI(); }
function syncUI() {
  document.querySelectorAll('#emojis button').forEach((b) => b.classList.toggle('on', S.head.type === 'emoji' && b.textContent === S.head.emoji));
  const mark = (id, key, num) => document.querySelectorAll('#' + id + ' button').forEach((b) => b.classList.toggle('on', (num ? +b.dataset.v : b.dataset.v) === S[key]));
  mark('hammers', 'hammer'); mark('lens', 'len'); mark('grips', 'grip'); mark('speeds', 'speed'); mark('gravs', 'grav', true);
  $('potC').value = S.pot; $('skinC').value = S.skin; $('sound').checked = !S.muted; drawFacePv();
}
(function init() {
  const eg = $('emojis'); EMOJIS.forEach((e) => { const b = document.createElement('button'); b.textContent = e; b.addEventListener('click', () => setHead({ type: 'emoji', emoji: e })); eg.appendChild(b); });
  const hm = $('hammers'); Object.keys(HAMMERS).forEach((k) => { const b = document.createElement('button'); b.dataset.v = k; b.textContent = HAMMERS[k].n; hm.appendChild(b); });
  const bind = (id, key, restartIt, num) => $(id).addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; S[key] = num ? +b.dataset.v : b.dataset.v; saveS(); syncUI(); if (restartIt) restart(); });
  bind('hammers', 'hammer', true); bind('lens', 'len', true); bind('grips', 'grip', false); bind('speeds', 'speed', false); bind('gravs', 'grav', true, true);
  $('faceDef').addEventListener('click', () => setHead({ type: 'face' }));
  $('headFile').addEventListener('change', (e) => {
    const f = e.target.files && e.target.files[0]; if (!f) return; const url = URL.createObjectURL(f), im = new Image();
    im.onload = () => { const c = document.createElement('canvas'); c.width = c.height = 200; const m = Math.min(im.width, im.height); c.getContext('2d').drawImage(im, (im.width - m) / 2, (im.height - m) / 2, m, m, 0, 0, 200, 200); URL.revokeObjectURL(url); setHead({ type: 'photo', img: c.toDataURL('image/jpeg', 0.85) }); };
    im.src = url; e.target.value = '';
  });
  $('potC').addEventListener('input', (e) => { S.pot = e.target.value; saveS(); }); $('skinC').addEventListener('input', (e) => { S.skin = e.target.value; saveS(); drawFacePv(); });
  $('sound').addEventListener('change', (e) => { S.muted = !e.target.checked; saveS(); });
  const open = () => { $('panel').classList.remove('hidden'); }; const close = () => { $('panel').classList.add('hidden'); };
  $('setBtn').addEventListener('click', open); $('introSet').addEventListener('click', open); $('closePanel').addEventListener('click', close); $('doneBtn').addEventListener('click', close);
  $('panel').addEventListener('pointerdown', (e) => { if (e.target === $('panel')) close(); });
  $('startBtn').addEventListener('click', () => { actx(); $('intro').classList.add('hidden'); paused = false; });
  $('resetBtn').addEventListener('click', restart); $('againBtn').addEventListener('click', restart); $('winClose').addEventListener('click', () => $('win').classList.add('hidden'));
})();
buildLevel(); loadHeadImg(); syncUI(); resize(); makePat(); addEventListener('resize', resize); resetPlayer(); requestAnimationFrame(frame);
if (location.search.includes('debug')) window.__pp = { get pos() { return [px, py]; }, get vel() { return [vx, vy]; }, get th() { return th; }, get alt() { return alt; }, get falls() { return falls; }, get polys() { return polys; }, get flag() { return flag; }, S, start() { paused = false; started = true; $('intro').classList.add('hidden'); }, setBot(f) { bot = f; }, teleport(x, y) { px = x; py = y; vx = vy = 0; }, stepPhys, win, near, get won() { return won; } };
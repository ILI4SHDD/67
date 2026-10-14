// ============================================================
//  BULLSEYE BLITZ : a fairground shooting gallery
// ============================================================
const cvs = document.getElementById('game');
const ctx = cvs.getContext('2d');
const $ = (id) => document.getElementById(id);
const W = 1280, H = 720;
let scale = 1, ox = 0, oy = 0, dpr = 1;
const LANES = [230, 365, 500];
const LDIR = [1, -1, 1];
const COUNTER_Y = 588;
const GAME_TIME = 60, MAG = 6, RELOAD_T = 1.0;
const FONT = "'Oswald', 'Arial Narrow', Impact, sans-serif";

function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  const vw = window.innerWidth, vh = window.innerHeight;
  cvs.width = Math.floor(vw * dpr); cvs.height = Math.floor(vh * dpr);
  scale = Math.min(vw / W, vh / H);
  ox = (vw - W * scale) / 2; oy = (vh - H * scale) / 2;
}
window.addEventListener('resize', resize);
resize();

// ---------- storage ----------
const BEST_KEY = 'bullseye-best';
function readBest() { try { return parseInt(localStorage.getItem(BEST_KEY) || '0', 10) || 0; } catch (e) { return 0; } }
function writeBest(v) { try { localStorage.setItem(BEST_KEY, String(v)); } catch (e) { /* ignore */ } }
let best = readBest();
$('bestMenu').textContent = best.toLocaleString('en-US');

// ---------- audio ----------
let ac = null, muted = false, noiseBuf = null;
function audio() {
  if (!ac) {
    try {
      ac = new (window.AudioContext || window.webkitAudioContext)();
      noiseBuf = ac.createBuffer(1, ac.sampleRate * 0.5, ac.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    } catch (e) { ac = null; }
  }
  if (ac && ac.state === 'suspended') ac.resume();
  return ac;
}
function tone(f, d, type = 'sine', v = 0.15, at = 0, f2) {
  if (muted || !audio()) return;
  const t = ac.currentTime + at, o = ac.createOscillator(), g = ac.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t);
  if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + d);
  g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.001, t + d);
  o.connect(g).connect(ac.destination); o.start(t); o.stop(t + d + 0.02);
}
function noise(d, v = 0.2, hp = 800, at = 0) {
  if (muted || !audio()) return;
  const t = ac.currentTime + at, s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
  s.buffer = noiseBuf; f.type = 'highpass'; f.frequency.value = hp;
  g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.001, t + d);
  s.connect(f).connect(g).connect(ac.destination); s.start(t); s.stop(t + d + 0.02);
}
const sfx = {
  shot: () => { noise(0.18, 0.28, 500); tone(160, 0.14, 'square', 0.12, 0, 50); },
  hit: () => { tone(1500, 0.12, 'triangle', 0.14, 0, 900); tone(2300, 0.08, 'sine', 0.06); },
  bull: () => { tone(1500, 0.12, 'triangle', 0.14, 0, 900); tone(1318, 0.12, 'square', 0.07, 0.06); tone(1760, 0.22, 'square', 0.07, 0.12); },
  pop: () => { noise(0.1, 0.2, 1500); tone(500, 0.08, 'sine', 0.1, 0, 200); },
  boom: () => { noise(0.5, 0.3, 80); tone(110, 0.5, 'sawtooth', 0.2, 0, 35); },
  dry: () => tone(240, 0.04, 'square', 0.08),
  reload: () => { tone(300, 0.05, 'square', 0.1); tone(460, 0.05, 'square', 0.1, 0.5); tone(700, 0.07, 'square', 0.1, 0.92); },
  bonus: () => [660, 880, 1175].forEach((f, i) => tone(f, 0.12, 'triangle', 0.14, i * 0.07)),
  tick: () => tone(900, 0.05, 'square', 0.05),
  end: () => { tone(400, 0.5, 'sawtooth', 0.12, 0, 120); },
};

// ---------- state ----------
const G = {
  state: 'menu', score: 0, time: GAME_TIME, elapsed: 0, ammo: MAG, reload: 0, cool: 0, combo: 0, bestCombo: 0,
  shots: 0, hits: 0, dbl: 0, shake: 0, flash: 0, redFlash: 0, recoil: 0, muzzle: 0, aim: { x: W / 2, y: 300 },
  tLane: [0.3, 0.9, 1.5], tBird: 2.5, tBalloon: 1.2, lastSec: -1, pointer: { x: W / 2, y: 300, on: false, touch: false },
};
let targets = [], parts = [], floats = [], holes = [];
const rnd = (a, b) => a + Math.random() * (b - a);
const BALLOON_COLORS = ['#ff5d8f', '#3b82f6', '#22c55e', '#a855f7', '#ff8a3d', '#ffd23f'];

// ---------- spawning ----------
function pickLaneType() {
  if (G.state !== 'play') return 'disc';
  const bomb = 0.08 + Math.min(G.elapsed / 60, 1) * 0.09, r = Math.random();
  if (r < bomb) return 'bomb';
  if (r < bomb + 0.04) return 'clock';
  if (r < bomb + 0.08) return 'star';
  return 'disc';
}
function spawnLane(li, type) {
  type = type || pickLaneType();
  const dir = LDIR[li], r = type === 'disc' ? 38 : 30;
  const sp = (105 + Math.min(G.elapsed, 60) * 1.4 + rnd(0, 50)) * (1 + li * 0.07);
  targets.push({ type, x: dir > 0 ? -r - 12 : W + r + 12, y: LANES[li], vx: dir * sp, vy: 0, r, age: Math.random() * 5, li });
}
function spawnBird() {
  const dir = Math.random() < 0.5 ? 1 : -1, sp = rnd(250, 330) + Math.min(G.elapsed, 60) * 1.5;
  targets.push({ type: 'bird', x: dir > 0 ? -50 : W + 50, y: rnd(100, 150), by: rnd(100, 150), vx: dir * sp, vy: 0, r: 30, age: 0, ph: rnd(0, 6) });
}
function spawnBalloon() {
  targets.push({ type: 'balloon', x: rnd(120, W - 120), y: 640, bx: 0, vx: 0, vy: -rnd(95, 150), r: 31, age: 0, ph: rnd(0, 6), c: BALLOON_COLORS[Math.floor(Math.random() * BALLOON_COLORS.length)] });
  targets[targets.length - 1].bx = targets[targets.length - 1].x;
}

// ---------- fx ----------
function burst(x, y, n, cols, sp = 260, g = 500, size = 5) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, s = rnd(0.2, 1) * sp;
    parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 60, life: rnd(0.4, 0.9), max: 0.9, c: cols[i % cols.length], s: rnd(2, size), g });
  }
}
function floater(x, y, text, color = '#fff6e0', big = false) { floats.push({ x, y, text, color, life: 1, big }); }
function shake(n) { G.shake = Math.max(G.shake, n); }

// ---------- game flow ----------
function startGame() {
  audio();
  Object.assign(G, { state: 'play', score: 0, time: GAME_TIME, elapsed: 0, ammo: MAG, reload: 0, cool: 0, combo: 0, bestCombo: 0, shots: 0, hits: 0, dbl: 0, lastSec: -1, tLane: [0.2, 0.7, 1.2], tBird: 2, tBalloon: 1 });
  targets = []; parts = []; floats = []; holes = [];
  ['menu', 'over', 'pause'].forEach((id) => $(id).classList.add('hidden'));
}
function endGame() {
  G.state = 'over'; sfx.end();
  const acc = G.shots ? Math.round((G.hits / G.shots) * 100) : 0;
  const isBest = G.score > best;
  if (isBest) { best = G.score; writeBest(best); }
  $('finalScore').textContent = G.score.toLocaleString('en-US');
  $('newBest').classList.toggle('hidden', !isBest);
  $('stAcc').textContent = acc + '%'; $('stHits').textContent = G.hits; $('stCombo').textContent = G.bestCombo;
  $('bestOver').textContent = best.toLocaleString('en-US'); $('bestMenu').textContent = best.toLocaleString('en-US');
  const rank = G.score >= 6000 ? '🏆 LEGENDARY SHARPSHOOTER' : G.score >= 3500 ? '🎯 Sharpshooter' : G.score >= 1800 ? '⭐ Marksman' : G.score >= 700 ? '🤠 Rookie' : '🎪 Keep practicing!';
  $('rank').textContent = rank;
  setTimeout(() => { if (G.state === 'over') $('over').classList.remove('hidden'); }, 700);
}
function setPause(p) {
  if (p && G.state === 'play') { G.state = 'pause'; $('pause').classList.remove('hidden'); }
  else if (!p && G.state === 'pause') { G.state = 'play'; $('pause').classList.add('hidden'); }
}
function startReload() {
  if (G.reload > 0 || G.ammo >= MAG || G.state !== 'play') return;
  G.reload = RELOAD_T; sfx.reload();
}

// ---------- shooting ----------
function shoot(x, y) {
  if (G.state !== 'play') return;
  if (y > COUNTER_Y) {
    if (x > 740 && x < 960 && y > 610) startReload();
    return;
  }
  G.aim = { x, y };
  if (G.reload > 0 || G.ammo <= 0) { if (G.reload <= 0) startReload(); sfx.dry(); return; }
  if (G.cool > 0) return;
  G.cool = 0.1; G.ammo--; G.shots++; G.recoil = 1; G.muzzle = 0.07;
  sfx.shot(); shake(3);
  let hit = null;
  for (let i = targets.length - 1; i >= 0; i--) {
    const t = targets[i];
    if (t.y < COUNTER_Y - 4 && Math.hypot(x - t.x, y - t.y) <= t.r + 4) { hit = t; break; }
  }
  if (hit) onHit(hit, x, y);
  else {
    G.combo = 0; holes.push({ x, y, a: 1 });
    if (holes.length > 40) holes.shift();
    burst(x, y, 5, ['#d9b98a', '#8a5a2b'], 120, 300, 3);
  }
  if (G.ammo <= 0) startReload();
}
function addScore(base, x, y, label) {
  G.combo++; G.bestCombo = Math.max(G.bestCombo, G.combo); G.hits++;
  const mult = Math.min(5, 1 + Math.floor(G.combo / 4));
  const pts = base * mult * (G.dbl > 0 ? 2 : 1);
  G.score += pts;
  floater(x, y - 10, (label ? label + ' ' : '') + '+' + pts, G.dbl > 0 ? '#ffc83a' : '#fff6e0', base >= 100);
}
function onHit(t, x, y) {
  targets.splice(targets.indexOf(t), 1);
  switch (t.type) {
    case 'disc': {
      const d = Math.hypot(x - t.x, y - t.y) / t.r;
      const base = d < 0.22 ? 100 : d < 0.48 ? 50 : 25;
      addScore(base, t.x, t.y, base === 100 ? 'BULLSEYE!' : '');
      base === 100 ? sfx.bull() : sfx.hit();
      burst(t.x, t.y, base === 100 ? 22 : 12, ['#d83a3a', '#fff6e0', '#ffc83a'], 280);
      if (base === 100) shake(5);
      break;
    }
    case 'bird':
      addScore(75, t.x, t.y); sfx.hit();
      burst(t.x, t.y, 18, ['#35c6b8', '#1f8f85', '#c8d2d8', '#ff9b3a'], 300, 700);
      break;
    case 'balloon':
      addScore(30, t.x, t.y); sfx.pop();
      burst(t.x, t.y, 16, [t.c, '#fff6e0'], 260, 400);
      break;
    case 'clock':
      addScore(0, t.x, t.y); G.time = Math.min(G.time + 4, 99); sfx.bonus();
      floater(t.x, t.y - 10, '+4 SEC', '#7ff0e6', true); burst(t.x, t.y, 14, ['#7ff0e6', '#fff'], 260, 200);
      break;
    case 'star':
      addScore(0, t.x, t.y); G.dbl = 8; sfx.bonus();
      floater(t.x, t.y - 10, '×2 POINTS!', '#ffc83a', true); burst(t.x, t.y, 20, ['#ffc83a', '#fff6e0'], 320, 200);
      break;
    case 'bomb':
      G.score = Math.max(0, G.score - 100); G.time = Math.max(0, G.time - 3); G.combo = 0; G.redFlash = 1;
      floater(t.x, t.y - 10, 'BOOM! −100  −3s', '#ff6a5a', true); sfx.boom(); shake(16);
      burst(t.x, t.y, 36, ['#ff9b3a', '#ffd23f', '#555', '#ff3b3b'], 420, 300, 7);
      break;
  }
}

// ---------- update ----------
function update(dt) {
  const play = G.state === 'play', demo = G.state === 'menu' || G.state === 'over';
  if (G.state === 'pause') return;
  if (play) {
    G.elapsed += dt; G.time -= dt;
    G.cool = Math.max(0, G.cool - dt); G.dbl = Math.max(0, G.dbl - dt);
    if (G.reload > 0) { G.reload -= dt; if (G.reload <= 0) { G.reload = 0; G.ammo = MAG; } }
    const sec = Math.ceil(G.time);
    if (sec !== G.lastSec) { G.lastSec = sec; if (sec <= 5 && sec > 0) sfx.tick(); }
    if (G.time <= 0) { G.time = 0; endGame(); }
  }
  if (play || demo) {
    const sp = 1 + (play ? G.elapsed / 80 : 0);
    for (let i = 0; i < 3; i++) { G.tLane[i] -= dt; if (G.tLane[i] <= 0) { spawnLane(i); G.tLane[i] = (play ? rnd(0.8, 1.7) / sp : rnd(1.1, 2)); } }
    G.tBird -= dt; if (G.tBird <= 0) { spawnBird(); G.tBird = rnd(2.3, 4.2) / (play ? sp : 1); }
    G.tBalloon -= dt; if (G.tBalloon <= 0) { spawnBalloon(); G.tBalloon = rnd(1.2, 2.4) / (play ? sp : 1); }
  }
  for (const t of targets) {
    t.age += dt; t.x += t.vx * dt;
    if (t.type === 'bird') t.y = t.by + Math.sin(t.age * 3 + t.ph) * 28;
    else if (t.type === 'balloon') { t.y += t.vy * dt; t.x = t.bx + Math.sin(t.age * 2 + t.ph) * 26; }
  }
  targets = targets.filter((t) => t.x > -90 && t.x < W + 90 && t.y > -60 && t.y < 700);
  for (const p of parts) { p.life -= dt; p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; }
  parts = parts.filter((p) => p.life > 0);
  for (const f of floats) { f.life -= dt * 0.9; f.y -= 46 * dt; }
  floats = floats.filter((f) => f.life > 0);
  for (const h of holes) h.a -= dt * 0.12;
  holes = holes.filter((h) => h.a > 0);
  G.shake = Math.max(0, G.shake - dt * 30); G.redFlash = Math.max(0, G.redFlash - dt * 2.2);
  G.recoil = Math.max(0, G.recoil - dt * 7); G.muzzle = Math.max(0, G.muzzle - dt);
}

// ---------- static scenery (cached) ----------
function makeScene() {
  const bg = document.createElement('canvas'); bg.width = W; bg.height = H;
  const c = bg.getContext('2d');
  // wall
  const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#7a4524'); g.addColorStop(1, '#4a2410');
  c.fillStyle = g; c.fillRect(0, 0, W, H);
  for (let x = 0; x < W; x += 64) { c.fillStyle = 'rgba(0,0,0,0.18)'; c.fillRect(x, 0, 3, H); c.fillStyle = 'rgba(255,220,160,0.05)'; c.fillRect(x + 3, 0, 5, H); }
  // lane panels + rails
  LANES.forEach((y, i) => {
    const top = y - 62, h = 112;
    const pg = c.createLinearGradient(0, top, 0, top + h);
    pg.addColorStop(0, i % 2 ? 'rgba(255,200,120,0.20)' : 'rgba(255,230,180,0.26)'); pg.addColorStop(1, 'rgba(255,200,120,0.06)');
    c.fillStyle = pg; c.fillRect(70, top, W - 140, h);
    c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(70, top + h, W - 140, 6);
    c.fillStyle = '#9aa0aa'; c.fillRect(70, y - 56, W - 140, 7);
    c.fillStyle = '#d9dde3'; c.fillRect(70, y - 56, W - 140, 2);
  });
  // awning
  const stripes = 16, sw = W / stripes;
  for (let i = 0; i < stripes; i++) {
    c.fillStyle = i % 2 ? '#fff6e0' : '#d83a3a'; c.fillRect(i * sw, 0, sw, 54);
    c.beginPath(); c.arc(i * sw + sw / 2, 54, sw / 2, 0, Math.PI); c.fill();
  }
  c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(0, 50, W, 4);
  // curtains
  [[0, 1], [W, -1]].forEach(([x0, d]) => {
    const cg = c.createLinearGradient(x0, 0, x0 + d * 110, 0); cg.addColorStop(0, '#6e0f1c'); cg.addColorStop(1, '#a31d2d');
    c.fillStyle = cg; c.beginPath(); c.moveTo(x0, 0); c.lineTo(x0 + d * 78, 0); c.quadraticCurveTo(x0 + d * 40, 330, x0 + d * 84, COUNTER_Y); c.lineTo(x0, COUNTER_Y); c.fill();
    c.strokeStyle = 'rgba(0,0,0,0.3)'; c.lineWidth = 3;
    for (let k = 1; k < 4; k++) { c.beginPath(); c.moveTo(x0 + d * k * 18, 40); c.quadraticCurveTo(x0 + d * (k * 10), 330, x0 + d * (k * 18 + 6), COUNTER_Y); c.stroke(); }
  });
  // vignette
  const v = c.createRadialGradient(W / 2, H / 2, 260, W / 2, H / 2, 800); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.45)');
  c.fillStyle = v; c.fillRect(0, 0, W, H);

  // foreground counter
  const fg = document.createElement('canvas'); fg.width = W; fg.height = H;
  const f = fg.getContext('2d');
  const cg2 = f.createLinearGradient(0, COUNTER_Y, 0, H); cg2.addColorStop(0, '#8a5226'); cg2.addColorStop(0.08, '#6b3a18'); cg2.addColorStop(1, '#2e1608');
  f.fillStyle = cg2; f.fillRect(0, COUNTER_Y, W, H - COUNTER_Y);
  f.fillStyle = '#c98b4a'; f.fillRect(0, COUNTER_Y - 6, W, 10); f.fillStyle = 'rgba(255,230,170,0.5)'; f.fillRect(0, COUNTER_Y - 6, W, 2);
  f.strokeStyle = 'rgba(0,0,0,0.25)'; f.lineWidth = 2;
  for (let y = COUNTER_Y + 36; y < H; y += 36) { f.beginPath(); f.moveTo(0, y); f.lineTo(W, y); f.stroke(); }
  // plaques
  const plaque = (x, y, w, h) => { f.fillStyle = '#2a1209'; f.strokeStyle = '#ffc83a'; f.lineWidth = 3; rr(f, x, y, w, h, 12); f.fill(); f.stroke(); };
  plaque(36, 614, 330, 90); plaque(930, 614, 314, 90); plaque(752, 628, 188, 66);
  return { bg, fg };
}
function rr(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
const scene = makeScene();

// ---------- drawing ----------
function drawTarget(t) {
  ctx.save(); ctx.translate(t.x, t.y);
  const r = t.r;
  switch (t.type) {
    case 'disc': case 'bomb': case 'clock': case 'star': {
      ctx.strokeStyle = '#7d838d'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(0, -r); ctx.lineTo(0, -56); ctx.stroke();
      ctx.fillStyle = '#c9ced6'; ctx.beginPath(); ctx.arc(0, -56, 8, 0, 7); ctx.fill();
      ctx.lineWidth = 3; ctx.strokeStyle = '#3a1d0e';
      if (t.type === 'disc') {
        [[r, '#d83a3a'], [r * 0.74, '#fff6e0'], [r * 0.48, '#d83a3a'], [r * 0.22, '#ffc83a']].forEach(([rad, col], i) => {
          ctx.fillStyle = col; ctx.beginPath(); ctx.arc(0, 0, rad, 0, 7); ctx.fill(); if (i === 0) ctx.stroke();
        });
      } else if (t.type === 'bomb') {
        ctx.fillStyle = '#1b1b24'; ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.fill();
        ctx.strokeStyle = '#ff3b3b'; ctx.lineWidth = 4; ctx.setLineDash([8, 6]); ctx.lineDashOffset = -t.age * 20; ctx.beginPath(); ctx.arc(0, 0, r + 5, 0, 7); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.beginPath(); ctx.ellipse(-9, -10, 8, 5, -0.6, 0, 7); ctx.fill();
        ctx.fillStyle = '#ff3b3b'; ctx.font = `700 26px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('✕', 0, 3);
        ctx.strokeStyle = '#cfa56a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(8, -r + 2); ctx.quadraticCurveTo(14, -r - 12, 24, -r - 8); ctx.stroke();
        ctx.fillStyle = Math.sin(t.age * 30) > 0 ? '#ffd23f' : '#ff7a2a'; ctx.beginPath(); ctx.arc(25, -r - 9, 5 + Math.sin(t.age * 40) * 1.5, 0, 7); ctx.fill();
      } else if (t.type === 'clock') {
        ctx.fillStyle = '#fff'; ctx.strokeStyle = '#35c6b8'; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(0, 0, r - 2, 0, 7); ctx.fill(); ctx.stroke();
        ctx.strokeStyle = '#1c1b29'; ctx.lineWidth = 3; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(t.age * 6) * 15, Math.sin(t.age * 6) * 15); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(t.age * 0.5) * 9, Math.sin(t.age * 0.5) * 9); ctx.stroke();
        ctx.fillStyle = '#35c6b8'; ctx.font = `700 11px ${FONT}`; ctx.textAlign = 'center'; ctx.fillText('+4s', 0, 22);
      } else {
        ctx.rotate(Math.sin(t.age * 3) * 0.3); ctx.fillStyle = '#ffc83a'; ctx.strokeStyle = '#a06a10'; ctx.lineWidth = 4;
        ctx.beginPath();
        for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, rad = i % 2 ? r * 0.48 : r * 1.08; ctx.lineTo(Math.cos(a) * rad, Math.sin(a) * rad); }
        ctx.closePath(); ctx.fill(); ctx.stroke();
      }
      break;
    }
    case 'bird': {
      const d = Math.sign(t.vx) || 1; ctx.scale(d, 1);
      ctx.strokeStyle = '#3a1d0e'; ctx.lineWidth = 3;
      ctx.fillStyle = '#1f8f85'; ctx.beginPath(); ctx.moveTo(-20, 0); ctx.lineTo(-40, -12); ctx.lineTo(-38, 8); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#35c6b8'; ctx.beginPath(); ctx.ellipse(0, 0, 27, 17, 0, 0, 7); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#bff3ee'; ctx.beginPath(); ctx.ellipse(2, 7, 18, 8, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#ff9b3a'; ctx.beginPath(); ctx.moveTo(24, -3); ctx.lineTo(40, 2); ctx.lineTo(24, 7); ctx.closePath(); ctx.fill(); ctx.stroke();
      const fl = Math.sin(t.age * 22) * 20;
      ctx.fillStyle = '#c8d2d8'; ctx.beginPath(); ctx.moveTo(-8, -4); ctx.lineTo(8, -4); ctx.lineTo(-6, -24 - fl * 0.6); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(14, -6, 5, 0, 7); ctx.fill(); ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(15.5, -6, 2.4, 0, 7); ctx.fill();
      ctx.fillStyle = '#7d838d'; [-10, 0, 10].forEach((x) => { ctx.beginPath(); ctx.arc(x, 8, 1.8, 0, 7); ctx.fill(); });
      break;
    }
    case 'balloon': {
      ctx.strokeStyle = 'rgba(255,246,224,0.8)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, r + 6);
      for (let i = 1; i <= 5; i++) ctx.lineTo(Math.sin(t.age * 5 + i) * 5, r + 6 + i * 9); ctx.stroke();
      ctx.fillStyle = t.c; ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(0, 0, r * 0.86, r, 0, 0, 7); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-5, r + 7); ctx.lineTo(5, r + 7); ctx.lineTo(0, r - 1); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.beginPath(); ctx.ellipse(-10, -12, 6, 10, 0.5, 0, 7); ctx.fill();
      break;
    }
  }
  ctx.restore();
}

function drawLights(time) {
  ctx.strokeStyle = '#2a1209'; ctx.lineWidth = 2; ctx.beginPath();
  for (let x = 0; x <= W; x += 8) { const y = 64 + Math.sin((x / W) * Math.PI * 6) * 4 + 6; x ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
  ctx.stroke();
  for (let i = 0; i < 24; i++) {
    const x = 30 + i * 53.5, y = 64 + Math.sin((x / W) * Math.PI * 6) * 4 + 14;
    const on = Math.sin(time * 3 + i * 1.3) > -0.3;
    ctx.fillStyle = on ? ['#ffe27a', '#ff7a7a', '#7ff0e6'][i % 3] : '#5a4a30';
    if (on) { ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 14; }
    ctx.beginPath(); ctx.arc(x, y, 5, 0, 7); ctx.fill(); ctx.shadowBlur = 0;
  }
}

function drawGun() {
  const px = W / 2, py = H + 24;
  const a = Math.atan2(G.aim.y - py, G.aim.x - px);
  ctx.save(); ctx.translate(px, py); ctx.rotate(a + Math.PI / 2 * 0);
  ctx.translate(-G.recoil * 14, 0);
  ctx.fillStyle = '#2b2f38'; ctx.strokeStyle = '#0d0f14'; ctx.lineWidth = 3;
  rr(ctx, 40, -9, 150, 18, 5); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#4a505c'; ctx.fillRect(60, -7, 120, 4);
  ctx.fillStyle = '#7a4a22'; rr(ctx, -70, -16, 120, 32, 8); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#c98b4a'; ctx.fillRect(-60, -12, 90, 5);
  ctx.fillStyle = '#d9dde3'; ctx.fillRect(184, -14, 6, 8);
  if (G.muzzle > 0) {
    ctx.fillStyle = '#fff3b0'; ctx.shadowColor = '#ffb000'; ctx.shadowBlur = 30;
    ctx.beginPath(); ctx.moveTo(190, 0); ctx.lineTo(225, -16); ctx.lineTo(214, 0); ctx.lineTo(225, 16); ctx.closePath(); ctx.fill(); ctx.shadowBlur = 0;
  }
  ctx.restore();
}

function text(s, x, y, size, color, align = 'left', weight = 700) {
  ctx.font = `${weight} ${size}px ${FONT}`; ctx.textAlign = align; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = color; ctx.fillText(s, x, y);
}

function drawHUD() {
  const play = G.state === 'play' || G.state === 'pause' || G.state === 'over';
  // score
  text('SCORE', 56, 640, 16, '#ffc83a'); text(G.score.toLocaleString('en-US'), 56, 690, 50, '#fff6e0');
  const mult = Math.min(5, 1 + Math.floor(G.combo / 4));
  if (G.combo > 0 && play) {
    text(`COMBO ${G.combo}`, 360, 640, 20, '#ffc83a', 'right');
    ctx.fillStyle = '#ff7a3a'; text(`×${mult}`, 360, 690, 42, mult > 1 ? '#ff9b3a' : '#fff6e0', 'right');
  }
  // time
  text('TIME', 952, 640, 16, '#ffc83a');
  const low = G.time <= 5 && G.state === 'play';
  text(String(Math.ceil(Math.max(0, G.time))), 952, 690, 50, low && Math.floor(G.time * 4) % 2 ? '#ff6a5a' : '#fff6e0');
  const tw = 170, frac = Math.max(0, Math.min(1, G.time / GAME_TIME));
  ctx.fillStyle = 'rgba(0,0,0,0.5)'; rr(ctx, 1050, 664, tw, 16, 8); ctx.fill();
  ctx.fillStyle = low ? '#ff6a5a' : '#ffc83a'; if (frac > 0) { rr(ctx, 1050, 664, tw * frac, 16, 8); ctx.fill(); }
  if (G.dbl > 0) { text(`×2  ${G.dbl.toFixed(1)}s`, 1244 - 14, 640, 20, '#ffc83a', 'right'); }
  // ammo
  for (let i = 0; i < MAG; i++) {
    const x = 776 + i * 27, have = i < G.ammo;
    ctx.fillStyle = have ? '#e3b04a' : 'rgba(255,255,255,0.12)'; rr(ctx, x, 640, 14, 38, 4); ctx.fill();
    ctx.fillStyle = have ? '#d83a3a' : 'rgba(255,255,255,0.08)'; ctx.fillRect(x, 640, 14, 10);
  }
  if (G.reload > 0) {
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(768, 628, 172, 66);
    text('RELOADING', 854, 658, 20, '#ffc83a', 'center');
    ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.fillRect(782, 670, 144, 8);
    ctx.fillStyle = '#ffc83a'; ctx.fillRect(782, 670, 144 * (1 - G.reload / RELOAD_T), 8);
  } else if (G.ammo <= 0 && G.state === 'play') text('RELOAD!', 854, 668, 24, '#ff6a5a', 'center');
}

function drawCrosshair() {
  if (!G.pointer.on) return;
  const { x, y } = G.pointer;
  let over = false;
  if (G.state === 'play') for (const t of targets) if (t.y < COUNTER_Y && Math.hypot(x - t.x, y - t.y) <= t.r + 4) { over = t.type !== 'bomb' ? 'ok' : 'bad'; }
  const col = over === 'bad' ? '#ff4a3a' : over === 'ok' ? '#7dff7a' : '#fff6e0';
  ctx.save(); ctx.translate(x, y);
  ctx.lineWidth = 6; ctx.strokeStyle = 'rgba(0,0,0,0.55)';
  const draw = () => { ctx.beginPath(); ctx.arc(0, 0, 20, 0, 7); ctx.moveTo(-32, 0); ctx.lineTo(-10, 0); ctx.moveTo(10, 0); ctx.lineTo(32, 0); ctx.moveTo(0, -32); ctx.lineTo(0, -10); ctx.moveTo(0, 10); ctx.lineTo(0, 32); ctx.stroke(); };
  draw(); ctx.lineWidth = 2.5; ctx.strokeStyle = col; draw();
  ctx.fillStyle = col; ctx.beginPath(); ctx.arc(0, 0, 2.5, 0, 7); ctx.fill();
  ctx.restore();
}

let timeNow = 0;
function draw() {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#2a1209'; ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);
  ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * ox, dpr * oy);
  ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.clip();
  if (G.shake > 0) ctx.translate(rnd(-1, 1) * G.shake, rnd(-1, 1) * G.shake);
  ctx.drawImage(scene.bg, 0, 0);
  for (const h of holes) {
    ctx.globalAlpha = Math.min(1, h.a) * 0.9; ctx.fillStyle = '#1a0a04'; ctx.beginPath(); ctx.arc(h.x, h.y, 5, 0, 7); ctx.fill();
    ctx.strokeStyle = 'rgba(255,230,170,0.5)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(h.x, h.y, 8, 0, 7); ctx.stroke();
  }
  ctx.globalAlpha = 1;
  drawLights(timeNow);
  for (const t of targets) if (t.type !== 'balloon') drawTarget(t);
  for (const t of targets) if (t.type === 'balloon') drawTarget(t);
  ctx.drawImage(scene.fg, 0, 0);
  drawGun();
  drawHUD();
  for (const p of parts) { ctx.globalAlpha = Math.max(0, p.life / p.max); ctx.fillStyle = p.c; ctx.fillRect(p.x - p.s / 2, p.y - p.s / 2, p.s, p.s); }
  ctx.globalAlpha = 1;
  for (const f of floats) {
    ctx.globalAlpha = Math.min(1, f.life * 1.5);
    const s = f.big ? 30 : 22; ctx.font = `700 ${s}px ${FONT}`; ctx.textAlign = 'center'; ctx.lineWidth = 5; ctx.strokeStyle = '#2a1209'; ctx.strokeText(f.text, f.x, f.y); ctx.fillStyle = f.color; ctx.fillText(f.text, f.x, f.y);
  }
  ctx.globalAlpha = 1;
  if (G.redFlash > 0) { ctx.fillStyle = `rgba(255,40,20,${G.redFlash * 0.35})`; ctx.fillRect(0, 0, W, H); }
  if (G.dbl > 0) { ctx.strokeStyle = `rgba(255,200,58,${0.35 + Math.sin(timeNow * 8) * 0.15})`; ctx.lineWidth = 10; ctx.strokeRect(5, 5, W - 10, H - 10); }
  if (G.state !== 'menu' && G.state !== 'over') drawCrosshair();
  ctx.restore();
}

let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - last) / 1000, 0.05); last = now; timeNow = now / 1000;
  update(dt); draw();
}
requestAnimationFrame(frame);

// ---------- input ----------
function toLogical(e) { return { x: (e.clientX - ox) / scale, y: (e.clientY - oy) / scale }; }
cvs.addEventListener('pointermove', (e) => {
  const p = toLogical(e); G.pointer.x = p.x; G.pointer.y = p.y; G.pointer.on = true; G.pointer.touch = e.pointerType === 'touch';
  if (G.state === 'play' && p.y < COUNTER_Y) G.aim = p;
});
cvs.addEventListener('pointerleave', (e) => { if (e.pointerType !== 'touch') G.pointer.on = false; });
cvs.addEventListener('pointerdown', (e) => {
  e.preventDefault(); audio();
  const p = toLogical(e); G.pointer.x = p.x; G.pointer.y = p.y; G.pointer.on = true;
  if (e.button === 2) return startReload();
  shoot(p.x, p.y);
});
cvs.addEventListener('contextmenu', (e) => e.preventDefault());
window.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if (k === 'r') startReload();
  else if (k === 'p' || k === 'escape') { G.state === 'pause' ? setPause(false) : setPause(true); }
  else if (k === 'm') toggleMute();
  else if ((k === 'enter') && (G.state === 'menu' || G.state === 'over')) startGame();
});
document.addEventListener('visibilitychange', () => { if (document.hidden) setPause(true); });
window.addEventListener('blur', () => setPause(true));
function toggleMute() { muted = !muted; $('muteBtn').textContent = muted ? '🔇' : '🔊'; }
$('muteBtn').addEventListener('click', toggleMute);
$('pauseBtn').addEventListener('click', () => (G.state === 'pause' ? setPause(false) : setPause(true)));
$('playBtn').addEventListener('click', startGame);
$('retryBtn').addEventListener('click', startGame);
$('resumeBtn').addEventListener('click', () => setPause(false));

if (location.search.includes('debug')) {
  window.__bb = {
    G, get targets() { return targets; }, spawn(type, x, y) { targets.push({ type, x, y, vx: 0, vy: 0, r: type === 'disc' ? 38 : 30, age: 0, ph: 0, by: y, bx: x, c: '#ff5d8f' }); },
    shoot, clear() { targets = []; }, noSpawn() { G.tLane = [999, 999, 999]; G.tBird = 999; G.tBalloon = 999; },
  };
}
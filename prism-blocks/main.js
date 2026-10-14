// ============================================================
//  PRISM BLOCKS — drag & drop block puzzle
// ============================================================
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const $ = (id) => document.getElementById(id);

const el = {
  hud: $('hud'),
  score: $('score'),
  combo: $('combo'),
  bestHud: $('bestHud'),
  menu: $('menu'),
  over: $('over'),
  finalScore: $('finalScore'),
  newBest: $('newBest'),
  bestMenu: $('bestMenu'),
  bestOver: $('bestOver'),
};

// ---------- Utils ----------
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const TAU = Math.PI * 2;
const N = 8;
const HUES = [190, 330, 45, 140, 265, 18, 215];

// ---------- Layout ----------
let W = 0,
  H = 0,
  dpr = 1;
let bx = 0,
  by = 0,
  bs = 300,
  c = 37,
  trayY = 0,
  trayH = 100,
  slotW = 100;
function layout() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  W = window.innerWidth;
  H = window.innerHeight;
  canvas.width = Math.floor(W * dpr);
  canvas.height = Math.floor(H * dpr);
  const hudH = 100;
  const avail = H - hudH - 16;
  bs = Math.max(200, Math.min(W - 24, 520, avail / 1.42));
  c = bs / N;
  trayH = c * 3.1;
  const total = bs + 22 + trayH;
  by = hudH + Math.max(0, (avail - total) / 2);
  bx = (W - bs) / 2;
  trayY = by + bs + 22 + trayH / 2;
  slotW = bs / 3;
}
window.addEventListener('resize', layout);
const slotCenter = (i) => ({ x: bx + slotW * (i + 0.5), y: trayY });
const trayScale = (p) =>
  Math.min(0.62, (slotW * 0.86) / (p.w * c), (trayH * 0.9) / (p.h * c));

// ---------- Save ----------
let best = 0;
try {
  best = parseInt(localStorage.getItem('prismblocks-best') || '0', 10) || 0;
} catch (e) {}
const saveBest = () => {
  try {
    localStorage.setItem('prismblocks-best', String(best));
  } catch (e) {}
};

// ---------- Audio ----------
let ac = null;
function initAudio() {
  if (!ac) {
    try {
      ac = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) {}
  }
  if (ac && ac.state === 'suspended') ac.resume();
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
const sfx = {
  pick: () => beep(520, 0.07, 'sine', 0.04, 220),
  place: () => beep(240, 0.14, 'triangle', 0.08, -70),
  bad: () => beep(150, 0.16, 'sawtooth', 0.04, -50),
  clear: (n, streak) => {
    const count = Math.min(n + 3, 8);
    for (let i = 0; i < count; i++) {
      beep(
        392 * Math.pow(1.1225, i * 2 + Math.min(streak, 6)),
        0.2,
        'sine',
        0.06,
        0,
        i * 0.06
      );
    }
  },
  over: () => {
    beep(330, 0.3, 'triangle', 0.07, -160);
    beep(200, 0.6, 'triangle', 0.07, -100, 0.25);
  },
};

// ---------- Pieces ----------
function norm(cells) {
  const mr = Math.min(...cells.map((x) => x[0]));
  const mc = Math.min(...cells.map((x) => x[1]));
  return cells
    .map(([r, cc]) => [r - mr, cc - mc])
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
}
function rot(cells) {
  const h = Math.max(...cells.map((x) => x[0])) + 1;
  return norm(cells.map(([r, cc]) => [cc, h - 1 - r]));
}
function fromStr(rows) {
  const cells = [];
  rows.forEach((s, r) =>
    [...s].forEach((ch, cc) => {
      if (ch === '#') cells.push([r, cc]);
    })
  );
  return norm(cells);
}
function allRots(cells) {
  const seen = new Map();
  let cur = norm(cells);
  for (let i = 0; i < 4; i++) {
    seen.set(JSON.stringify(cur), cur);
    cur = rot(cur);
  }
  return [...seen.values()];
}
const BASES = [
  { w: 1, s: ['#'] },
  { w: 3, s: ['##'] },
  { w: 3, s: ['###'] },
  { w: 2, s: ['####'] },
  { w: 1, s: ['#####'] },
  { w: 3, s: ['##', '##'] },
  { w: 1, s: ['###', '###', '###'] },
  { w: 2, s: ['###', '###'] },
  { w: 3, s: ['#.', '##'] },
  { w: 1, s: ['#..', '#..', '###'] },
  { w: 2, s: ['###', '.#.'] },
  { w: 1, s: ['.##', '##.'] },
  { w: 1, s: ['##.', '.##'] },
  { w: 1, s: ['#.', '#.', '##'] },
  { w: 1, s: ['.#', '.#', '##'] },
].map((b) => ({ w: b.w, rots: allRots(fromStr(b.s)) }));
const TOTAL_W = BASES.reduce((a, b) => a + b.w, 0);

function makePiece() {
  let r = Math.random() * TOTAL_W;
  let base = BASES[0];
  for (const b of BASES) {
    r -= b.w;
    if (r <= 0) {
      base = b;
      break;
    }
  }
  const cells = base.rots[Math.floor(Math.random() * base.rots.length)];
  let w = 0,
    h = 0;
  cells.forEach(([rr, cc]) => {
    h = Math.max(h, rr + 1);
    w = Math.max(w, cc + 1);
  });
  return {
    cells,
    w,
    h,
    color: Math.floor(Math.random() * HUES.length),
    cx: 0,
    cy: 0,
    scale: 0,
    used: false,
    drag: false,
    delay: 0,
  };
}

// ---------- State ----------
const G = {
  state: 'menu',
  score: 0,
  shown: 0,
  streak: 0,
  noClear: 0,
  shake: 0,
  dim: 0,
  dimTarget: 0,
  t: 0,
  hover: null,
};
let grid, pop, tray, clearing, particles, popups;
let drag = null;
const ptr = { x: 0, y: 0, touch: false };

function emptyGrid() {
  return Array.from({ length: N }, () => Array(N).fill(-1));
}
function canPlace(cells, gx, gy) {
  for (const [r, cc] of cells) {
    const rr = gy + r,
      c2 = gx + cc;
    if (rr < 0 || rr >= N || c2 < 0 || c2 >= N || grid[rr][c2] >= 0)
      return false;
  }
  return true;
}
function fits(p) {
  for (let gy = 0; gy < N; gy++)
    for (let gx = 0; gx < N; gx++) if (canPlace(p.cells, gx, gy)) return true;
  return false;
}

function deal() {
  let tries = 0,
    pieces;
  do {
    pieces = [makePiece(), makePiece(), makePiece()];
    tries++;
  } while (!pieces.some(fits) && tries < 60);
  tray = pieces;
  tray.forEach((p, i) => {
    const s = slotCenter(i);
    p.cx = s.x;
    p.cy = s.y + 36;
    p.scale = 0;
    p.delay = i * 0.09;
  });
}

function reset() {
  grid = emptyGrid();
  pop = Array.from({ length: N }, () => Array(N).fill(0));
  clearing = [];
  particles = [];
  popups = [];
  drag = null;
  Object.assign(G, {
    score: 0,
    shown: 0,
    streak: 0,
    noClear: 0,
    shake: 0,
    dim: 0,
    dimTarget: 0,
    t: 0,
    hover: null,
  });
  deal();
  lastHud.s = -1;
  lastHud.c = '#';
}

function startGame() {
  reset();
  G.state = 'playing';
  el.menu.classList.add('hidden');
  el.over.classList.add('hidden');
  el.hud.classList.remove('off');
  el.bestHud.textContent = best.toLocaleString('en-US');
}

function gameOver() {
  G.state = 'over';
  G.dimTarget = 1;
  sfx.over();
  const isBest = G.score > best;
  if (isBest) {
    best = G.score;
    saveBest();
  }
  setTimeout(() => {
    if (G.state !== 'over') return;
    el.finalScore.textContent = G.score.toLocaleString('en-US');
    el.bestOver.textContent = best.toLocaleString('en-US');
    el.newBest.classList.toggle('hidden', !isBest);
    el.over.classList.remove('hidden');
    el.hud.classList.add('off');
  }, 900);
}

// ---------- Effects ----------
function burst(x, y, n, hue, speed = 220, size = 4, life = 0.7) {
  for (let i = 0; i < n; i++) {
    if (particles.length > 600) break;
    const a = Math.random() * TAU;
    const s = rand(0.3, 1) * speed;
    particles.push({
      x,
      y,
      vx: Math.cos(a) * s,
      vy: Math.sin(a) * s - 40,
      life: rand(0.5, 1) * life,
      max: life,
      size: rand(0.5, 1) * size,
      hue,
    });
  }
}
function popup(x, y, text, color = '#ffd166', size = 22) {
  popups.push({ x, y, text, life: 1.1, color, size });
}

const LINE_SCORE = [0, 10, 30, 60, 100, 150, 210, 280, 360];

function placePiece(p, gx, gy) {
  const h = HUES[p.color];
  for (const [r, cc] of p.cells) {
    grid[gy + r][gx + cc] = p.color;
    pop[gy + r][gx + cc] = 1;
    burst(bx + (gx + cc + 0.5) * c, by + (gy + r + 0.5) * c, 2, h, 90, 3, 0.4);
  }
  p.used = true;
  sfx.place();
  addScore(p.cells.length);

  // full lines
  const rows = [],
    cols = [];
  for (let r = 0; r < N; r++) if (grid[r].every((v) => v >= 0)) rows.push(r);
  for (let cc = 0; cc < N; cc++)
    if (grid.every((row) => row[cc] >= 0)) cols.push(cc);
  const n = rows.length + cols.length;

  if (n > 0) {
    const set = new Set();
    rows.forEach((r) => {
      for (let cc = 0; cc < N; cc++) set.add(r * N + cc);
    });
    cols.forEach((cc) => {
      for (let r = 0; r < N; r++) set.add(r * N + cc);
    });
    set.forEach((k) => {
      const r = Math.floor(k / N),
        cc = k % N;
      const hue = HUES[grid[r][cc]];
      clearing.push({
        r,
        c: cc,
        hue,
        t: 0,
        delay: (rows.includes(r) ? cc : r) * 0.025,
      });
      burst(bx + (cc + 0.5) * c, by + (r + 0.5) * c, 4, hue, 260, 5, 0.8);
      grid[r][cc] = -1;
    });
    G.streak++;
    G.noClear = 0;
    const pts =
      LINE_SCORE[Math.min(n, LINE_SCORE.length - 1)] * Math.max(1, G.streak);
    addScore(pts);
    G.shake = Math.min(14, 4 + n * 3);
    sfx.clear(n, G.streak);
    const label =
      n === 1
        ? ''
        : n === 2
        ? 'Nice!'
        : n === 3
        ? 'Great!'
        : n === 4
        ? 'Amazing!'
        : 'INCREDIBLE!';
    const cx = bx + bs / 2,
      cy = by + bs / 2;
    popup(cx, cy - 10, '+' + pts, '#ffd166', 34 + n * 3);
    if (label) popup(cx, cy - 56 - n * 2, label, '#38e1ff', 26 + n * 2);
    if (G.streak >= 2) popup(cx, cy + 36, 'COMBO ×' + G.streak, '#ff5fa2', 24);
    // perfect clear
    if (grid.every((row) => row.every((v) => v < 0))) {
      addScore(300);
      popup(cx, cy + 80, 'PERFECT! +300', '#8dffb0', 30);
      for (let i = 0; i < 6; i++)
        burst(
          rand(bx, bx + bs),
          rand(by, by + bs),
          14,
          HUES[i % HUES.length],
          320,
          5,
          1
        );
    }
  } else {
    G.noClear++;
    if (G.noClear >= 3) G.streak = 0;
  }

  if (tray.every((t) => t.used)) deal();
  const remaining = tray.filter((t) => !t.used);
  if (!remaining.some(fits)) gameOver();
}

function addScore(n) {
  G.score += n;
}

// ---------- Input ----------
function pos(e) {
  return { x: e.clientX, y: e.clientY };
}

canvas.addEventListener('pointerdown', (e) => {
  initAudio();
  if (G.state !== 'playing' || drag) return;
  const { x, y } = pos(e);
  ptr.x = x;
  ptr.y = y;
  ptr.touch = e.pointerType === 'touch';
  if (y < trayY - trayH / 2 - c * 0.6 || y > trayY + trayH / 2 + c * 0.9)
    return;
  for (let i = 0; i < 3; i++) {
    const p = tray[i];
    if (!p || p.used || p.delay > 0) continue;
    if (Math.abs(x - slotCenter(i).x) < slotW / 2) {
      drag = { piece: p, id: e.pointerId };
      p.drag = true;
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch (err) {}
      sfx.pick();
      break;
    }
  }
});
canvas.addEventListener('pointermove', (e) => {
  ptr.x = e.clientX;
  ptr.y = e.clientY;
  ptr.touch = e.pointerType === 'touch';
});
function endDrag() {
  if (!drag) return;
  const p = drag.piece;
  p.drag = false;
  const hv = G.hover;
  drag = null;
  G.hover = null;
  if (hv && hv.valid) placePiece(p, hv.gx, hv.gy);
  else if (ptr.y < trayY - trayH / 2) sfx.bad();
}
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', () => {
  if (drag) {
    drag.piece.drag = false;
    drag = null;
    G.hover = null;
  }
});
window.addEventListener('blur', () => {
  if (drag) {
    drag.piece.drag = false;
    drag = null;
    G.hover = null;
  }
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
function liftAmount() {
  return ptr.touch ? c * 1.9 : c * 0.35;
}

function computeHover() {
  const p = drag.piece;
  const tx = ptr.x,
    ty = ptr.y - liftAmount();
  const gx = Math.round((tx - bx) / c - p.w / 2);
  const gy = Math.round((ty - by) / c - p.h / 2);
  const valid = canPlace(p.cells, gx, gy);
  let lines = null;
  if (valid) {
    const filled = new Set(p.cells.map(([r, cc]) => (gy + r) * N + gx + cc));
    const isF = (r, cc) => grid[r][cc] >= 0 || filled.has(r * N + cc);
    lines = new Set();
    for (let r = 0; r < N; r++) {
      let full = true;
      for (let cc = 0; cc < N; cc++)
        if (!isF(r, cc)) {
          full = false;
          break;
        }
      if (full) for (let cc = 0; cc < N; cc++) lines.add(r * N + cc);
    }
    for (let cc = 0; cc < N; cc++) {
      let full = true;
      for (let r = 0; r < N; r++)
        if (!isF(r, cc)) {
          full = false;
          break;
        }
      if (full) for (let r = 0; r < N; r++) lines.add(r * N + cc);
    }
  }
  G.hover = { gx, gy, valid, lines };
}

function update(dt) {
  G.t += dt;

  // pieces
  const lift = liftAmount();
  tray.forEach((p, i) => {
    if (p.used) return;
    if (p.delay > 0) {
      p.delay -= dt;
      return;
    }
    const s = slotCenter(i);
    let tx, ty, ts, k;
    if (p.drag) {
      tx = ptr.x;
      ty = ptr.y - lift;
      ts = 1;
      k = 32;
    } else {
      tx = s.x;
      ty = s.y;
      ts = trayScale(p);
      k = 16;
    }
    const f = Math.min(1, k * dt);
    p.cx += (tx - p.cx) * f;
    p.cy += (ty - p.cy) * f;
    p.scale += (ts - p.scale) * f;
  });
  if (drag) computeHover();
  else G.hover = null;

  // placed-cell pop
  for (let r = 0; r < N; r++)
    for (let cc = 0; cc < N; cc++)
      if (pop[r][cc] > 0) pop[r][cc] = Math.max(0, pop[r][cc] - dt * 4);

  // clearing animations
  for (let i = clearing.length - 1; i >= 0; i--) {
    clearing[i].t += dt;
    if (clearing[i].t - clearing[i].delay > 0.45) clearing.splice(i, 1);
  }

  // particles & popups
  for (let i = particles.length - 1; i >= 0; i--) {
    const q = particles[i];
    q.life -= dt;
    if (q.life <= 0) {
      particles.splice(i, 1);
      continue;
    }
    q.vy += 520 * dt;
    q.vx -= q.vx * 1.5 * dt;
    q.x += q.vx * dt;
    q.y += q.vy * dt;
  }
  for (let i = popups.length - 1; i >= 0; i--) {
    const q = popups[i];
    q.life -= dt;
    q.y -= 34 * dt;
    if (q.life <= 0) popups.splice(i, 1);
  }

  G.shake = Math.max(0, G.shake - dt * 30);
  G.dim += (G.dimTarget - G.dim) * Math.min(1, 5 * dt);
  G.shown += (G.score - G.shown) * Math.min(1, 9 * dt);
  if (G.score - G.shown < 1) G.shown = G.score;
}

// ---------- Drawing ----------
function rr(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawCell(x, y, s, hue, alpha = 1) {
  const pad = s * 0.055;
  const r = s * 0.22;
  ctx.globalAlpha = alpha;
  const g = ctx.createLinearGradient(x, y, x, y + s);
  g.addColorStop(0, `hsl(${hue},92%,68%)`);
  g.addColorStop(1, `hsl(${hue},85%,47%)`);
  ctx.fillStyle = g;
  rr(x + pad, y + pad, s - pad * 2, s - pad * 2, r);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  rr(
    x + pad + s * 0.1,
    y + pad + s * 0.07,
    s - pad * 2 - s * 0.2,
    s * 0.2,
    r * 0.6
  );
  ctx.fill();
  ctx.globalAlpha = 1;
}

function drawPiece(p, scale, alpha = 1) {
  const s = c * scale;
  const hue = HUES[p.color];
  for (const [r, cc] of p.cells) {
    drawCell(
      p.cx + (cc - p.w / 2) * s,
      p.cy + (r - p.h / 2) * s,
      s,
      hue,
      alpha
    );
  }
}

function drawBackground(t) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#1a0f4d');
  g.addColorStop(1, '#0b0624');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  const orbs = [
    { x: 0.2, y: 0.25, r: 0.55, c: '255,95,162', a: 0.2, sp: 0.18 },
    { x: 0.85, y: 0.55, r: 0.6, c: '56,225,255', a: 0.16, sp: 0.14 },
    { x: 0.4, y: 0.95, r: 0.6, c: '139,92,246', a: 0.25, sp: 0.1 },
  ];
  const m = Math.max(W, H);
  for (const o of orbs) {
    const x = (o.x + Math.sin(t * o.sp) * 0.08) * W;
    const y = (o.y + Math.cos(t * o.sp * 1.3) * 0.06) * H;
    const rg = ctx.createRadialGradient(x, y, 0, x, y, o.r * m);
    rg.addColorStop(0, `rgba(${o.c},${o.a})`);
    rg.addColorStop(1, `rgba(${o.c},0)`);
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, W, H);
  }
}

function render(t) {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  drawBackground(t);

  ctx.save();
  if (G.shake > 0)
    ctx.translate(rand(-G.shake, G.shake) * 0.4, rand(-G.shake, G.shake) * 0.4);

  // board panel
  const padB = c * 0.14;
  ctx.fillStyle = 'rgba(10,5,35,0.55)';
  rr(bx - padB, by - padB, bs + padB * 2, bs + padB * 2, c * 0.45);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.14)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // empty cells
  ctx.fillStyle = 'rgba(255,255,255,0.055)';
  for (let r = 0; r < N; r++)
    for (let cc = 0; cc < N; cc++) {
      rr(
        bx + cc * c + c * 0.055,
        by + r * c + c * 0.055,
        c * 0.89,
        c * 0.89,
        c * 0.2
      );
      ctx.fill();
    }

  // hover preview
  const hv = G.hover;
  if (hv && drag) {
    const p = drag.piece;
    if (hv.valid) {
      if (hv.lines && hv.lines.size) {
        const pulse = 0.35 + 0.25 * Math.sin(t * 10);
        ctx.fillStyle = `rgba(255,255,255,${pulse})`;
        hv.lines.forEach((k) => {
          const r = Math.floor(k / N),
            cc = k % N;
          rr(
            bx + cc * c + c * 0.055,
            by + r * c + c * 0.055,
            c * 0.89,
            c * 0.89,
            c * 0.2
          );
          ctx.fill();
        });
      }
      for (const [r, cc] of p.cells)
        drawCell(
          bx + (hv.gx + cc) * c,
          by + (hv.gy + r) * c,
          c,
          HUES[p.color],
          0.5
        );
    }
  }

  // filled cells
  for (let r = 0; r < N; r++)
    for (let cc = 0; cc < N; cc++) {
      const v = grid[r][cc];
      if (v < 0) continue;
      const sc = 1 + 0.18 * Math.sin(pop[r][cc] * Math.PI);
      const s = c * sc;
      drawCell(bx + cc * c + (c - s) / 2, by + r * c + (c - s) / 2, s, HUES[v]);
    }

  // clearing animations
  for (const a of clearing) {
    const t0 = a.t - a.delay;
    if (t0 < 0) {
      drawCell(bx + a.c * c, by + a.r * c, c, a.hue);
      continue;
    }
    const k = t0 / 0.45;
    const s = c * (1 + 0.25 * Math.sin(k * Math.PI) - k * 0.9);
    if (s <= 1) continue;
    const x = bx + a.c * c + (c - s) / 2,
      y = by + a.r * c + (c - s) / 2;
    drawCell(x, y, s, a.hue, 1 - k * 0.6);
    ctx.fillStyle = `rgba(255,255,255,${(1 - k) * 0.9})`;
    rr(x + s * 0.06, y + s * 0.06, s * 0.88, s * 0.88, s * 0.2);
    ctx.fill();
  }

  // game over dim
  if (G.dim > 0.01) {
    ctx.fillStyle = `rgba(15,8,40,${0.55 * G.dim})`;
    rr(bx - padB, by - padB, bs + padB * 2, bs + padB * 2, c * 0.45);
    ctx.fill();
  }

  // tray slots
  ctx.fillStyle = 'rgba(255,255,255,0.035)';
  for (let i = 0; i < 3; i++) {
    const s = slotCenter(i);
    rr(s.x - slotW / 2 + 5, trayY - trayH / 2, slotW - 10, trayH, c * 0.4);
    ctx.fill();
  }

  // tray pieces (not dragged)
  for (const p of tray) {
    if (p.used || p.drag || p.delay > 0 || p.scale < 0.02) continue;
    drawPiece(p, p.scale);
  }

  // dragged piece
  if (drag) {
    const p = drag.piece;
    ctx.save();
    ctx.shadowColor = `hsla(${HUES[p.color]},100%,60%,0.8)`;
    ctx.shadowBlur = 24;
    drawPiece(p, p.scale);
    ctx.restore();
  }

  // particles
  ctx.globalCompositeOperation = 'lighter';
  for (const q of particles) {
    const k = q.life / q.max;
    ctx.globalAlpha = clamp(k * 1.3, 0, 1);
    ctx.fillStyle = `hsl(${q.hue},100%,65%)`;
    const s = q.size * (0.4 + k);
    ctx.fillRect(q.x - s / 2, q.y - s / 2, s, s);
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';

  // popups
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const q of popups) {
    const k = 1 - q.life / 1.1;
    const sc =
      k < 0.15 ? 0.6 + (k / 0.15) * 0.5 : 1.1 - Math.min(0.1, (k - 0.15) * 0.3);
    ctx.globalAlpha = clamp(q.life * 1.8, 0, 1);
    ctx.font = `800 ${Math.round(q.size * sc)}px Rubik, sans-serif`;
    ctx.lineWidth = 6;
    ctx.strokeStyle = 'rgba(20,8,60,0.8)';
    ctx.lineJoin = 'round';
    ctx.strokeText(q.text, q.x, q.y);
    ctx.fillStyle = q.color;
    ctx.fillText(q.text, q.x, q.y);
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  // soft vignette
  const vg = ctx.createRadialGradient(
    W / 2,
    H / 2,
    Math.min(W, H) * 0.5,
    W / 2,
    H / 2,
    Math.max(W, H) * 0.85
  );
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(6,2,22,0.5)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);
}

// ---------- HUD ----------
const lastHud = { s: -1, c: '#' };
function updateHud() {
  const s = Math.round(G.shown);
  if (s !== lastHud.s) {
    el.score.textContent = s.toLocaleString('en-US');
    if (lastHud.s >= 0 && s === G.score) {
      el.score.classList.remove('pop');
      void el.score.offsetWidth;
      el.score.classList.add('pop');
    }
    lastHud.s = s;
  }
  const cb = G.streak >= 2 ? 'COMBO ×' + G.streak : '';
  if (cb !== lastHud.c) {
    el.combo.textContent = cb;
    lastHud.c = cb;
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
  render(now / 1000);
}

// ---------- Init ----------
layout();
reset();
G.state = 'menu';
el.bestMenu.textContent = best.toLocaleString('en-US');
requestAnimationFrame((n) => {
  last = n;
  frame(n);
});

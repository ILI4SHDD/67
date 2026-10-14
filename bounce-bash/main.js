// ============================================================
//  BOUNCE BASH — a neon brick breaker
// ============================================================
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const $ = (id) => document.getElementById(id);
const el = {
  hud: $('hud'),
  score: $('score'),
  level: $('level'),
  lives: $('lives'),
  combo: $('combo'),
  banner: $('banner'),
  menu: $('menu'),
  pause: $('pause'),
  over: $('over'),
  finalScore: $('finalScore'),
  finalLevel: $('finalLevel'),
  finalBricks: $('finalBricks'),
  finalCombo: $('finalCombo'),
  newBest: $('newBest'),
  bestMenu: $('bestMenu'),
  bestOver: $('bestOver'),
};

const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const TAU = Math.PI * 2;

// ---------- World / layout (logical 800 x 600) ----------
const FW = 800,
  FH = 600;
let W = 0,
  H = 0,
  dpr = 1,
  K = 1,
  OX = 0,
  OY = 0;
function layout() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  W = innerWidth;
  H = innerHeight;
  canvas.width = Math.floor(W * dpr);
  canvas.height = Math.floor(H * dpr);
  const top = 56;
  K = Math.min(W / FW, (H - top - 12) / FH);
  OX = (W - FW * K) / 2;
  OY = top + (H - top - 12 - FH * K) / 2;
}
addEventListener('resize', layout);

// ---------- Save ----------
let best = 0;
try {
  best = parseInt(localStorage.getItem('bounce-best') || '0', 10) || 0;
} catch (e) {}
const saveBest = () => {
  try {
    localStorage.setItem('bounce-best', String(best));
  } catch (e) {}
};

// ---------- Audio ----------
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
  wall: () => beep(300, 0.06, 'triangle', 0.04),
  paddle: () => beep(220, 0.09, 'square', 0.05, 120),
  brick: (c) => beep(520 + Math.min(c, 14) * 45, 0.1, 'triangle', 0.06),
  hard: () => beep(160, 0.08, 'square', 0.04),
  power: () =>
    [0, 7, 12, 19].forEach((n, i) =>
      beep(440 * 2 ** (n / 12), 0.12, 'triangle', 0.05, 0, i * 0.05)
    ),
  lose: () => {
    beep(300, 0.5, 'sawtooth', 0.08, -240);
  },
  launch: () => beep(400, 0.12, 'sine', 0.05, 500),
  clear: () =>
    [0, 4, 7, 12, 16].forEach((n, i) =>
      beep(523 * 2 ** (n / 12), 0.2, 'triangle', 0.06, 0, i * 0.08)
    ),
  over: () => {
    beep(260, 0.9, 'sawtooth', 0.09, -200);
    beep(130, 1, 'square', 0.05, -60, 0.1);
  },
};

// ---------- Game state ----------
const COLS = 10,
  BW = 68,
  BH = 24,
  GAP = 6,
  BX0 = (FW - (COLS * (BW + GAP) - GAP)) / 2,
  BY0 = 96;
const PADY = FH - 44,
  PADH = 14,
  PAD_W0 = 112;
const rowColors = [
  '#ff4d6d',
  '#ff7a3d',
  '#ffd23f',
  '#4dff9a',
  '#4dc3ff',
  '#c77dff',
  '#ff6bd6',
  '#7dffea',
];

const G = {
  state: 'menu',
  score: 0,
  lives: 3,
  level: 1,
  bricks: 0,
  maxCombo: 0,
  combo: 0,
  t: 0,
  shake: 0,
  flash: 0,
  wide: 0,
  slow: 0,
  fire: 0,
  lvlT: 0,
};
let paddle,
  balls,
  bricks,
  drops,
  parts,
  rings,
  texts,
  stars,
  debug = null;
const keys = { L: false, R: false };
let target = FW / 2;

stars = Array.from({ length: 70 }, () => ({
  x: rand(0, FW),
  y: rand(0, FH),
  z: rand(0.3, 1),
  tw: rand(0, TAU),
}));

// ---------- Levels ----------
const patterns = [
  (r, c) => r < 5, // wall
  (r, c) => (r + c) % 2 === 0 && r < 6, // checker
  (r, c) => c >= r && c < COLS - r && r < 5, // pyramid (inverted)
  (r, c) => Math.abs(c - 4.5) + Math.abs(r - 3) <= 4.6, // diamond
  (r, c) => r < 6 && c % 3 !== 2, // columns
  (r, c) => r < 7 && (r % 2 === 0 || c === 0 || c === COLS - 1), // ladder
  (r, c) => r < 6 && !((r === 2 || r === 3) && c > 2 && c < 7), // ring
];
function buildLevel(n) {
  const pat = patterns[(n - 1) % patterns.length];
  bricks = [];
  for (let r = 0; r < 8; r++)
    for (let c = 0; c < COLS; c++) {
      if (!pat(r, c)) continue;
      const tough = n > 1 && Math.random() < Math.min(0.55, 0.1 + n * 0.06);
      const hp = tough ? (n > 4 && Math.random() < 0.3 ? 3 : 2) : 1;
      bricks.push({
        x: BX0 + c * (BW + GAP),
        y: BY0 + r * (BH + GAP),
        hp,
        max: hp,
        color: rowColors[r % rowColors.length],
        flash: 0,
        wob: rand(0, TAU),
        born: -(r * 0.06 + c * 0.015),
      });
    }
}
function ballSpeed() {
  return Math.min(640, 360 + (G.level - 1) * 22) * (G.slow > 0 ? 0.7 : 1);
}

function newBall(stuck) {
  return { x: paddle.x, y: PADY - 10, vx: 0, vy: 0, r: 8, stuck, trail: [] };
}
function resetBall() {
  balls = [newBall(true)];
  G.combo = 0;
  el.combo.classList.remove('show');
}

function startGame() {
  paddle = { x: FW / 2, w: PAD_W0, vis: PAD_W0, sq: 0 };
  Object.assign(G, {
    state: 'playing',
    score: 0,
    lives: 3,
    level: 1,
    bricks: 0,
    maxCombo: 0,
    combo: 0,
    shake: 0,
    flash: 0,
    wide: 0,
    slow: 0,
    fire: 0,
    lvlT: 0,
  });
  drops = [];
  parts = [];
  rings = [];
  texts = [];
  buildLevel(1);
  resetBall();
  el.menu.classList.add('hidden');
  el.over.classList.add('hidden');
  el.pause.classList.add('hidden');
  el.hud.classList.remove('off');
  updateHud(true);
  banner('LEVEL 1', '#4dc3ff');
}

function banner(text, color) {
  el.banner.textContent = text;
  el.banner.style.color = color || '#fff';
  el.banner.classList.remove('show');
  void el.banner.offsetWidth;
  el.banner.classList.add('show');
}
function updateHud(pop) {
  el.score.textContent = G.score.toLocaleString('en-US');
  el.level.textContent = G.level;
  el.lives.textContent = '♥'.repeat(Math.max(0, G.lives)) || '—';
  if (pop) {
    el.score.classList.remove('pop');
    void el.score.offsetWidth;
    el.score.classList.add('pop');
  }
}

// ---------- Effects ----------
function burst(x, y, color, n, spd = 260) {
  for (let i = 0; i < n; i++) {
    const a = rand(0, TAU),
      s = rand(40, spd);
    parts.push({
      x,
      y,
      vx: Math.cos(a) * s,
      vy: Math.sin(a) * s - 40,
      life: rand(0.4, 0.9),
      max: 0.9,
      size: rand(2.5, 6),
      color,
      rot: rand(0, TAU),
      vr: rand(-10, 10),
    });
  }
}
function floatText(x, y, s, color) {
  texts.push({ x, y, s, color, life: 0.9, max: 0.9 });
}

const DROPS = {
  W: {
    c: '#4dc3ff',
    apply: () => {
      G.wide = 12;
    },
  },
  M: { c: '#c77dff', apply: () => multiBall() },
  S: {
    c: '#4dff9a',
    apply: () => {
      G.slow = 9;
      rescale();
    },
  },
  F: {
    c: '#ff7a3d',
    apply: () => {
      G.fire = 6;
    },
  },
  L: {
    c: '#ff4d6d',
    apply: () => {
      G.lives = Math.min(5, G.lives + 1);
      updateHud(true);
    },
  },
};
function multiBall() {
  const add = [];
  for (const b of balls) {
    if (b.stuck) continue;
    const sp = Math.hypot(b.vx, b.vy),
      a = Math.atan2(b.vy, b.vx);
    for (const da of [-0.35, 0.35])
      add.push({
        x: b.x,
        y: b.y,
        vx: Math.cos(a + da) * sp,
        vy: Math.sin(a + da) * sp,
        r: 8,
        stuck: false,
        trail: [],
      });
  }
  balls.push(...add.slice(0, 6));
  if (balls.length > 9) balls.length = 9;
}
function rescale() {
  const sp = ballSpeed();
  for (const b of balls)
    if (!b.stuck) {
      const c = Math.hypot(b.vx, b.vy) || 1;
      b.vx *= sp / c;
      b.vy *= sp / c;
    }
}

function hitBrick(b, ball) {
  b.hp -= G.fire > 0 ? 9 : 1;
  b.flash = 1;
  if (b.hp > 0) {
    sfx.hard();
    burst(b.x + BW / 2, b.y + BH / 2, '#ffffff', 4, 120);
    return;
  }
  bricks.splice(bricks.indexOf(b), 1);
  G.bricks++;
  G.combo++;
  G.maxCombo = Math.max(G.maxCombo, G.combo);
  const mult = Math.min(8, 1 + Math.floor(G.combo / 3));
  const pts = 10 * b.max * mult;
  G.score += pts;
  floatText(b.x + BW / 2, b.y + BH / 2, '+' + pts, b.color);
  burst(b.x + BW / 2, b.y + BH / 2, b.color, 16);
  rings.push({
    x: b.x + BW / 2,
    y: b.y + BH / 2,
    r0: 6,
    r1: 40,
    life: 0.35,
    max: 0.35,
    color: b.color,
  });
  G.shake = Math.max(G.shake, 2 + mult * 0.4);
  sfx.brick(G.combo);
  if (G.combo >= 3) {
    el.combo.textContent = 'x' + mult + ' · ' + G.combo + ' COMBO';
    el.combo.classList.remove('show');
    void el.combo.offsetWidth;
    el.combo.classList.add('show');
  }
  updateHud(true);
  if (Math.random() < 0.17) {
    const k = ['W', 'M', 'S', 'F', 'L'],
      w = [3, 3, 2, 2, 1];
    let r = Math.random() * 11,
      i = 0;
    while (r > w[i]) {
      r -= w[i];
      i++;
    }
    drops.push({ x: b.x + BW / 2, y: b.y + BH / 2, k: k[i], t: 0 });
  }
  if (!bricks.length) levelClear();
}

function levelClear() {
  G.state = 'clear';
  G.lvlT = 1.8;
  G.flash = 0.5;
  sfx.clear();
  banner('LEVEL ' + G.level + ' CLEAR!', '#ffd23f');
  G.score += 200 * G.level;
  updateHud(true);
  for (let i = 0; i < 60; i++)
    burst(rand(0, FW), rand(60, 300), rowColors[i % rowColors.length], 1, 400);
  drops.forEach((d) => (d.dead = true));
}

function loseBall() {
  G.lives--;
  G.shake = 14;
  G.flash = 0.4;
  sfx.lose();
  G.wide = 0;
  G.fire = 0;
  G.slow = 0;
  updateHud();
  if (G.lives <= 0) {
    gameOver();
    return;
  }
  resetBall();
  banner('BALL LOST', '#ff4d6d');
}

function gameOver() {
  G.state = 'over';
  sfx.over();
  const isBest = G.score > best;
  if (isBest) {
    best = G.score;
    saveBest();
  }
  setTimeout(() => {
    el.finalScore.textContent = G.score.toLocaleString('en-US');
    el.finalLevel.textContent = G.level;
    el.finalBricks.textContent = G.bricks;
    el.finalCombo.textContent = G.maxCombo;
    el.bestOver.textContent = best.toLocaleString('en-US');
    el.newBest.classList.toggle('hidden', !isBest);
    el.over.classList.remove('hidden');
    el.hud.classList.add('off');
  }, 900);
}

// ---------- Input ----------
function launch() {
  initAudio();
  if (G.state !== 'playing') return;
  let any = false;
  for (const b of balls)
    if (b.stuck) {
      b.stuck = false;
      any = true;
      const a =
          -Math.PI / 2 +
          clamp((paddle.x - FW / 2) / FW, -0.3, 0.3) +
          rand(-0.12, 0.12),
        sp = ballSpeed();
      b.vx = Math.cos(a) * sp;
      b.vy = Math.sin(a) * sp;
    }
  if (any) sfx.launch();
}
addEventListener('keydown', (e) => {
  initAudio();
  if (e.code === 'ArrowLeft' || e.code === 'KeyA' || e.code === 'KeyQ') {
    keys.L = true;
    e.preventDefault();
  } else if (e.code === 'ArrowRight' || e.code === 'KeyD') {
    keys.R = true;
    e.preventDefault();
  } else if (e.repeat) return;
  else if (e.code === 'Space') {
    e.preventDefault();
    if (G.state === 'menu' || G.state === 'over') startGame();
    else launch();
  } else if (e.code === 'KeyP' || e.code === 'Escape') togglePause();
  else if (e.code === 'KeyM') muted = !muted;
  else if (e.code === 'Enter' && (G.state === 'menu' || G.state === 'over'))
    startGame();
});
addEventListener('keyup', (e) => {
  if (e.code === 'ArrowLeft' || e.code === 'KeyA' || e.code === 'KeyQ')
    keys.L = false;
  if (e.code === 'ArrowRight' || e.code === 'KeyD') keys.R = false;
});
function setTarget(e) {
  target = clamp((e.clientX - OX) / K, 0, FW);
}
canvas.addEventListener('pointermove', setTarget);
canvas.addEventListener('pointerdown', (e) => {
  initAudio();
  setTarget(e);
  launch();
});
addEventListener('blur', () => {
  keys.L = keys.R = false;
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

// ---------- Update ----------
function stepBall(b, dt) {
  b.x += b.vx * dt;
  b.y += b.vy * dt;
  if (b.x < b.r) {
    b.x = b.r;
    b.vx = Math.abs(b.vx);
    sfx.wall();
  }
  if (b.x > FW - b.r) {
    b.x = FW - b.r;
    b.vx = -Math.abs(b.vx);
    sfx.wall();
  }
  if (b.y < b.r) {
    b.y = b.r;
    b.vy = Math.abs(b.vy);
    sfx.wall();
  }
  // paddle
  const pw = paddle.w;
  if (
    b.vy > 0 &&
    b.y + b.r >= PADY &&
    b.y - b.r <= PADY + PADH &&
    b.x > paddle.x - pw / 2 - b.r * 0.6 &&
    b.x < paddle.x + pw / 2 + b.r * 0.6
  ) {
    const rel = clamp((b.x - paddle.x) / (pw / 2), -1, 1),
      a = -Math.PI / 2 + rel * 1.05,
      sp = ballSpeed();
    b.vx = Math.cos(a) * sp;
    b.vy = Math.sin(a) * sp;
    b.y = PADY - b.r;
    paddle.sq = 1;
    G.combo = 0;
    el.combo.classList.remove('show');
    sfx.paddle();
    burst(b.x, PADY, '#9fd3ff', 6, 140);
  }
  // bricks
  if (G.state === 'menu') return;
  for (const br of bricks) {
    const nx = clamp(b.x, br.x, br.x + BW),
      ny = clamp(b.y, br.y, br.y + BH);
    const dx = b.x - nx,
      dy = b.y - ny,
      d2 = dx * dx + dy * dy;
    if (d2 > b.r * b.r) continue;
    if (G.fire <= 0) {
      if (d2 === 0) {
        b.vy = -b.vy;
      } else {
        const d = Math.sqrt(d2),
          px = (dx / d) * (b.r - d),
          py = (dy / d) * (b.r - d);
        b.x += px;
        b.y += py;
        if (Math.abs(dx) > Math.abs(dy)) b.vx = Math.abs(b.vx) * Math.sign(dx);
        else b.vy = Math.abs(b.vy) * Math.sign(dy);
      }
    }
    hitBrick(br, b);
    if (G.fire <= 0) break;
  }
}

function update(dt) {
  G.t += dt;
  paddle.sq = Math.max(0, paddle.sq - dt * 5);
  if (G.state === 'playing' || G.state === 'clear' || G.state === 'menu') {
    const k = (keys.R ? 1 : 0) - (keys.L ? 1 : 0);
    if (k) target = clamp(target + k * 640 * dt, 0, FW);
    G.wide = Math.max(0, G.wide - dt);
    if (G.slow > 0) {
      G.slow -= dt;
      if (G.slow <= 0) rescale();
    }
    G.fire = Math.max(0, G.fire - dt);
    const want = G.wide > 0 ? 176 : PAD_W0;
    paddle.w += (want - paddle.w) * Math.min(1, 10 * dt);
    paddle.x +=
      (clamp(target, paddle.w / 2, FW - paddle.w / 2) - paddle.x) *
      Math.min(1, 22 * dt);
  }
  if (G.state === 'playing') {
    const sub = 3,
      h = dt / sub;
    for (let s = 0; s < sub && G.state === 'playing'; s++)
      for (const b of balls.slice()) {
        if (b.stuck) {
          b.x = paddle.x;
          b.y = PADY - b.r - 1;
          continue;
        }
        stepBall(b, h);
      }
    for (const b of balls)
      if (!b.stuck) {
        b.trail.unshift({ x: b.x, y: b.y });
        if (b.trail.length > 12) b.trail.pop();
      }
    if (G.state === 'playing') {
      balls = balls.filter((b) => b.stuck || b.y - b.r < FH + 10);
      if (!balls.length && G.state === 'playing') loseBall();
    }
    for (const d of drops) {
      d.t += dt;
      d.y += 150 * dt;
      if (
        d.y > PADY - 6 &&
        d.y < PADY + PADH + 14 &&
        Math.abs(d.x - paddle.x) < paddle.w / 2 + 12
      ) {
        d.dead = true;
        DROPS[d.k].apply();
        sfx.power();
        rings.push({
          x: d.x,
          y: PADY,
          r0: 8,
          r1: 60,
          life: 0.4,
          max: 0.4,
          color: DROPS[d.k].c,
        });
        burst(d.x, PADY, DROPS[d.k].c, 14, 220);
        floatText(
          d.x,
          PADY - 20,
          { W: 'WIDE', M: 'MULTI', S: 'SLOW', F: 'FIRE', L: '+1 LIFE' }[d.k],
          DROPS[d.k].c
        );
      } else if (d.y > FH + 20) d.dead = true;
    }
    drops = drops.filter((d) => !d.dead);
  } else if (G.state === 'menu') {
    for (const b of balls) {
      stepBall(b, dt);
      if (b.y > FH + 10) {
        b.x = FW / 2;
        b.y = 380;
        b.vx = 220;
        b.vy = -300;
      }
      if (b.y < 160) b.vy = Math.abs(b.vy);
    }
  } else if (G.state === 'clear') {
    G.lvlT -= dt;
    if (G.lvlT <= 0) {
      G.level++;
      G.state = 'playing';
      buildLevel(G.level);
      resetBall();
      drops = [];
      banner('LEVEL ' + G.level, '#4dc3ff');
      updateHud(true);
    }
  }
  for (const b of bricks || []) {
    b.flash = Math.max(0, b.flash - dt * 6);
    b.born += dt;
  }
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    p.life -= dt;
    if (p.life <= 0) {
      parts.splice(i, 1);
      continue;
    }
    p.vy += 420 * dt;
    p.vx *= 1 - dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.rot += p.vr * dt;
  }
  if (parts.length > 500) parts.splice(0, parts.length - 500);
  for (let i = rings.length - 1; i >= 0; i--) {
    rings[i].life -= dt;
    if (rings[i].life <= 0) rings.splice(i, 1);
  }
  for (let i = texts.length - 1; i >= 0; i--) {
    texts[i].life -= dt;
    texts[i].y -= 36 * dt;
    if (texts[i].life <= 0) texts.splice(i, 1);
  }
  G.shake = Math.max(0, G.shake - dt * 30);
  G.flash = Math.max(0, G.flash - dt * 1.6);
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
function render(now) {
  const t = now / 1000;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#12153a');
  bg.addColorStop(1, '#070815');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  const sx = G.shake > 0 ? rand(-G.shake, G.shake) * 0.5 : 0,
    sy = G.shake > 0 ? rand(-G.shake, G.shake) * 0.5 : 0;
  ctx.setTransform(dpr * K, 0, 0, dpr * K, dpr * (OX + sx), dpr * (OY + sy));

  // playfield
  const pg = ctx.createLinearGradient(0, 0, 0, FH);
  pg.addColorStop(0, '#171b48');
  pg.addColorStop(1, '#0b0d26');
  ctx.fillStyle = pg;
  rr(0, 0, FW, FH, 14);
  ctx.fill();
  ctx.save();
  rr(0, 0, FW, FH, 14);
  ctx.clip();
  ctx.strokeStyle = 'rgba(120,150,255,0.07)';
  ctx.lineWidth = 1;
  for (let x = 0; x <= FW; x += 40) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, FH);
    ctx.stroke();
  }
  for (let y = (t * 12) % 40; y <= FH; y += 40) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(FW, y);
    ctx.stroke();
  }
  for (const s of stars) {
    const a = 0.35 + 0.35 * Math.sin(t * 2 * s.z + s.tw);
    ctx.fillStyle = `rgba(190,210,255,${a})`;
    ctx.fillRect(
      s.x,
      (s.y + t * 10 * s.z) % FH,
      1.6 * s.z + 0.6,
      1.6 * s.z + 0.6
    );
  }
  ctx.restore();
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(120,160,255,0.55)';
  ctx.shadowColor = '#5a8cff';
  ctx.shadowBlur = 18;
  rr(0, 0, FW, FH, 14);
  ctx.stroke();
  ctx.shadowBlur = 0;

  if (!paddle) return;

  // bricks
  for (const b of bricks) {
    const pop = clamp(b.born / 0.35, 0, 1);
    if (pop <= 0) continue;
    const sc = 1 - Math.pow(1 - pop, 3),
      bob = Math.sin(t * 2 + b.wob) * 0.8;
    ctx.save();
    ctx.translate(b.x + BW / 2, b.y + BH / 2 + bob);
    ctx.scale(sc, sc);
    const dark = b.hp < b.max ? 0.65 + 0.35 * (b.hp / b.max) : 1;
    ctx.shadowColor = b.color;
    ctx.shadowBlur = 10;
    ctx.fillStyle = b.color;
    rr(-BW / 2, -BH / 2, BW, BH, 6);
    ctx.fill();
    ctx.shadowBlur = 0;
    const g = ctx.createLinearGradient(0, -BH / 2, 0, BH / 2);
    g.addColorStop(0, 'rgba(255,255,255,0.45)');
    g.addColorStop(0.5, 'rgba(255,255,255,0)');
    g.addColorStop(1, `rgba(0,0,0,${0.3 / dark})`);
    ctx.fillStyle = g;
    rr(-BW / 2, -BH / 2, BW, BH, 6);
    ctx.fill();
    if (b.max > 1) {
      // armored: steel frame, cracks when damaged
      ctx.lineWidth = 3;
      ctx.strokeStyle =
        b.hp === b.max ? 'rgba(235,240,255,0.9)' : 'rgba(30,30,50,0.55)';
      rr(-BW / 2 + 1.5, -BH / 2 + 1.5, BW - 3, BH - 3, 5);
      ctx.stroke();
      if (b.hp < b.max) {
        ctx.strokeStyle = 'rgba(0,0,0,0.5)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(-8, -BH / 2);
        ctx.lineTo(-2, 0);
        ctx.lineTo(-12, BH / 2);
        ctx.moveTo(14, -BH / 2);
        ctx.lineTo(8, 4);
        ctx.stroke();
      }
    }
    if (b.flash > 0) {
      ctx.fillStyle = `rgba(255,255,255,${b.flash * 0.8})`;
      rr(-BW / 2, -BH / 2, BW, BH, 6);
      ctx.fill();
    }
    ctx.restore();
  }

  // power-up drops
  for (const d of drops) {
    const c = DROPS[d.k].c,
      wob = Math.sin(d.t * 8) * 2;
    ctx.save();
    ctx.translate(d.x + wob, d.y);
    ctx.shadowColor = c;
    ctx.shadowBlur = 16;
    ctx.fillStyle = c;
    rr(-14, -11, 28, 22, 7);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#10122a';
    ctx.font = '700 15px Rubik, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(d.k === 'L' ? '♥' : d.k, 0, 1);
    ctx.restore();
  }

  // paddle
  const sq = paddle.sq,
    pw = paddle.w * (1 + sq * 0.08),
    ph = PADH * (1 - sq * 0.25);
  ctx.save();
  ctx.translate(paddle.x, PADY + PADH / 2);
  ctx.shadowColor = G.fire > 0 ? '#ff7a3d' : '#4dc3ff';
  ctx.shadowBlur = 20;
  const pgd = ctx.createLinearGradient(0, -ph / 2, 0, ph / 2);
  pgd.addColorStop(0, '#e9f6ff');
  pgd.addColorStop(1, G.fire > 0 ? '#ff7a3d' : '#3d9bff');
  ctx.fillStyle = pgd;
  rr(-pw / 2, -ph / 2, pw, ph, 7);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  rr(-pw / 2 + 8, -ph / 2 + 2, pw - 16, 3, 2);
  ctx.fill();
  ctx.restore();

  // balls (additive trail)
  ctx.globalCompositeOperation = 'lighter';
  for (const b of balls) {
    const col = G.fire > 0 ? [255, 130, 50] : [150, 200, 255];
    b.trail.forEach((p, i) => {
      const k = 1 - i / b.trail.length;
      ctx.fillStyle = `rgba(${col},${k * 0.35})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, b.r * (0.4 + k * 0.6), 0, TAU);
      ctx.fill();
    });
    const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r * 3);
    g.addColorStop(0, `rgba(${col},0.55)`);
    g.addColorStop(1, `rgba(${col},0)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r * 3, 0, TAU);
    ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
  for (const b of balls) {
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, TAU);
    ctx.fill();
    if (b.stuck && G.state === 'playing') {
      // aim hint
      ctx.strokeStyle = `rgba(255,255,255,${0.35 + 0.25 * Math.sin(t * 6)})`;
      ctx.setLineDash([6, 8]);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(b.x, b.y - 14);
      ctx.lineTo(b.x, b.y - 90);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  // particles / rings / texts
  for (const p of parts) {
    ctx.globalAlpha = clamp((p.life / p.max) * 1.5, 0, 1);
    ctx.fillStyle = p.color;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
    ctx.restore();
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'lighter';
  for (const r of rings) {
    const k = 1 - r.life / r.max;
    ctx.globalAlpha = (1 - k) * 0.9;
    ctx.strokeStyle = r.color;
    ctx.lineWidth = 4 * (1 - k) + 0.5;
    ctx.beginPath();
    ctx.arc(r.x, r.y, r.r0 + (r.r1 - r.r0) * (1 - Math.pow(1 - k, 3)), 0, TAU);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.font = '700 15px Rubik, sans-serif';
  ctx.textAlign = 'center';
  for (const x of texts) {
    ctx.globalAlpha = clamp((x.life / x.max) * 1.6, 0, 1);
    ctx.fillStyle = x.color;
    ctx.fillText(x.s, x.x, x.y);
  }
  ctx.globalAlpha = 1;

  // active power-up bars
  let by = FH - 12;
  for (const [v, c, mx, n] of [
    [G.wide, '#4dc3ff', 12, 'WIDE'],
    [G.slow, '#4dff9a', 9, 'SLOW'],
    [G.fire, '#ff7a3d', 6, 'FIRE'],
  ]) {
    if (v <= 0) continue;
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(12, by - 4, 90, 4);
    ctx.fillStyle = c;
    ctx.fillRect(12, by - 4, (90 * v) / mx, 4);
    ctx.fillStyle = c;
    ctx.font = '700 10px Rubik';
    ctx.textAlign = 'left';
    ctx.fillText(n, 108, by);
    by -= 14;
  }

  // flash
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (G.flash > 0) {
    ctx.fillStyle = `rgba(255,255,255,${G.flash * 0.45})`;
    ctx.fillRect(0, 0, W, H);
  }
}

// ---------- Loop ----------
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = clamp((now - last) / 1000, 0, 0.033);
  last = now;
  if (G.state !== 'paused') update(dt);
  render(now);
}

// ---------- Init ----------
layout();
paddle = { x: FW / 2, w: PAD_W0, vis: PAD_W0, sq: 0 };
bricks = [];
balls = [];
drops = [];
parts = [];
rings = [];
texts = [];
buildLevel(1);
bricks.forEach((b) => (b.born = 1));
// attract mode: a ball bounces around behind the menu
balls = [
  { x: FW / 2, y: 400, vx: 220, vy: -300, r: 8, stuck: false, trail: [] },
];
el.bestMenu.textContent = best.toLocaleString('en-US');
requestAnimationFrame((n) => {
  last = n;
  frame(n);
});
// menu demo: AI paddle follows the ball
const menuLoop = setInterval(() => {
  if (G.state !== 'menu') {
    clearInterval(menuLoop);
    return;
  }
  const b = balls[0];
  if (b) target = b.x;
}, 30);

if (location.search.includes('debug')) {
  debug = {
    G,
    start: startGame,
    sim: (n) => {
      for (let i = 0; i < n; i++) update(1 / 60);
    },
    get balls() {
      return balls;
    },
    get bricks() {
      return bricks;
    },
    paddle: () => paddle,
    setTarget: (x) => {
      target = x;
    },
  };
  window.__bb = debug;
}

// ============================================================
//  NEON DRIFT — shooter spatial néon
// ============================================================
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const $ = (id) => document.getElementById(id);
const el = {
  hud: $('hud'),
  score: $('score'),
  combo: $('combo'),
  hearts: $('hearts'),
  buffs: $('buffs'),
  dashFill: $('dashFill'),
  menu: $('menu'),
  pause: $('pause'),
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
const dist2 = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;

let W = 0,
  H = 0,
  dpr = 1;
function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  W = window.innerWidth;
  H = window.innerHeight;
  canvas.width = Math.floor(W * dpr);
  canvas.height = Math.floor(H * dpr);
  initStars();
}
window.addEventListener('resize', resize);

// ---------- Sauvegarde ----------
let best = 0;
try {
  best = parseInt(localStorage.getItem('neondrift-best') || '0', 10) || 0;
} catch (e) {}
const saveBest = () => {
  try {
    localStorage.setItem('neondrift-best', String(best));
  } catch (e) {}
};

// ---------- Audio (synthé WebAudio) ----------
let ac = null;
let muted = false;
function initAudio() {
  if (!ac) {
    try {
      ac = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) {}
  }
  if (ac && ac.state === 'suspended') ac.resume();
}
function beep(freq, dur, type = 'square', vol = 0.04, slide = 0) {
  if (!ac || muted) return;
  const t = ac.currentTime;
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
const sfx = {
  shoot: () => beep(880, 0.06, 'square', 0.012, -500),
  hit: () => beep(300, 0.07, 'triangle', 0.03, -150),
  boom: (big) => {
    beep(big ? 120 : 200, big ? 0.35 : 0.2, 'sawtooth', 0.06, -90);
  },
  power: () => {
    beep(520, 0.1, 'sine', 0.06, 400);
    setTimeout(() => beep(780, 0.14, 'sine', 0.06, 500), 80);
  },
  dash: () => beep(300, 0.18, 'sawtooth', 0.04, 900),
  hurt: () => beep(160, 0.4, 'sawtooth', 0.09, -110),
  over: () => {
    beep(330, 0.3, 'square', 0.07, -200);
    setTimeout(() => beep(180, 0.6, 'square', 0.07, -120), 250);
  },
};

// ---------- Entrées ----------
const keys = new Set();
const pointer = { active: false, x: 0, y: 0, touch: false };

const KEYMAP = {
  ArrowLeft: 'L',
  KeyA: 'L',
  KeyQ: 'L',
  ArrowRight: 'R',
  KeyD: 'R',
  ArrowUp: 'U',
  KeyW: 'U',
  KeyZ: 'U',
  ArrowDown: 'D',
  KeyS: 'D',
};

window.addEventListener('keydown', (e) => {
  initAudio();
  if (e.code === 'Space') {
    e.preventDefault();
    if (!e.repeat) tryDash();
    return;
  }
  if (KEYMAP[e.code]) {
    keys.add(KEYMAP[e.code]);
    e.preventDefault();
    return;
  }
  if (e.repeat) return;
  if (e.code === 'KeyP' || e.code === 'Escape') togglePause();
  else if (e.code === 'KeyM') muted = !muted;
  else if (e.code === 'Enter' && G.state !== 'playing' && G.state !== 'paused')
    startGame();
});
window.addEventListener('keyup', (e) => {
  if (KEYMAP[e.code]) keys.delete(KEYMAP[e.code]);
});
window.addEventListener('blur', () => {
  keys.clear();
  if (G.state === 'playing') togglePause(true);
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden && G.state === 'playing') togglePause(true);
});

function setPointer(e) {
  pointer.active = true;
  pointer.touch = e.pointerType === 'touch';
  pointer.x = e.clientX;
  pointer.y = e.clientY;
}
canvas.addEventListener('pointerdown', (e) => {
  initAudio();
  setPointer(e);
});
canvas.addEventListener('pointermove', setPointer);
canvas.addEventListener('pointerleave', (e) => {
  if (e.pointerType === 'mouse') pointer.active = false;
});
canvas.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  tryDash();
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
$('pauseBtn').onclick = () => togglePause();
$('dashBtn').addEventListener('pointerdown', (e) => {
  e.stopPropagation();
  initAudio();
  tryDash();
});

// ---------- État du jeu ----------
const G = {
  state: 'menu', // menu | playing | paused | over
  t: 0,
  score: 0,
  combo: 0,
  comboT: 0,
  mult: 1,
  shake: 0,
  timeScale: 1,
  spawnT: 1,
  flash: 0,
  fireSfxT: 0,
};
let player, bullets, ebullets, enemies, particles, powerups, popups;

function newPlayer() {
  return {
    x: W / 2,
    y: H * 0.8,
    vx: 0,
    vy: 0,
    r: 14,
    hp: 3,
    maxHp: 3,
    inv: 0,
    fireCd: 0,
    dash: 0,
    dashCd: 0,
    dx: 0,
    dy: -1,
    shield: false,
    rapid: 0,
    multi: 0,
    alive: true,
    tilt: 0,
  };
}

function reset() {
  bullets = [];
  ebullets = [];
  enemies = [];
  particles = [];
  powerups = [];
  popups = [];
  player = newPlayer();
  Object.assign(G, {
    t: 0,
    score: 0,
    combo: 0,
    comboT: 0,
    mult: 1,
    shake: 0,
    timeScale: 1,
    spawnT: 0.8,
    flash: 0,
  });
  lastHud.hearts = '';
  lastHud.buffs = '';
  lastHud.combo = '#';
}

function startGame() {
  reset();
  G.state = 'playing';
  el.menu.classList.add('hidden');
  el.over.classList.add('hidden');
  el.pause.classList.add('hidden');
  el.hud.classList.remove('off');
  $('pauseBtn').classList.remove('hidden');
}

function togglePause(force) {
  if (G.state !== 'playing' && G.state !== 'paused') return;
  const wantPause = force === undefined ? G.state === 'playing' : force;
  G.state = wantPause ? 'paused' : 'playing';
  el.pause.classList.toggle('hidden', !wantPause);
  if (!wantPause) last = performance.now();
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
    if (G.state !== 'over') return;
    el.finalScore.textContent = G.score.toLocaleString('en-US');
    el.bestOver.textContent = best.toLocaleString('en-US');
    el.newBest.classList.toggle('hidden', !isBest);
    el.over.classList.remove('hidden');
    el.hud.classList.add('off');
  }, 1100);
}

// ---------- Étoiles (parallaxe) ----------
let stars = [];
function initStars() {
  stars = [];
  const n = Math.floor((W * H) / 5500);
  for (let i = 0; i < n; i++) {
    const layer = Math.random();
    stars.push({
      x: Math.random() * W,
      y: Math.random() * H,
      z: layer < 0.6 ? 1 : layer < 0.9 ? 2 : 3,
      tw: Math.random() * TAU,
    });
  }
}

// ---------- Particules ----------
function burst(x, y, n, hue, speed = 260, size = 3, life = 0.7) {
  for (let i = 0; i < n; i++) {
    if (particles.length > 700) break;
    const a = Math.random() * TAU;
    const s = rand(0.2, 1) * speed;
    particles.push({
      x,
      y,
      vx: Math.cos(a) * s,
      vy: Math.sin(a) * s,
      life: rand(0.4, 1) * life,
      max: life,
      size: rand(0.5, 1) * size,
      hue,
    });
  }
}
function popup(x, y, text, hue = 50) {
  popups.push({ x, y, text, life: 0.9, hue });
}

// ---------- Ennemis ----------
function speedScale() {
  return 1 + Math.min(G.t / 90, 1.3);
}

function spawnAsteroid(size, x, y, vx, vy) {
  const r = size === 3 ? 46 : size === 2 ? 30 : 18;
  const verts = [];
  const n = 9;
  for (let i = 0; i < n; i++) verts.push(rand(0.78, 1.12));
  enemies.push({
    type: 'asteroid',
    size,
    r,
    x: x ?? rand(r, W - r),
    y: y ?? -r - 10,
    vx: vx ?? rand(-45, 45),
    vy: vy ?? rand(80, 150) * speedScale() * (size === 1 ? 1.25 : 1),
    rot: Math.random() * TAU,
    rs: rand(-1.5, 1.5),
    verts,
    hp: size === 3 ? 4 : size === 2 ? 2 : 1,
    flash: 0,
    hue: size === 3 ? 285 : size === 2 ? 320 : 355,
  });
}
function spawnDiver() {
  enemies.push({
    type: 'diver',
    r: 20,
    x: rand(40, W - 40),
    y: -30,
    vx: 0,
    vy: 170 * speedScale(),
    hp: 2,
    flash: 0,
    hue: 50,
    rot: 0,
  });
}
function spawnShooter() {
  enemies.push({
    type: 'shooter',
    r: 26,
    x: rand(80, W - 80),
    y: -40,
    vx: 0,
    vy: 0,
    ty: rand(90, 190),
    t: Math.random() * 10,
    fire: 1.2,
    hp: 5,
    flash: 0,
    hue: 140,
    rot: 0,
  });
}

function spawnLogic(dt) {
  G.spawnT -= dt;
  if (G.spawnT > 0) return;
  G.spawnT = Math.max(0.26, 1.0 - G.t * 0.009) * rand(0.7, 1.3);
  const r = Math.random();
  const shooters = enemies.filter((e) => e.type === 'shooter').length;
  if (G.t > 25 && r < 0.1 && shooters < 2) spawnShooter();
  else if (G.t > 12 && r < 0.32) spawnDiver();
  else spawnAsteroid(r < 0.45 ? 3 : r < 0.8 ? 2 : 1);
}

function killEnemy(e) {
  const idx = enemies.indexOf(e);
  if (idx >= 0) enemies.splice(idx, 1);

  const base =
    e.type === 'asteroid' ? e.size * 10 : e.type === 'diver' ? 40 : 100;
  G.combo++;
  G.comboT = 2.3;
  G.mult = Math.min(8, 1 + Math.floor(G.combo / 6));
  const pts = base * G.mult;
  G.score += pts;
  popup(e.x, e.y - e.r, '+' + pts, e.hue);
  burst(e.x, e.y, Math.floor(e.r * 0.9), e.hue, 280, 3.5, 0.8);
  burst(e.x, e.y, 6, 0, 120, 2.5, 0.4);
  G.shake = Math.min(14, G.shake + e.r * 0.16);
  sfx.boom(e.r > 30);

  if (e.type === 'asteroid' && e.size > 1) {
    for (let i = -1; i <= 1; i += 2) {
      spawnAsteroid(
        e.size - 1,
        e.x + i * 10,
        e.y,
        i * rand(60, 130) + e.vx * 0.3,
        Math.max(70, e.vy * rand(0.8, 1.2))
      );
    }
  }
  const dropChance = e.type === 'shooter' ? 0.5 : 0.07;
  if (Math.random() < dropChance) {
    const types = ['rapid', 'multi'];
    if (!player.shield) types.push('shield');
    if (player.hp < player.maxHp) types.push('heal');
    powerups.push({
      x: e.x,
      y: e.y,
      vy: 90,
      type: types[Math.floor(Math.random() * types.length)],
      t: 0,
      r: 15,
    });
  }
}

const POWER = {
  rapid: { c: 50, l: 'R', name: 'RAPID FIRE' },
  multi: { c: 320, l: 'M', name: 'MULTI-SHOT' },
  shield: { c: 185, l: 'S', name: 'SHIELD' },
  heal: { c: 140, l: '+', name: 'LIFE' },
};

function hurtPlayer() {
  if (player.inv > 0 || player.dash > 0 || !player.alive) return;
  if (player.shield) {
    player.shield = false;
    player.inv = 0.8;
    burst(player.x, player.y, 24, 185, 320, 3, 0.6);
    G.shake = 10;
    sfx.hurt();
    return;
  }
  player.hp--;
  player.inv = 1.7;
  G.combo = 0;
  G.mult = 1;
  G.comboT = 0;
  G.shake = 22;
  G.flash = 0.35;
  sfx.hurt();
  burst(player.x, player.y, 30, 340, 360, 3.5, 0.8);
  if (player.hp <= 0) {
    player.alive = false;
    burst(player.x, player.y, 120, 185, 520, 4.5, 1.4);
    burst(player.x, player.y, 60, 320, 380, 4, 1.2);
    G.timeScale = 0.25;
    gameOver();
  }
}

function tryDash() {
  if (G.state !== 'playing' || !player.alive || player.dashCd > 0) return;
  player.dash = 0.16;
  player.dashCd = 1.5;
  player.inv = Math.max(player.inv, 0.3);
  player.vx = player.dx * 1400;
  player.vy = player.dy * 1400;
  sfx.dash();
  burst(player.x, player.y, 16, 185, 200, 3, 0.4);
}

// ---------- Mise à jour ----------
function update(dt) {
  const p = player;
  G.t += dt;

  // --- Joueur ---
  if (p.alive) {
    let ax = 0,
      ay = 0;
    if (keys.has('L')) ax -= 1;
    if (keys.has('R')) ax += 1;
    if (keys.has('U')) ay -= 1;
    if (keys.has('D')) ay += 1;

    if (p.dash > 0) {
      p.dash -= dt;
      if (Math.random() < 0.9) burst(p.x, p.y, 2, 185, 40, 4, 0.35);
    } else if (ax || ay) {
      const l = Math.hypot(ax, ay);
      ax /= l;
      ay /= l;
      p.vx += ax * 3600 * dt;
      p.vy += ay * 3600 * dt;
      p.vx -= p.vx * 7 * dt;
      p.vy -= p.vy * 7 * dt;
      p.dx = ax;
      p.dy = ay;
    } else if (pointer.active) {
      const tx = pointer.x;
      const ty = pointer.y - (pointer.touch ? 80 : 0);
      const dx = tx - p.x,
        dy = ty - p.y;
      // ressort amorti
      p.vx += (dx * 180 - p.vx * 17) * dt;
      p.vy += (dy * 180 - p.vy * 17) * dt;
      const l = Math.hypot(dx, dy);
      if (l > 12) {
        p.dx = dx / l;
        p.dy = dy / l;
      }
    } else {
      p.vx -= p.vx * 9 * dt;
      p.vy -= p.vy * 9 * dt;
    }
    if (p.dash <= 0) {
      const sp = Math.hypot(p.vx, p.vy);
      if (sp > 780) {
        p.vx *= 780 / sp;
        p.vy *= 780 / sp;
      }
    } else {
      p.vx -= p.vx * 2 * dt;
      p.vy -= p.vy * 2 * dt;
    }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.x = clamp(p.x, 20, W - 20);
    p.y = clamp(p.y, 40, H - 24);
    p.tilt += (clamp(p.vx / 700, -1, 1) - p.tilt) * Math.min(1, 12 * dt);

    p.inv = Math.max(0, p.inv - dt);
    p.dashCd = Math.max(0, p.dashCd - dt);
    p.rapid = Math.max(0, p.rapid - dt);
    p.multi = Math.max(0, p.multi - dt);

    // Tir auto
    p.fireCd -= dt;
    const interval = p.rapid > 0 ? 0.075 : 0.15;
    while (p.fireCd <= 0) {
      p.fireCd += interval;
      const shots = p.multi > 0 ? [-0.22, 0, 0.22] : [0];
      for (const a of shots) {
        bullets.push({
          x: p.x + a * 40,
          y: p.y - 16,
          vx: Math.sin(a) * 900,
          vy: -Math.cos(a) * 900,
          life: 1.4,
        });
      }
      if (G.fireSfxT <= 0) {
        sfx.shoot();
        G.fireSfxT = 0.07;
      }
    }
    G.fireSfxT -= dt;

    // Flamme moteur
    if (Math.random() < 0.8) {
      particles.push({
        x: p.x + rand(-4, 4),
        y: p.y + 14,
        vx: rand(-25, 25) - p.vx * 0.1,
        vy: rand(160, 280) + (p.dash > 0 ? 0 : 0),
        life: 0.3,
        max: 0.3,
        size: rand(2, 4),
        hue: rand(170, 200),
      });
    }
  }

  // --- Combo ---
  if (G.comboT > 0) {
    G.comboT -= dt;
    if (G.comboT <= 0) {
      G.combo = 0;
      G.mult = 1;
    }
  }

  // --- Spawns ---
  if (p.alive) spawnLogic(dt);

  // --- Balles du joueur ---
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
    if (b.life <= 0 || b.y < -30 || b.x < -30 || b.x > W + 30)
      bullets.splice(i, 1);
  }

  // --- Ennemis ---
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    e.flash = Math.max(0, e.flash - dt);
    if (e.type === 'asteroid') {
      e.x += e.vx * dt;
      e.y += e.vy * dt;
      e.rot += e.rs * dt;
      if (e.x < e.r && e.vx < 0) e.vx = Math.abs(e.vx);
      if (e.x > W - e.r && e.vx > 0) e.vx = -Math.abs(e.vx);
    } else if (e.type === 'diver') {
      const dx = player.x - e.x;
      e.vx += clamp(dx, -200, 200) * 1.4 * dt;
      e.vx -= e.vx * 2.2 * dt;
      e.x += e.vx * dt;
      e.y += e.vy * dt;
    } else if (e.type === 'shooter') {
      e.t += dt;
      if (e.y < e.ty) e.y += 110 * dt;
      else e.y += Math.sin(e.t * 1.5) * 12 * dt;
      e.x += Math.cos(e.t * 0.9) * 70 * dt;
      e.x = clamp(e.x, 40, W - 40);
      e.fire -= dt;
      if (e.fire <= 0 && e.y >= e.ty - 5 && player.alive) {
        e.fire = rand(1.5, 2.2);
        const a = Math.atan2(player.y - e.y, player.x - e.x);
        const s = 240 + Math.min(G.t, 120);
        ebullets.push({
          x: e.x,
          y: e.y + 10,
          vx: Math.cos(a) * s,
          vy: Math.sin(a) * s,
          r: 7,
          life: 6,
        });
        burst(e.x, e.y + 10, 5, 140, 80, 2.5, 0.3);
      }
    }
    if (e.y > H + 80) {
      enemies.splice(i, 1);
      continue;
    }

    // balles joueur vs ennemi
    for (let j = bullets.length - 1; j >= 0; j--) {
      const b = bullets[j];
      const rr = e.r + 4;
      if ((b.x - e.x) ** 2 + (b.y - e.y) ** 2 < rr * rr) {
        bullets.splice(j, 1);
        e.hp--;
        e.flash = 0.07;
        burst(b.x, b.y, 3, e.hue, 140, 2, 0.3);
        if (e.hp <= 0) {
          killEnemy(e);
          break;
        } else sfx.hit();
      }
    }
  }

  // collision joueur vs ennemis
  if (p.alive) {
    for (const e of enemies) {
      const rr = e.r * 0.85 + p.r * 0.7;
      if (dist2(e, p) < rr * rr) {
        if (p.dash > 0) {
          // le dash détruit les petits
          e.hp -= 2;
          if (e.hp <= 0) killEnemy(e);
        } else if (p.inv <= 0) {
          hurtPlayer();
          if (e.type !== 'shooter') {
            e.hp = 0;
            killEnemy(e);
          }
        }
        break;
      }
    }
  }

  // --- Balles ennemies ---
  for (let i = ebullets.length - 1; i >= 0; i--) {
    const b = ebullets[i];
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
    if (b.life <= 0 || b.y > H + 20 || b.y < -40 || b.x < -20 || b.x > W + 20) {
      ebullets.splice(i, 1);
      continue;
    }
    if (p.alive) {
      const rr = b.r + p.r * 0.6;
      if (dist2(b, p) < rr * rr) {
        ebullets.splice(i, 1);
        hurtPlayer();
      }
    }
  }

  // --- Power-ups ---
  for (let i = powerups.length - 1; i >= 0; i--) {
    const u = powerups[i];
    u.t += dt;
    u.y += u.vy * dt;
    u.x += Math.sin(u.t * 3) * 30 * dt;
    if (u.y > H + 30) {
      powerups.splice(i, 1);
      continue;
    }
    if (p.alive) {
      // petit aimant
      const d = Math.sqrt(dist2(u, p));
      if (d < 130) {
        u.x += (p.x - u.x) * 4 * dt;
        u.y += (p.y - u.y) * 4 * dt;
      }
      if (d < u.r + p.r + 6) {
        powerups.splice(i, 1);
        sfx.power();
        const info = POWER[u.type];
        if (u.type === 'rapid') p.rapid = 9;
        else if (u.type === 'multi') p.multi = 9;
        else if (u.type === 'shield') p.shield = true;
        else if (u.type === 'heal') p.hp = Math.min(p.maxHp, p.hp + 1);
        popup(u.x, u.y - 20, info.name, info.c);
        burst(u.x, u.y, 22, info.c, 260, 3, 0.6);
        G.score += 25 * G.mult;
      }
    }
  }

  // --- Particules ---
  for (let i = particles.length - 1; i >= 0; i--) {
    const q = particles[i];
    q.life -= dt;
    if (q.life <= 0) {
      particles.splice(i, 1);
      continue;
    }
    q.x += q.vx * dt;
    q.y += q.vy * dt;
    q.vx -= q.vx * 1.8 * dt;
    q.vy -= q.vy * 1.8 * dt;
  }
  for (let i = popups.length - 1; i >= 0; i--) {
    const q = popups[i];
    q.life -= dt;
    q.y -= 40 * dt;
    if (q.life <= 0) popups.splice(i, 1);
  }

  G.shake = Math.max(0, G.shake - dt * 40);
  G.flash = Math.max(0, G.flash - dt);
}

// ---------- Rendu ----------
function drawStars(dt, t) {
  for (const s of stars) {
    s.y +=
      s.z * s.z * 14 * dt * (G.state === 'playing' ? 1 : 0.5) + s.z * 6 * dt;
    if (s.y > H) {
      s.y = -2;
      s.x = Math.random() * W;
    }
    const tw = 0.6 + 0.4 * Math.sin(t * 2 + s.tw);
    ctx.globalAlpha = (0.25 + s.z * 0.22) * tw;
    ctx.fillStyle = s.z === 3 ? '#cfe9ff' : s.z === 2 ? '#b9a8ff' : '#ffffff';
    const size = s.z * 0.8;
    if (s.z === 3) ctx.fillRect(s.x, s.y, size, size * 4);
    else ctx.fillRect(s.x, s.y, size, size);
  }
  ctx.globalAlpha = 1;
}

function drawPlayer(t) {
  const p = player;
  if (!p.alive) return;
  if (p.inv > 0 && p.dash <= 0 && Math.floor(t * 18) % 2 === 0) return; // clignote

  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(p.tilt * 0.35);
  ctx.shadowColor = 'rgba(25,230,255,0.95)';
  ctx.shadowBlur = p.dash > 0 ? 40 : 22;

  // flamme
  const fl = 10 + Math.random() * 8 + (p.dash > 0 ? 14 : 0);
  ctx.fillStyle = 'rgba(255,120,60,0.9)';
  ctx.beginPath();
  ctx.moveTo(-5, 12);
  ctx.lineTo(0, 12 + fl);
  ctx.lineTo(5, 12);
  ctx.closePath();
  ctx.fill();

  // corps
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(0, -20);
  ctx.lineTo(14, 14);
  ctx.lineTo(5, 9);
  ctx.lineTo(0, 14);
  ctx.lineTo(-5, 9);
  ctx.lineTo(-14, 14);
  ctx.closePath();
  const g = ctx.createLinearGradient(0, -20, 0, 14);
  g.addColorStop(0, '#e9fdff');
  g.addColorStop(1, '#19e6ff');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = '#ffffff';
  ctx.stroke();
  // cockpit
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#ff2fb9';
  ctx.beginPath();
  ctx.ellipse(0, -2, 2.8, 6, 0, 0, TAU);
  ctx.fill();

  // bouclier
  if (p.shield) {
    ctx.strokeStyle = `hsla(185,100%,70%,${0.6 + 0.3 * Math.sin(t * 8)})`;
    ctx.lineWidth = 2.5;
    ctx.shadowColor = '#19e6ff';
    ctx.shadowBlur = 18;
    ctx.beginPath();
    ctx.arc(0, 0, 28, 0, TAU);
    ctx.stroke();
  }
  ctx.restore();
}

function drawAsteroid(e) {
  ctx.save();
  ctx.translate(e.x, e.y);
  ctx.rotate(e.rot);
  ctx.beginPath();
  const n = e.verts.length;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    const r = e.r * e.verts[i];
    const x = Math.cos(a) * r,
      y = Math.sin(a) * r;
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle =
    e.flash > 0 ? 'rgba(255,255,255,0.9)' : `hsla(${e.hue},90%,55%,0.16)`;
  ctx.fill();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = e.flash > 0 ? '#fff' : `hsl(${e.hue},100%,65%)`;
  ctx.shadowColor = `hsl(${e.hue},100%,60%)`;
  ctx.shadowBlur = 14;
  ctx.stroke();
  ctx.restore();
}

function drawDiver(e) {
  ctx.save();
  ctx.translate(e.x, e.y);
  ctx.rotate(clamp(e.vx / 400, -0.6, 0.6));
  ctx.beginPath();
  ctx.moveTo(0, 22);
  ctx.lineTo(18, -16);
  ctx.lineTo(0, -6);
  ctx.lineTo(-18, -16);
  ctx.closePath();
  ctx.fillStyle = e.flash > 0 ? '#fff' : 'hsla(50,100%,55%,0.2)';
  ctx.fill();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = e.flash > 0 ? '#fff' : '#ffd23f';
  ctx.shadowColor = '#ffd23f';
  ctx.shadowBlur = 16;
  ctx.lineJoin = 'round';
  ctx.stroke();
  ctx.restore();
}

function drawShooter(e, t) {
  ctx.save();
  ctx.translate(e.x, e.y);
  ctx.shadowColor = '#4dff9a';
  ctx.shadowBlur = 18;
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = e.flash > 0 ? '#fff' : '#4dff9a';
  ctx.fillStyle = e.flash > 0 ? '#fff' : 'rgba(77,255,154,0.15)';
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + Math.PI / 6;
    const x = Math.cos(a) * 26,
      y = Math.sin(a) * 26;
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.rotate(t * 2);
  ctx.beginPath();
  ctx.arc(0, 0, 9, 0, TAU * 0.75);
  ctx.stroke();
  ctx.restore();
}

function drawPowerup(u, t) {
  const info = POWER[u.type];
  ctx.save();
  ctx.translate(u.x, u.y);
  ctx.shadowColor = `hsl(${info.c},100%,60%)`;
  ctx.shadowBlur = 20;
  ctx.strokeStyle = `hsl(${info.c},100%,65%)`;
  ctx.fillStyle = `hsla(${info.c},100%,60%,0.18)`;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(0, 0, u.r + Math.sin(t * 6) * 1.5, 0, TAU);
  ctx.fill();
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#fff';
  ctx.font = '700 15px Orbitron, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(info.l, 0, 1);
  ctx.restore();
}

function render(dt, t) {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);

  ctx.save();
  if (G.shake > 0)
    ctx.translate(rand(-G.shake, G.shake) * 0.5, rand(-G.shake, G.shake) * 0.5);

  drawStars(dt, t);

  if (G.state !== 'menu') {
    // power-ups
    for (const u of powerups) drawPowerup(u, t);

    // ennemis
    for (const e of enemies) {
      if (e.type === 'asteroid') drawAsteroid(e);
      else if (e.type === 'diver') drawDiver(e);
      else drawShooter(e, t);
    }

    // balles ennemies
    ctx.globalCompositeOperation = 'lighter';
    for (const b of ebullets) {
      const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r * 2.6);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.35, 'rgba(255,60,140,0.95)');
      g.addColorStop(1, 'rgba(255,40,120,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r * 2.6, 0, TAU);
      ctx.fill();
    }

    // balles joueur (traînées lumineuses)
    ctx.lineCap = 'round';
    for (const b of bullets) {
      ctx.strokeStyle = 'rgba(25,230,255,0.35)';
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.moveTo(b.x, b.y);
      ctx.lineTo(b.x - b.vx * 0.025, b.y - b.vy * 0.025);
      ctx.stroke();
      ctx.strokeStyle = '#eaffff';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(b.x, b.y);
      ctx.lineTo(b.x - b.vx * 0.018, b.y - b.vy * 0.018);
      ctx.stroke();
    }

    // particules
    for (const q of particles) {
      const k = q.life / q.max;
      ctx.globalAlpha = Math.min(1, k * 1.4);
      ctx.fillStyle =
        q.hue === 0 ? '#fff' : `hsl(${q.hue},100%,${55 + 20 * k}%)`;
      const s = q.size * (0.4 + k);
      ctx.fillRect(q.x - s / 2, q.y - s / 2, s, s);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';

    drawPlayer(t);

    // popups de score
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '700 15px Orbitron, sans-serif';
    for (const q of popups) {
      ctx.globalAlpha = clamp(q.life * 1.6, 0, 1);
      ctx.fillStyle = `hsl(${q.hue},100%,70%)`;
      ctx.fillText(q.text, q.x, q.y);
    }
    ctx.globalAlpha = 1;
  }
  ctx.restore();

  // flash rouge quand on est touché
  if (G.flash > 0) {
    ctx.fillStyle = `rgba(255,30,100,${G.flash * 0.5})`;
    ctx.fillRect(0, 0, W, H);
  }
  // vignette
  const vg = ctx.createRadialGradient(
    W / 2,
    H / 2,
    Math.min(W, H) * 0.45,
    W / 2,
    H / 2,
    Math.max(W, H) * 0.8
  );
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);
}

// ---------- HUD (DOM, mis à jour seulement si changé) ----------
const lastHud = {
  score: -1,
  hearts: '',
  buffs: '',
  combo: '#',
  dash: -1,
  dashCharging: null,
};
function updateHud() {
  if (G.score !== lastHud.score) {
    el.score.textContent = G.score.toLocaleString('en-US');
    el.score.classList.remove('pop');
    void el.score.offsetWidth;
    el.score.classList.add('pop');
    lastHud.score = G.score;
  }
  let h = '';
  for (let i = 0; i < player.maxHp; i++)
    h += i < player.hp ? '♥' : '<span class="lost">♥</span>';
  if (h !== lastHud.hearts) {
    el.hearts.innerHTML = h;
    lastHud.hearts = h;
  }

  let b = '';
  if (player.shield)
    b += `<span class="buff" style="color:hsl(185,100%,65%)">SHIELD</span>`;
  if (player.rapid > 0)
    b += `<span class="buff" style="color:hsl(50,100%,65%)">RAPID ${Math.ceil(
      player.rapid
    )}</span>`;
  if (player.multi > 0)
    b += `<span class="buff" style="color:hsl(320,100%,70%)">MULTI ${Math.ceil(
      player.multi
    )}</span>`;
  if (b !== lastHud.buffs) {
    el.buffs.innerHTML = b;
    lastHud.buffs = b;
  }

  const c = G.combo >= 3 ? `COMBO ×${G.mult}  ·  ${G.combo}` : '';
  if (c !== lastHud.combo) {
    el.combo.textContent = c;
    lastHud.combo = c;
  }

  const ready = player.dashCd <= 0;
  const pct = Math.round((ready ? 1 : 1 - player.dashCd / 1.5) * 100);
  if (pct !== lastHud.dash) {
    el.dashFill.style.width = pct + '%';
    lastHud.dash = pct;
  }
  if (ready !== lastHud.dashCharging) {
    el.dashFill.classList.toggle('charging', !ready);
    lastHud.dashCharging = ready;
  }
}

// ---------- Boucle principale ----------
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  let rawDt = (now - last) / 1000;
  last = now;
  rawDt = clamp(rawDt, 0, 0.033);
  const t = now / 1000;

  if (G.state === 'playing' || G.state === 'over') {
    // ralenti à la mort
    if (G.state === 'over') G.timeScale += (0.35 - G.timeScale) * 0.02;
    update(rawDt * G.timeScale);
    updateHud();
  }
  render(G.state === 'paused' ? 0 : rawDt, t);
}

// ---------- Init ----------
resize();
reset();
G.state = 'menu';
el.hud.classList.add('off');
$('pauseBtn').classList.add('hidden');
el.bestMenu.textContent = best.toLocaleString('en-US');
requestAnimationFrame((n) => {
  last = n;
  frame(n);
});

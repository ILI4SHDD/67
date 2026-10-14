// ============================================================
//  COSMO HOP — jeu de plateformes vertical infini
// ============================================================
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const $ = (id) => document.getElementById(id);

const el = {
  hud: $('hud'),
  height: $('height'),
  stars: $('stars'),
  bestHud: $('bestHud'),
  menu: $('menu'),
  pause: $('pause'),
  over: $('over'),
  pauseBtn: $('pauseBtn'),
  finalScore: $('finalScore'),
  finalStars: $('finalStars'),
  newBest: $('newBest'),
  bestMenu: $('bestMenu'),
  bestOver: $('bestOver'),
};

// ---------- Utils ----------
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const TAU = Math.PI * 2;

// ---------- Vue : colonne de jeu de largeur fixe ----------
const GW = 420;
let GH = 760;
let W = 0,
  H = 0,
  dpr = 1,
  S = 1,
  OX = 0;
function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  W = window.innerWidth;
  H = window.innerHeight;
  canvas.width = Math.floor(W * dpr);
  canvas.height = Math.floor(H * dpr);
  S = Math.min(W / GW, H / 700);
  GH = H / S;
  OX = (W - GW * S) / 2;
  initBackground();
}
window.addEventListener('resize', resize);

// ---------- Sauvegarde ----------
let best = 0;
try {
  best = parseInt(localStorage.getItem('cosmohop-best') || '0', 10) || 0;
} catch (e) {}
const saveBest = () => {
  try {
    localStorage.setItem('cosmohop-best', String(best));
  } catch (e) {}
};

// ---------- Audio ----------
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
function beep(freq, dur, type = 'sine', vol = 0.05, slide = 0, delay = 0) {
  if (!ac || muted) return;
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
  jump: () => beep(380, 0.16, 'sine', 0.06, 380),
  spring: () => {
    beep(260, 0.3, 'triangle', 0.08, 900);
    beep(700, 0.2, 'sine', 0.05, 600, 0.05);
  },
  star: () => {
    beep(880, 0.1, 'sine', 0.06);
    beep(1320, 0.18, 'sine', 0.06, 0, 0.07);
  },
  crumble: () => beep(140, 0.25, 'sawtooth', 0.04, -80),
  fall: () => beep(520, 0.7, 'triangle', 0.08, -440),
};

// ---------- Entrées ----------
const keys = new Set();
const pointer = { active: false, x: 0 };
const KEYMAP = {
  ArrowLeft: 'L',
  KeyA: 'L',
  KeyQ: 'L',
  ArrowRight: 'R',
  KeyD: 'R',
};

window.addEventListener('keydown', (e) => {
  initAudio();
  if (KEYMAP[e.code]) {
    keys.add(KEYMAP[e.code]);
    pointer.active = false;
    e.preventDefault();
    return;
  }
  if (e.repeat) return;
  if (e.code === 'KeyP' || e.code === 'Escape') togglePause();
  else if (e.code === 'KeyM') muted = !muted;
  else if (
    (e.code === 'Enter' || e.code === 'Space') &&
    (G.state === 'menu' || G.state === 'over')
  ) {
    e.preventDefault();
    startGame();
  }
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
  pointer.x = (e.clientX - OX) / S; // en coordonnées de jeu
}
canvas.addEventListener('pointerdown', (e) => {
  initAudio();
  setPointer(e);
});
canvas.addEventListener('pointermove', setPointer);

$('playBtn').onclick = () => {
  initAudio();
  startGame();
};
$('retryBtn').onclick = () => {
  initAudio();
  startGame();
};
$('resumeBtn').onclick = () => togglePause(false);
el.pauseBtn.onclick = () => togglePause();

// ---------- État ----------
const G = {
  state: 'menu',
  camY: 0,
  minY: 0,
  topY: 0,
  stars: 0,
  bonus: 0,
  shake: 0,
  timeScale: 1,
  t: 0,
};
let p, platforms, collectibles, particles, popups;

const GRAVITY = 1900;
const JUMP = 880;
const SPRING = 1450;

function newPlayer() {
  return {
    x: GW / 2,
    y: -16,
    vx: 0,
    vy: 0,
    r: 16,
    sx: 1,
    sy: 1,
    alive: true,
    look: 0,
  };
}
const heightM = () => Math.max(0, Math.floor(-G.minY / 10));
const score = () => heightM() + G.bonus;

function reset() {
  platforms = [];
  collectibles = [];
  particles = [];
  popups = [];
  p = newPlayer();
  Object.assign(G, {
    camY: -GH * 0.58,
    minY: 0,
    topY: 0,
    stars: 0,
    bonus: 0,
    shake: 0,
    timeScale: 1,
    t: 0,
  });
  // plateforme de départ large
  platforms.push({
    x: GW / 2 - 70,
    y: 0,
    w: 140,
    h: 14,
    type: 'normal',
    dir: 0,
    t: 0,
    broke: 0,
    spring: false,
    wob: 0,
  });
  G.topY = 0;
  fillPlatforms();
  lastHud.h = -1;
  lastHud.s = -1;
}

// ---------- Génération ----------
function fillPlatforms() {
  while (G.topY > G.camY - 300) {
    const h = Math.max(0, -G.topY / 10);
    const d = Math.min(h / 400, 1);
    const gap = rand(72, 100 + d * 72);
    const y = G.topY - gap;
    const w = rand(64, 84) - d * 16;
    const x = rand(10, GW - w - 10);
    let type = 'normal',
      dir = 0;
    const r = Math.random();
    if (h > 25 && r < 0.12 + d * 0.18) {
      type = 'moving';
      dir = Math.random() < 0.5 ? -1 : 1;
    } else if (h > 55 && r > 0.88 - d * 0.14) type = 'crumble';
    const spring = type === 'normal' && Math.random() < 0.07;
    platforms.push({
      x,
      y,
      w,
      h: 14,
      type,
      dir,
      speed: rand(50, 90) + d * 60,
      t: 0,
      broke: 0,
      spring,
      wob: 0,
    });
    if (Math.random() < 0.2) {
      collectibles.push({
        x: x + w / 2 + rand(-20, 20),
        y: y - rand(60, 100),
        got: false,
        t: Math.random() * 6,
      });
    }
    G.topY = y;
  }
}

// ---------- Particules ----------
function burst(x, y, n, color, speed = 200, size = 3, life = 0.6, grav = 300) {
  for (let i = 0; i < n; i++) {
    if (particles.length > 500) break;
    const a = Math.random() * TAU;
    const s = rand(0.2, 1) * speed;
    particles.push({
      x,
      y,
      vx: Math.cos(a) * s,
      vy: Math.sin(a) * s,
      life: rand(0.5, 1) * life,
      max: life,
      size: rand(0.6, 1) * size,
      color,
      grav,
    });
  }
}
function popup(x, y, text, color = '#ffd166') {
  popups.push({ x, y, text, life: 0.9, color });
}

// ---------- Jeu ----------
function startGame() {
  reset();
  G.state = 'playing';
  el.menu.classList.add('hidden');
  el.over.classList.add('hidden');
  el.pause.classList.add('hidden');
  el.hud.classList.remove('off');
  el.pauseBtn.classList.remove('hidden');
  el.bestHud.textContent = best + ' m';
  // petit saut d'entrée
  p.vy = -JUMP;
  p.sy = 1.3;
  p.sx = 0.8;
  sfx.jump();
}

function togglePause(force) {
  if (G.state !== 'playing' && G.state !== 'paused') return;
  const want = force === undefined ? G.state === 'playing' : force;
  G.state = want ? 'paused' : 'playing';
  el.pause.classList.toggle('hidden', !want);
  if (!want) last = performance.now();
}

function gameOver() {
  G.state = 'over';
  p.alive = false;
  sfx.fall();
  const total = score();
  const isBest = total > best;
  if (isBest) {
    best = total;
    saveBest();
  }
  setTimeout(() => {
    if (G.state !== 'over') return;
    el.finalScore.textContent = total + ' m';
    el.finalStars.textContent = '★ ' + G.stars;
    el.bestOver.textContent = best + ' m';
    el.newBest.classList.toggle('hidden', !isBest);
    el.over.classList.remove('hidden');
    el.hud.classList.add('off');
    el.pauseBtn.classList.add('hidden');
  }, 800);
}

function land(pl) {
  p.sx = 1.38;
  p.sy = 0.68;
  pl.wob = 1;
  if (pl.spring && Math.abs(p.x - (pl.x + pl.w / 2)) < 30) {
    p.vy = -SPRING;
    sfx.spring();
    burst(p.x, p.y + p.r, 22, '#8dffb0', 320, 3.5, 0.7);
    G.shake = 6;
    popup(p.x, p.y - 30, 'BOING!', '#8dffb0');
  } else {
    p.vy = -JUMP;
    sfx.jump();
    burst(
      p.x,
      p.y + p.r,
      8,
      pl.type === 'crumble' ? '#ffb86b' : '#ffffff',
      150,
      2.5,
      0.4
    );
  }
  if (pl.type === 'crumble' && !pl.broke) {
    pl.broke = 0.35;
    sfx.crumble();
  }
}

function update(dt) {
  G.t += dt;

  // Joueur : mouvement horizontal
  if (p.alive) {
    let target = 0;
    if (keys.has('L')) target -= 1;
    if (keys.has('R')) target += 1;
    if (target) {
      p.vx = lerp(p.vx, target * 330, Math.min(1, 14 * dt));
    } else if (pointer.active) {
      const dx = pointer.x - p.x;
      p.vx = lerp(p.vx, clamp(dx * 9, -400, 400), Math.min(1, 16 * dt));
    } else {
      p.vx = lerp(p.vx, 0, Math.min(1, 6 * dt));
    }
    p.look = lerp(p.look, clamp(p.vx / 330, -1, 1), Math.min(1, 12 * dt));

    const prevBottom = p.y + p.r;
    p.vy += GRAVITY * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (p.x < -p.r) p.x = GW + p.r;
    if (p.x > GW + p.r) p.x = -p.r;
    if (p.y < G.minY) G.minY = p.y;

    // Atterrissage
    if (p.vy > 0) {
      const bottom = p.y + p.r;
      for (const pl of platforms) {
        if (pl.broke < 0) continue;
        if (
          prevBottom <= pl.y + 6 &&
          bottom >= pl.y &&
          p.x + p.r * 0.6 > pl.x &&
          p.x - p.r * 0.6 < pl.x + pl.w
        ) {
          p.y = pl.y - p.r;
          land(pl);
          break;
        }
      }
    }

    // Étoiles
    for (const c of collectibles) {
      if (c.got) continue;
      c.t += dt;
      const dx = c.x - p.x,
        dy = c.y - p.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < 120 * 120) {
        c.x -= dx * 3 * dt;
        c.y -= dy * 3 * dt;
      }
      if (d2 < 30 * 30) {
        c.got = true;
        G.stars++;
        G.bonus += 5;
        sfx.star();
        burst(c.x, c.y, 14, '#ffd166', 220, 3, 0.6, 0);
        popup(c.x, c.y - 14, '+5');
        el.stars.parentElement.classList.remove('pop');
        void el.stars.offsetWidth;
        el.stars.parentElement.classList.add('pop');
      }
    }

    // Traînée
    if (Math.random() < 0.7) {
      particles.push({
        x: p.x + rand(-5, 5),
        y: p.y + rand(-2, 8),
        vx: rand(-15, 15),
        vy: rand(10, 40),
        life: 0.35,
        max: 0.35,
        size: rand(3, 6),
        color: p.vy < -1000 ? '#8dffb0' : '#ff9ac7',
        grav: 0,
      });
    }
  } else {
    p.vy += GRAVITY * dt;
    p.y += p.vy * dt;
  }

  // Squash & stretch
  p.sx = lerp(p.sx, 1, Math.min(1, 14 * dt));
  p.sy = lerp(p.sy, 1, Math.min(1, 14 * dt));

  // Plateformes
  for (let i = platforms.length - 1; i >= 0; i--) {
    const pl = platforms[i];
    pl.wob = Math.max(0, pl.wob - dt * 4);
    if (pl.type === 'moving') {
      pl.x += pl.dir * pl.speed * dt;
      if (pl.x < 6) {
        pl.x = 6;
        pl.dir = 1;
      }
      if (pl.x + pl.w > GW - 6) {
        pl.x = GW - 6 - pl.w;
        pl.dir = -1;
      }
    }
    if (pl.broke > 0) {
      pl.broke -= dt;
      if (Math.random() < 0.4)
        particles.push({
          x: pl.x + rand(0, pl.w),
          y: pl.y + 8,
          vx: rand(-30, 30),
          vy: rand(20, 80),
          life: 0.5,
          max: 0.5,
          size: rand(2, 4),
          color: '#ffb86b',
          grav: 500,
        });
      if (pl.broke <= 0) {
        pl.broke = -1;
        pl.fall = 0;
        burst(pl.x + pl.w / 2, pl.y, 14, '#ffb86b', 200, 3, 0.6, 600);
      }
    }
    if (pl.broke === -1) {
      pl.fall += GRAVITY * 0.6 * dt;
      pl.y += pl.fall * dt;
    }
    if (pl.y > G.camY + GH + 120) platforms.splice(i, 1);
  }
  for (let i = collectibles.length - 1; i >= 0; i--) {
    if (collectibles[i].got || collectibles[i].y > G.camY + GH + 100)
      collectibles.splice(i, 1);
  }

  // Caméra (monte seulement)
  const targetCam = p.y - GH * 0.42;
  if (p.alive && targetCam < G.camY)
    G.camY += (targetCam - G.camY) * Math.min(1, 10 * dt);
  if (!p.alive) {
    /* caméra figée */
  }
  fillPlatforms();

  // Chute
  if (p.alive && p.y - G.camY > GH + 60) gameOver();

  // Particules & popups
  for (let i = particles.length - 1; i >= 0; i--) {
    const q = particles[i];
    q.life -= dt;
    if (q.life <= 0) {
      particles.splice(i, 1);
      continue;
    }
    q.vy += q.grav * dt;
    q.x += q.vx * dt;
    q.y += q.vy * dt;
  }
  for (let i = popups.length - 1; i >= 0; i--) {
    const q = popups[i];
    q.life -= dt;
    q.y -= 40 * dt;
    if (q.life <= 0) popups.splice(i, 1);
  }
  G.shake = Math.max(0, G.shake - dt * 25);
}

// Mini animation dans le menu
function updateMenu(dt) {
  G.t += dt;
  p.vy += GRAVITY * dt;
  p.y += p.vy * dt;
  if (p.y + p.r >= 0) {
    p.y = -p.r;
    p.vy = -JUMP;
    p.sx = 1.35;
    p.sy = 0.7;
    burst(p.x, 0, 6, '#fff', 120, 2.5, 0.4);
  }
  p.sx = lerp(p.sx, 1, Math.min(1, 14 * dt));
  p.sy = lerp(p.sy, 1, Math.min(1, 14 * dt));
  for (let i = particles.length - 1; i >= 0; i--) {
    const q = particles[i];
    q.life -= dt;
    if (q.life <= 0) {
      particles.splice(i, 1);
      continue;
    }
    q.vy += q.grav * dt;
    q.x += q.vx * dt;
    q.y += q.vy * dt;
  }
}

// ---------- Fond (ciel dégradé qui change avec l'altitude) ----------
const SKY = [
  { h: 0, top: [58, 28, 113], bot: [255, 126, 95] },
  { h: 120, top: [38, 22, 100], bot: [210, 84, 150] },
  { h: 300, top: [16, 12, 56], bot: [84, 44, 140] },
  { h: 600, top: [6, 4, 26], bot: [30, 18, 80] },
  { h: 1000, top: [2, 2, 14], bot: [10, 44, 78] },
];
function skyColors(h) {
  let a = SKY[0],
    b = SKY[SKY.length - 1];
  for (let i = 0; i < SKY.length - 1; i++) {
    if (h >= SKY[i].h && h <= SKY[i + 1].h) {
      a = SKY[i];
      b = SKY[i + 1];
      break;
    }
  }
  if (h >= SKY[SKY.length - 1].h) a = b;
  const t = a === b ? 0 : (h - a.h) / (b.h - a.h);
  const mix = (x, y) =>
    `rgb(${Math.round(lerp(x[0], y[0], t))},${Math.round(
      lerp(x[1], y[1], t)
    )},${Math.round(lerp(x[2], y[2], t))})`;
  return [mix(a.top, b.top), mix(a.bot, b.bot)];
}

let bgStars = [],
  clouds = [];
function initBackground() {
  bgStars = [];
  clouds = [];
  const n = Math.floor((W * H) / 4500);
  for (let i = 0; i < n; i++)
    bgStars.push({
      x: Math.random() * W,
      y: Math.random() * H,
      z: rand(0.2, 1),
      tw: Math.random() * TAU,
    });
  for (let i = 0; i < 9; i++)
    clouds.push({
      x: Math.random() * W,
      y: Math.random() * H,
      w: rand(120, 260),
      z: rand(0.3, 1),
    });
}

function drawBackground(t) {
  const h = heightM();
  const [top, bot] = skyColors(h);
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, top);
  g.addColorStop(1, bot);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // soleil qui descend
  const sunA = clamp(1 - h / 350, 0, 1);
  if (sunA > 0) {
    const sy = H * 0.68 + h * 1.6;
    const sg = ctx.createRadialGradient(
      W / 2,
      sy,
      10,
      W / 2,
      sy,
      Math.min(W, H) * 0.55
    );
    sg.addColorStop(0, `rgba(255,236,170,${0.95 * sunA})`);
    sg.addColorStop(0.25, `rgba(255,160,110,${0.5 * sunA})`);
    sg.addColorStop(1, 'rgba(255,100,140,0)');
    ctx.fillStyle = sg;
    ctx.fillRect(0, 0, W, H);
  }

  // étoiles
  const starA = clamp((h - 100) / 300, 0, 1);
  if (starA > 0) {
    ctx.fillStyle = '#fff';
    for (const s of bgStars) {
      const y = (((s.y - G.camY * s.z * 0.12) % H) + H) % H;
      ctx.globalAlpha =
        starA * (0.35 + 0.65 * Math.abs(Math.sin(t * 1.5 + s.tw))) * s.z;
      const sz = 1 + s.z * 1.6;
      ctx.fillRect(s.x, y, sz, sz);
    }
    ctx.globalAlpha = 1;
  }

  // nuages
  const cloudA = clamp(1 - h / 450, 0, 1);
  if (cloudA > 0) {
    for (const c of clouds) {
      const y =
        ((((c.y - G.camY * c.z * 0.35) % (H + 200)) + (H + 200)) % (H + 200)) -
        100;
      const x = ((c.x + t * 6 * c.z) % (W + 400)) - 200;
      ctx.globalAlpha = 0.22 * cloudA * c.z;
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.ellipse(x, y, c.w / 2, c.w / 7, 0, 0, TAU);
      ctx.ellipse(x - c.w * 0.2, y - c.w / 12, c.w / 4, c.w / 8, 0, 0, TAU);
      ctx.ellipse(x + c.w * 0.18, y - c.w / 10, c.w / 5, c.w / 9, 0, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}

// ---------- Rendu du monde ----------
function rr(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

const PCOL = {
  normal: ['#7df9ff', '#2fb8ff'],
  moving: ['#c4a7ff', '#7a5cff'],
  crumble: ['#ffd29a', '#ff8a4c'],
};

function drawPlatform(pl, t) {
  const col = PCOL[pl.type];
  let shake = 0;
  if (pl.broke > 0) shake = Math.sin(t * 90) * 2;
  ctx.save();
  const squash = pl.wob > 0 ? Math.sin(pl.wob * Math.PI) * 4 : 0;
  ctx.translate(pl.x + shake, pl.y + squash);
  ctx.shadowColor = col[1];
  ctx.shadowBlur = 16;
  const g = ctx.createLinearGradient(0, 0, 0, pl.h);
  g.addColorStop(0, col[0]);
  g.addColorStop(1, col[1]);
  ctx.fillStyle = g;
  rr(0, 0, pl.w, pl.h, 7);
  ctx.fill();
  ctx.shadowBlur = 0;
  // reflet
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  rr(5, 2.5, pl.w - 10, 3, 1.5);
  ctx.fill();
  // fissures
  if (pl.type === 'crumble') {
    ctx.strokeStyle = 'rgba(90,30,0,0.55)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(pl.w * 0.3, 0);
    ctx.lineTo(pl.w * 0.38, 6);
    ctx.lineTo(pl.w * 0.3, pl.h);
    ctx.moveTo(pl.w * 0.7, 0);
    ctx.lineTo(pl.w * 0.62, 7);
    ctx.lineTo(pl.w * 0.7, pl.h);
    ctx.stroke();
  }
  if (pl.type === 'moving') {
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.beginPath();
    ctx.moveTo(10, pl.h / 2);
    ctx.lineTo(16, pl.h / 2 - 3);
    ctx.lineTo(16, pl.h / 2 + 3);
    ctx.moveTo(pl.w - 10, pl.h / 2);
    ctx.lineTo(pl.w - 16, pl.h / 2 - 3);
    ctx.lineTo(pl.w - 16, pl.h / 2 + 3);
    ctx.fill();
  }
  // ressort
  if (pl.spring) {
    const cx = pl.w / 2;
    const comp = pl.wob > 0 ? 1 - pl.wob * 0.5 : 1;
    const hh = 16 * comp;
    ctx.strokeStyle = '#8dffb0';
    ctx.lineWidth = 3;
    ctx.shadowColor = '#8dffb0';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.moveTo(cx - 10, 0);
    for (let i = 0; i < 4; i++) {
      const yy = -hh * ((i + 1) / 4);
      ctx.lineTo(cx + (i % 2 ? -10 : 10), yy + (hh / 8) * 0);
    }
    ctx.stroke();
    ctx.fillStyle = '#ff5fa2';
    ctx.shadowColor = '#ff5fa2';
    rr(cx - 14, -hh - 6, 28, 7, 3.5);
    ctx.fill();
  }
  ctx.restore();
}

function drawStar(c, t) {
  const bob = Math.sin(c.t * 3) * 3;
  ctx.save();
  ctx.translate(c.x, c.y + bob);
  ctx.rotate(Math.sin(c.t * 2) * 0.2);
  ctx.shadowColor = '#ffd166';
  ctx.shadowBlur = 18;
  ctx.fillStyle = '#ffd166';
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU - Math.PI / 2;
    const r = i % 2 ? 6 : 14;
    ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.beginPath();
  ctx.arc(-3, -3, 2.5, 0, TAU);
  ctx.fill();
  ctx.restore();
}

function drawPlayer(t) {
  if (!p) return;
  ctx.save();
  ctx.translate(p.x, p.y + p.r);
  const stretch = clamp(Math.abs(p.vy) / 4500, 0, 0.22);
  ctx.scale(p.sx * (1 - stretch * 0.5), p.sy * (1 + stretch));
  ctx.translate(0, -p.r);

  ctx.shadowColor = 'rgba(255,95,162,0.9)';
  ctx.shadowBlur = 26;
  const g = ctx.createRadialGradient(-5, -6, 2, 0, 0, p.r + 2);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.3, '#ffe3a3');
  g.addColorStop(1, '#ff5fa2');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, p.r, 0, TAU);
  ctx.fill();
  ctx.shadowBlur = 0;

  // yeux
  const lx = p.look * 2.5;
  const up = p.vy < 0 ? -1.5 : 1;
  for (const ex of [-5.5, 5.5]) {
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.ellipse(ex + lx * 0.4, -2, 3.6, 4.6, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#1b0f3a';
    ctx.beginPath();
    ctx.arc(ex + lx, -1.5 + up, 2.1, 0, TAU);
    ctx.fill();
  }
  // bouche
  ctx.strokeStyle = '#8a1f55';
  ctx.lineWidth = 1.8;
  ctx.lineCap = 'round';
  ctx.beginPath();
  if (p.vy < -900) {
    ctx.arc(0, 7, 3.2, 0, TAU);
  } else {
    ctx.arc(lx * 0.4, 5, 4.5, 0.15 * Math.PI, 0.85 * Math.PI);
  }
  ctx.stroke();
  ctx.restore();
}

function render(t) {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  drawBackground(t);

  // colonne de jeu
  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,0.045)';
  ctx.fillRect(OX, 0, GW * S, H);
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fillRect(OX - 1, 0, 1.5, H);
  ctx.fillRect(OX + GW * S - 0.5, 0, 1.5, H);

  ctx.beginPath();
  ctx.rect(OX, 0, GW * S, H);
  ctx.clip();
  ctx.translate(OX, 0);
  ctx.scale(S, S);
  if (G.shake > 0)
    ctx.translate(rand(-G.shake, G.shake) * 0.4, rand(-G.shake, G.shake) * 0.4);
  ctx.translate(0, -G.camY);

  if (G.state === 'menu') {
    // sol de démo
    drawPlatform(
      {
        x: GW / 2 - 70,
        y: 0,
        w: 140,
        h: 14,
        type: 'normal',
        wob: 0,
        broke: 0,
        spring: false,
      },
      t
    );
  } else {
    for (const pl of platforms) drawPlatform(pl, t);
    for (const c of collectibles) drawStar(c, t);
  }

  // particules
  ctx.globalCompositeOperation = 'lighter';
  for (const q of particles) {
    const k = q.life / q.max;
    ctx.globalAlpha = clamp(k * 1.3, 0, 1);
    ctx.fillStyle = q.color;
    const s = q.size * (0.4 + k);
    ctx.beginPath();
    ctx.arc(q.x, q.y, s, 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';

  if (G.state !== 'over' || p.y - G.camY < GH + 40) drawPlayer(t);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '700 17px Fredoka, sans-serif';
  for (const q of popups) {
    ctx.globalAlpha = clamp(q.life * 1.6, 0, 1);
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(27,15,58,0.7)';
    ctx.strokeText(q.text, q.x, q.y);
    ctx.fillStyle = q.color;
    ctx.fillText(q.text, q.x, q.y);
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  // vignette douce
  const vg = ctx.createRadialGradient(
    W / 2,
    H / 2,
    Math.min(W, H) * 0.5,
    W / 2,
    H / 2,
    Math.max(W, H) * 0.85
  );
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(10,4,30,0.45)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);
}

// ---------- HUD ----------
const lastHud = { h: -1, s: -1 };
function updateHud() {
  const h = score();
  if (h !== lastHud.h) {
    el.height.innerHTML = `${h}<small> m</small>`;
    el.height.classList.remove('pop');
    void el.height.offsetWidth;
    el.height.classList.add('pop');
    lastHud.h = h;
  }
  if (G.stars !== lastHud.s) {
    el.stars.textContent = G.stars;
    lastHud.s = G.stars;
  }
}

// ---------- Boucle ----------
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = clamp((now - last) / 1000, 0, 0.033);
  last = now;
  const t = now / 1000;

  if (G.state === 'playing') {
    update(dt);
    updateHud();
  } else if (G.state === 'over') {
    update(dt * 0.6);
  } else if (G.state === 'menu') updateMenu(dt);

  render(t);
}

// ---------- Init ----------
resize();
reset();
G.state = 'menu';
G.camY = -GH * 0.7;
p.y = -16;
p.vy = -JUMP;
el.bestMenu.textContent = best + ' m';
requestAnimationFrame((n) => {
  last = n;
  frame(n);
});

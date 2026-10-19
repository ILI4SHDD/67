import * as THREE from 'three';

// ---------- constants ----------
const W = 8, H = 5, PZ = 11.5, R = 0.32, PR = 0.95, PW = PR * 2, PH = PR * 2;
const HX = W / 2 - R, HY = H / 2 - R;
const THEMES = {
  neon:   { bg: 0x07041a, grid: 0x2f44ff, you: 0x19e6ff, ai: 0xff2fb9, ball: 0xffffff },
  sunset: { bg: 0x1a0824, grid: 0xff6a3d, you: 0xffd166, ai: 0xc084fc, ball: 0xfff1c9 },
  toxic:  { bg: 0x03140c, grid: 0x1fae5a, you: 0xb6ff3b, ai: 0xff5a5a, ball: 0xf3fff0 },
};
const AIS = [
  { speed: 4.4, err: 1.7, react: 0.55 },
  { speed: 6.8, err: 0.9, react: 0.35 },
  { speed: 9.4, err: 0.35, react: 0.2 },
];
const $ = (id) => document.getElementById(id);

// ---------- settings ----------
let opts = { diff: 1, goal: 7, theme: 'neon' };
try { Object.assign(opts, JSON.parse(localStorage.getItem('pong3d-opts') || '{}')); } catch (e) {}
let muted = false;
try { muted = localStorage.getItem('pong3d-mute') === '1'; } catch (e) {}
let best = 0;
try { best = parseInt(localStorage.getItem('pong3d-best') || '0', 10) || 0; } catch (e) {}
$('bestRally').textContent = best;
document.querySelectorAll('.chips').forEach((g) => {
  const k = g.dataset.k;
  g.querySelectorAll('button').forEach((b) => {
    b.classList.toggle('on', String(opts[k]) === b.dataset.v);
    b.onclick = () => {
      opts[k] = k === 'theme' ? b.dataset.v : +b.dataset.v;
      g.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
      try { localStorage.setItem('pong3d-opts', JSON.stringify(opts)); } catch (e) {}
      if (k === 'theme') applyTheme(); beep(660, .06);
    };
  });
});

// ---------- audio ----------
let ac = null;
function audio() { if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} } if (ac && ac.state === 'suspended') ac.resume(); return ac; }
function beep(f, d = .08, type = 'sine', vol = .12, when = 0, slide = 0) {
  if (muted) return; const a = audio(); if (!a) return;
  const t = a.currentTime + when, o = a.createOscillator(), g = a.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, f + slide), t + d);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.0001, t + d);
  o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + d + .02);
}
const sfx = {
  wall: () => beep(260, .07, 'triangle', .1),
  hit: (n) => { beep(420 + Math.min(n, 20) * 22, .1, 'square', .09); beep(840 + Math.min(n, 20) * 40, .06, 'sine', .07, .02); },
  aihit: () => beep(300, .09, 'square', .07),
  win: () => [523, 659, 784, 1047].forEach((f, i) => beep(f, .22, 'triangle', .13, i * .09)),
  lose: () => { beep(300, .35, 'sawtooth', .13, 0, -180); beep(200, .45, 'sawtooth', .12, .25, -120); },
  tick: () => beep(700, .06, 'square', .07),
};
const mb = $('muteBtn'); mb.textContent = muted ? '🔇' : '🔊';
mb.onclick = () => { muted = !muted; mb.textContent = muted ? '🔇' : '🔊'; try { localStorage.setItem('pong3d-mute', muted ? '1' : '0'); } catch (e) {} };

// ---------- three setup ----------
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x000000, 14, 40);
const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 80);
const CAM = new THREE.Vector3(0, 0.6, 20.5);
function resize() {
  const w = innerWidth, h = innerHeight, a = w / h;
  renderer.setSize(w, h, false); camera.aspect = a;
  const d = CAM.z - PZ; // distance camera → player plane
  const tanV = Math.max((H / 2 + 0.5) / d * 0.78, (W / 2 + 0.7) / (d * a));
  camera.fov = Math.min(100, THREE.MathUtils.radToDeg(2 * Math.atan(tanV)));
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);

const mats = {
  grid: new THREE.LineBasicMaterial({ color: 0x2f44ff, transparent: true, opacity: .9 }),
  you: new THREE.MeshBasicMaterial({ color: 0x19e6ff, transparent: true, opacity: .82, depthWrite: false, side: THREE.DoubleSide }),
  youE: new THREE.LineBasicMaterial({ color: 0x19e6ff }),
  ai: new THREE.MeshBasicMaterial({ color: 0xff2fb9, transparent: true, opacity: .82, depthWrite: false, side: THREE.DoubleSide }),
  wood: new THREE.MeshBasicMaterial({ color: 0xe0a96d }),
  grip: new THREE.MeshBasicMaterial({ color: 0xb4783f }),
  dark: new THREE.MeshBasicMaterial({ color: 0x15101f, side: THREE.DoubleSide }),
  aiE: new THREE.LineBasicMaterial({ color: 0xff2fb9 }),
  ball: new THREE.MeshBasicMaterial({ color: 0xffffff }),
  halo: new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .22, blending: THREE.AdditiveBlending, depthWrite: false }),
  frame: new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: .85 }),
  shadow: new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .55, side: THREE.DoubleSide, depthWrite: false }),
  trail: new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .25, blending: THREE.AdditiveBlending, depthWrite: false }),
  spark: new THREE.PointsMaterial({ size: .18, vertexColors: true, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false }),
  end: new THREE.MeshBasicMaterial({ color: 0xff2fb9, transparent: true, opacity: .1, depthWrite: false }),
};

// tunnel: rings + longitudinal lines
(function tunnel() {
  const pos = [], hx = W / 2, hy = H / 2, z0 = -PZ - 1, z1 = PZ + 1;
  for (let z = z0; z <= z1 + 0.01; z += 2) pos.push(-hx, -hy, z, hx, -hy, z, hx, -hy, z, hx, hy, z, hx, hy, z, -hx, hy, z, -hx, hy, z, -hx, -hy, z);
  const pts = [[-hx, -hy], [0, -hy], [hx, -hy], [hx, 0], [hx, hy], [0, hy], [-hx, hy], [-hx, 0]];
  pts.forEach(([x, y]) => pos.push(x, y, z0, x, y, z1));
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  scene.add(new THREE.LineSegments(g, mats.grid));
  const end = new THREE.Mesh(new THREE.PlaneGeometry(W, H), mats.end); end.position.z = -PZ - 1; scene.add(end);
})();

// paddles: ping-pong rackets (round rubber, wooden rim and handle)
function makePaddle(mat, edge) {
  const g = new THREE.Group(), r = PR;
  const blade = new THREE.Mesh(new THREE.CircleGeometry(r, 48), mats.wood); blade.position.z = -0.01; g.add(blade);   // wooden blade
  const rubber = new THREE.Mesh(new THREE.CircleGeometry(r * 0.86, 48), mat); g.add(rubber);                         // rubber
  g.add(new THREE.Mesh(new THREE.RingGeometry(r * 0.86, r * 0.9, 48), mats.dark));                                   // sponge edge
  const throat = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.2, 0.5, 14), mats.wood); throat.position.y = -(r + 0.12); g.add(throat);
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.26, 0.8, 14), mats.grip); handle.position.y = -(r + 0.7); g.add(handle);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.08, 14), mats.dark); cap.position.y = -(r + 1.1); g.add(cap);
  g.rotation.z = 0.22; g.userData.rubber = rubber;
  scene.add(g); return g;
}
const you = makePaddle(mats.you, mats.youE); you.position.z = PZ;
const ai = makePaddle(mats.ai, mats.aiE); ai.position.z = -PZ;

// ball, halo, trail, depth cues
const ball = new THREE.Mesh(new THREE.SphereGeometry(R, 24, 16), mats.ball); scene.add(ball);
const halo = new THREE.Mesh(new THREE.SphereGeometry(R * 1.9, 16, 12), mats.halo); ball.add(halo);
const ringFrame = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-W / 2, -H / 2, 0), new THREE.Vector3(W / 2, -H / 2, 0), new THREE.Vector3(W / 2, H / 2, 0), new THREE.Vector3(-W / 2, H / 2, 0)]), mats.frame); scene.add(ringFrame);
const shadows = [0, 1, 2, 3].map(() => { const m = new THREE.Mesh(new THREE.CircleGeometry(R * 1.5, 20), mats.shadow); scene.add(m); return m; });
shadows[0].rotation.x = -Math.PI / 2; shadows[1].rotation.x = Math.PI / 2; shadows[2].rotation.y = Math.PI / 2; shadows[3].rotation.y = -Math.PI / 2;
const trail = [];
for (let i = 0; i < 12; i++) { const m = new THREE.Mesh(new THREE.SphereGeometry(R * (1 - i * .06), 10, 8), mats.trail.clone()); m.visible = false; scene.add(m); trail.push(m); }
const trailPos = [];

// sparks
const NS = 140, sparkPos = new Float32Array(NS * 3), sparkCol = new Float32Array(NS * 3), sparkV = new Float32Array(NS * 3), sparkLife = new Float32Array(NS);
const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3)); sg.setAttribute('color', new THREE.BufferAttribute(sparkCol, 3));
const sparks = new THREE.Points(sg, mats.spark); sparks.frustumCulled = false; scene.add(sparks);
let sparkI = 0;
function burst(p, color, n = 18, sp = 4) {
  const c = new THREE.Color(color);
  for (let i = 0; i < n; i++) {
    const k = sparkI++ % NS, a = Math.random() * Math.PI * 2, e = (Math.random() - .5) * 2, s = sp * (.4 + Math.random());
    sparkPos.set([p.x, p.y, p.z], k * 3); sparkV.set([Math.cos(a) * s, e * s, Math.sin(a) * s * .6], k * 3); sparkCol.set([c.r, c.g, c.b], k * 3); sparkLife[k] = 1;
  }
}
function updateSparks(dt) {
  for (let k = 0; k < NS; k++) {
    if (sparkLife[k] <= 0) { sparkPos[k * 3 + 1] = -999; continue; }
    sparkLife[k] -= dt * 1.8; const f = Math.max(sparkLife[k], 0);
    sparkPos[k * 3] += sparkV[k * 3] * dt; sparkPos[k * 3 + 1] += sparkV[k * 3 + 1] * dt; sparkPos[k * 3 + 2] += sparkV[k * 3 + 2] * dt;
    sparkV[k * 3] *= .97; sparkV[k * 3 + 1] *= .97; sparkV[k * 3 + 2] *= .97;
    sparkCol[k * 3] *= .985 * (0.6 + f * .4); sparkCol[k * 3 + 1] *= .985 * (0.6 + f * .4); sparkCol[k * 3 + 2] *= .985 * (0.6 + f * .4);
  }
  sg.attributes.position.needsUpdate = true; sg.attributes.color.needsUpdate = true;
}

let T = THEMES.neon;
function applyTheme() {
  T = THEMES[opts.theme] || THEMES.neon;
  scene.background = new THREE.Color(T.bg); scene.fog.color.set(T.bg);
  mats.grid.color.set(T.grid); mats.end.color.set(T.ai);
  mats.you.color.set(T.you); mats.youE.color.set(T.you); mats.ai.color.set(T.ai); mats.aiE.color.set(T.ai);
  mats.ball.color.set(T.ball); mats.halo.color.set(T.ball); mats.frame.color.set(T.ball); mats.shadow.color.set(T.ball); trail.forEach((m) => m.material.color.set(T.ball));
  const r = document.documentElement.style; r.setProperty('--a', '#' + new THREE.Color(T.you).getHexString()); r.setProperty('--b', '#' + new THREE.Color(T.ai).getHexString());
  document.body.style.background = '#' + new THREE.Color(T.bg).getHexString();
}

// ---------- game state ----------
const S = { mode: 'menu', phase: 'serve', t: 0, you: 0, ai: 0, rally: 0, bestRound: 0, goal: 7, ai_cfg: AIS[1], paused: false };
const b = { p: new THREE.Vector3(), v: new THREE.Vector3(), speed: 8 };
const target = new THREE.Vector2(0, 0);
const keys = {};
let aiErr = new THREE.Vector2(), aiErrT = 0, youVel = new THREE.Vector2(), aiVel = new THREE.Vector2();
let shake = 0;

function resetBall(dir) {
  b.p.set(0, 0, 0); b.speed = 8;
  b.v.set((Math.random() - .5) * 2.2, (Math.random() - .5) * 1.6, dir * b.speed); b.v.setLength(b.speed);
  trailPos.length = 0; S.rally = 0; updateHud();
}
function hudText(t, color) { const c = $('center'); c.textContent = t; c.style.color = color || '#fff'; c.classList.remove('pop'); void c.offsetWidth; c.classList.add('pop'); }
function updateHud() { $('sYou').textContent = S.you; $('sAi').textContent = S.ai; $('rally').textContent = 'RALLY ' + S.rally; }
function col(x) { return '#' + new THREE.Color(x).getHexString(); }

function startMatch() {
  audio();
  S.mode = 'play'; S.you = 0; S.ai = 0; S.bestRound = 0; S.goal = opts.goal; S.ai_cfg = AIS[opts.diff] || AIS[1]; S.paused = false;
  you.position.set(0, 0, PZ); ai.position.set(0, 0, -PZ); target.set(0, 0);
  ['menu', 'over', 'pause'].forEach((id) => $(id).classList.remove('show'));
  $('hud').hidden = false; $('hint').hidden = false; $('hint').style.animation = 'none'; void $('hint').offsetWidth; $('hint').style.animation = '';
  resetBall(1); updateHud();
  S.phase = 'serve'; S.t = 1.8; hudText('READY', col(T.ball));
}
function toMenu() {
  S.mode = 'menu'; S.paused = false; $('hud').hidden = true; $('hint').hidden = true;
  ['over', 'pause'].forEach((id) => $(id).classList.remove('show')); $('menu').classList.add('show');
  $('bestRally').textContent = best; resetBall(1); S.phase = 'play'; $('center').classList.remove('pop');
}
function setPause(p) { if (S.mode !== 'play' || S.phase === 'over') return; S.paused = p; $('pause').classList.toggle('show', p); }

function point(toYou) {
  if (toYou) { S.you++; sfx.win(); hudText('POINT!', col(T.you)); burst(ai.position, T.ai, 40, 6); }
  else { S.ai++; sfx.lose(); hudText('MISSED', col(T.ai)); burst(you.position, T.you, 40, 6); shake = .5; }
  S.bestRound = Math.max(S.bestRound, S.rally);
  if (S.rally > best) { best = S.rally; try { localStorage.setItem('pong3d-best', String(best)); } catch (e) {} }
  updateHud();
  if (S.you >= S.goal || S.ai >= S.goal) {
    S.phase = 'over'; const won = S.you > S.ai;
    setTimeout(() => {
      if (S.mode !== 'play') return;
      $('overTitle').textContent = won ? 'YOU WIN' : 'AI WINS';
      $('overTitle').style.color = col(won ? T.you : T.ai);
      $('overSub').textContent = `${S.you} : ${S.ai}   ·   Longest rally ${S.bestRound}`;
      $('over').classList.add('show');
    }, 1100);
    return;
  }
  b.p.set(0, 0, 0); b.v.set(0, 0, 0); S.phase = 'serve'; S.t = 1.3; S.next = toYou ? -1 : 1; trailPos.length = 0; S.rally = 0;
}

function paddleHit(pad, dirZ, vel) {
  let ox = (b.p.x - pad.position.x) / (PR + R), oy = (b.p.y - pad.position.y) / (PR + R);
  const ol = Math.hypot(ox, oy); if (ol > 1) { ox /= ol; oy /= ol; }
  b.speed = Math.min(b.speed + .55, 21);
  let vx = ox * b.speed * .6 + vel.x * .12, vy = oy * b.speed * .6 + vel.y * .12;
  const lim = b.speed * .8, l = Math.hypot(vx, vy); if (l > lim) { vx *= lim / l; vy *= lim / l; }
  b.v.set(vx, vy, dirZ * Math.sqrt(Math.max(b.speed * b.speed - vx * vx - vy * vy, 1)));
  b.p.z = pad.position.z - dirZ * 0.02;
  burst(b.p, dirZ < 0 ? T.you : T.ai, 14, 3.5); pad.userData.flash = 1;
}

// ---------- input ----------
const ray = new THREE.Raycaster(), plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -PZ), hitP = new THREE.Vector3();
let usingKeys = false;
function pointerTo(e) {
  usingKeys = false;
  const nx = (e.clientX / innerWidth) * 2 - 1, ny = -((e.clientY / innerHeight) * 2 - 1) + (e.pointerType === 'touch' ? 0.14 : 0);
  camera.updateMatrixWorld(); ray.setFromCamera({ x: nx, y: ny }, camera);
  if (ray.ray.intersectPlane(plane, hitP)) target.set(hitP.x, hitP.y);
}
addEventListener('pointermove', pointerTo);
addEventListener('pointerdown', (e) => { if (S.mode === 'play') pointerTo(e); });
addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (e.code === 'Escape' || e.code === 'KeyP') setPause(!S.paused);
  if ((e.code === 'Space' || e.code === 'Enter') && S.mode === 'menu') startMatch();
  if (e.code.startsWith('Arrow') || ['KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(e.code)) { usingKeys = true; if (S.mode === 'play') e.preventDefault(); }
});
addEventListener('keyup', (e) => { keys[e.code] = false; });
$('play').onclick = startMatch; $('again').onclick = startMatch; $('toMenu').onclick = toMenu; $('quit').onclick = toMenu;
$('resume').onclick = () => setPause(false); $('pauseBtn').onclick = () => setPause(!S.paused);
document.addEventListener('visibilitychange', () => { if (document.hidden) setPause(true); });

// ---------- AI ----------
function moveAI(pad, vel, cfg, dt, towardZ) {
  aiErrT -= dt;
  if (aiErrT <= 0) { aiErrT = cfg.react; aiErr.set((Math.random() - .5) * 2 * cfg.err, (Math.random() - .5) * 2 * cfg.err * .7); }
  let tx = 0, ty = 0;
  if (b.v.z * towardZ > 0 || S.mode === 'menu') { tx = b.p.x + aiErr.x; ty = b.p.y + aiErr.y; }
  const lim = cfg.speed * dt, px = pad.position.x, py = pad.position.y;
  const dx = THREE.MathUtils.clamp(tx - px, -lim, lim), dy = THREE.MathUtils.clamp(ty - py, -lim, lim);
  pad.position.x = THREE.MathUtils.clamp(px + dx, -(W / 2 - PW / 2), W / 2 - PW / 2); pad.position.y = THREE.MathUtils.clamp(py + dy, -(H / 2 - PH / 2), H / 2 - PH / 2);
  vel.set(dx / dt, dy / dt);
}

// ---------- step ----------
function step(dt) {
  const menu = S.mode === 'menu';
  // player paddle
  const px0 = you.position.x, py0 = you.position.y;
  if (menu) moveAI(you, youVel, AIS[1], dt, 1);
  else {
    if (usingKeys) {
      const k = 9 * dt;
      if (keys.ArrowLeft || keys.KeyA) target.x -= k; if (keys.ArrowRight || keys.KeyD) target.x += k;
      if (keys.ArrowUp || keys.KeyW) target.y += k; if (keys.ArrowDown || keys.KeyS) target.y -= k;
    }
    target.x = THREE.MathUtils.clamp(target.x, -(W / 2 - PW / 2), W / 2 - PW / 2); target.y = THREE.MathUtils.clamp(target.y, -(H / 2 - PH / 2), H / 2 - PH / 2);
    const f = 1 - Math.exp(-28 * dt);
    you.position.x += (target.x - you.position.x) * f; you.position.y += (target.y - you.position.y) * f;
    youVel.set((you.position.x - px0) / dt, (you.position.y - py0) / dt);
  }
  moveAI(ai, aiVel, menu ? AIS[1] : S.ai_cfg, dt, -1);

  if (!menu && S.phase === 'serve') {
    S.t -= dt;
    if (S.t <= 0) { resetBall(S.next || 1); S.phase = 'play'; S.next = 0; }
    return;
  }
  if (S.phase === 'over') return;
  // ball
  const prevZ = b.p.z;
  b.p.addScaledVector(b.v, dt);
  if (b.p.x > HX) { b.p.x = HX; b.v.x *= -1; sfx.wall(); burst(b.p, T.grid, 6, 2); }
  if (b.p.x < -HX) { b.p.x = -HX; b.v.x *= -1; sfx.wall(); burst(b.p, T.grid, 6, 2); }
  if (b.p.y > HY) { b.p.y = HY; b.v.y *= -1; sfx.wall(); burst(b.p, T.grid, 6, 2); }
  if (b.p.y < -HY) { b.p.y = -HY; b.v.y *= -1; sfx.wall(); burst(b.p, T.grid, 6, 2); }
  const inPad = (pad) => Math.hypot(b.p.x - pad.position.x, b.p.y - pad.position.y) < PR + R * 0.85;
  if (b.v.z > 0 && prevZ < PZ && b.p.z >= PZ) {
    if (inPad(you)) { paddleHit(you, -1, youVel); S.rally++; sfx.hit(S.rally); shake = Math.max(shake, .12); updateHud(); }
  } else if (b.v.z < 0 && prevZ > -PZ && b.p.z <= -PZ) {
    if (inPad(ai)) { paddleHit(ai, 1, aiVel); S.rally++; sfx.aihit(); updateHud(); }
  }
  if (b.p.z > PZ + 1.8) { if (menu) { resetBall(-1); } else point(false); }
  else if (b.p.z < -PZ - 1.8) { if (menu) { resetBall(1); } else point(true); }
}

// ---------- render loop ----------
let last = performance.now();
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min((now - last) / 1000, 1 / 20); last = now;
  if (!S.paused) { const n = 2; for (let i = 0; i < n; i++) step(dt / n); }
  const dtv = S.paused ? 0 : dt;
  updateSparks(dtv);
  // visuals
  ball.position.copy(b.p); ball.visible = !(S.phase === 'serve' && S.mode === 'play');
  halo.scale.setScalar(1 + Math.sin(now / 90) * .08);
  ringFrame.position.z = b.p.z; ringFrame.visible = ball.visible;
  shadows[0].position.set(b.p.x, -H / 2 + .01, b.p.z); shadows[1].position.set(b.p.x, H / 2 - .01, b.p.z);
  shadows[2].position.set(-W / 2 + .01, b.p.y, b.p.z); shadows[3].position.set(W / 2 - .01, b.p.y, b.p.z);
  shadows.forEach((s) => (s.visible = ball.visible));
  if (!S.paused) { trailPos.unshift(b.p.clone()); if (trailPos.length > 13) trailPos.pop(); }
  trail.forEach((m, i) => { const p = trailPos[i + 1]; m.visible = !!p && ball.visible; if (p) m.position.copy(p); m.material.opacity = .28 * (1 - i / 12); });
  [you, ai].forEach((p) => { const f = p.userData.flash || 0; p.userData.flash = Math.max(0, f - dtv * 5); p.userData.rubber.material.opacity = .82 + f * .18; p.scale.setScalar(1 + f * .08); });
    // camera: slight follow + shake
  shake = Math.max(0, shake - dtv * 1.4);
  const tx = b.p.x * 0.12 + (you.position.x * 0.1), ty = 0.5 + b.p.y * 0.06;
  camera.position.set(CAM.x + tx + (Math.random() - .5) * shake, ty + (Math.random() - .5) * shake, CAM.z);
  camera.lookAt(tx * .4, 0, -4);
  renderer.render(scene, camera);
}

// ---------- boot ----------
applyTheme(); resize(); resetBall(1); S.phase = 'play';
requestAnimationFrame(loop);
window.__pg = { S, b, you, ai, target, startMatch, toMenu, get best() { return best; } };
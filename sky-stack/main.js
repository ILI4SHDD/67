import * as THREE from 'three';

// ---------- options ----------
const PALETTES = [
  { id: 'sunset', name: 'Sunset', h: 340, step: 9, s: 80, l: 60, bg: [[280, 60, 22], [18, 90, 62]] },
  { id: 'ocean', name: 'Ocean', h: 190, step: 8, s: 80, l: 55, bg: [[225, 70, 20], [190, 80, 65]] },
  { id: 'candy', name: 'Candy', h: 300, step: 14, s: 85, l: 68, bg: [[320, 60, 40], [190, 80, 80]] },
  { id: 'forest', name: 'Forest', h: 110, step: 7, s: 60, l: 50, bg: [[150, 50, 12], [90, 55, 50]] },
  { id: 'rainbow', name: 'Rainbow', h: 0, step: 22, s: 85, l: 58, bg: [[250, 50, 15], [220, 60, 45]] },
];
const SHAPES = [{ id: 'square', name: 'Square' }, { id: 'round', name: 'Round' }];
const MATS = [{ id: 'matte', name: 'Matte' }, { id: 'glossy', name: 'Glossy' }, { id: 'neon', name: 'Neon' }];
const SPEEDS = [{ id: 'chill', name: 'Chill', v: 1.5 }, { id: 'normal', name: 'Normal', v: 2.1 }, { id: 'insane', name: 'Insane', v: 3 }];

let opts = { palette: 'sunset', shape: 'square', mat: 'matte', speed: 'normal' };
try { Object.assign(opts, JSON.parse(localStorage.getItem('skystack-opts') || '{}')); } catch (e) {}
const saveOpts = () => { try { localStorage.setItem('skystack-opts', JSON.stringify(opts)); } catch (e) {} };
let best = 0;
try { best = parseInt(localStorage.getItem('skystack-best') || '0', 10) || 0; } catch (e) {}

const $ = (id) => document.getElementById(id);
function buildChips(el, list, key, color) {
  el.innerHTML = '';
  list.forEach((o) => {
    const b = document.createElement('button');
    b.className = 'chip' + (opts[key] === o.id ? ' on' : '');
    b.innerHTML = (color ? `<i style="background:hsl(${o.h},${o.s}%,${o.l}%)"></i>` : '') + o.name;
    b.onclick = () => { opts[key] = o.id; saveOpts(); buildChips(el, list, key, color); applyBg(0); };
    el.appendChild(b);
  });
}
buildChips($('optPalette'), PALETTES, 'palette', true);
buildChips($('optShape'), SHAPES, 'shape');
buildChips($('optMat'), MATS, 'mat');
buildChips($('optSpeed'), SPEEDS, 'speed');
$('best').textContent = best; $('best2').textContent = best;

// ---------- three ----------
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
const scene = new THREE.Scene();
const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, -100, 200);
const amb = new THREE.AmbientLight(0xffffff, 0.75);
const sun = new THREE.DirectionalLight(0xffffff, 1.5); sun.position.set(6, 12, 4);
scene.add(amb, sun);
const world = new THREE.Group(); scene.add(world);

let viewH = 11;
function resize() {
  const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false);
  const a = w / h; viewH = a < 0.8 ? 21 : 11;
  cam.left = -viewH * a / 2; cam.right = viewH * a / 2; cam.top = viewH / 2; cam.bottom = -viewH / 2; cam.updateProjectionMatrix();
}
addEventListener('resize', resize); resize();

const BH = 0.55, START = 3, RANGE = 4.2, TOL = 0.14, MAXW = 3.4;
const CAMOFF = new THREE.Vector3(10, 10, 10);

let state = 'menu', blocks = [], debris = [], rings = [], level = 0, combo = 0, perfects = 0, tPhase = 0, camY = 0, camTarget = 0, mover = null, axis = 'x', shake = 0;
let pal = PALETTES[0];

function colorFor(l) {
  const h = ((pal.id === 'rainbow' ? l * pal.step : pal.h + 55 * Math.sin(l * pal.step * 0.02)) + 360) % 360;
  return new THREE.Color().setHSL(h / 360, pal.s / 100, pal.l / 100);
}
function makeMesh(w, d, l) {
  const geo = opts.shape === 'round' ? new THREE.CylinderGeometry(0.5, 0.5, 1, 40) : new THREE.BoxGeometry(1, 1, 1);
  const c = colorFor(l);
  let mat;
  if (opts.mat === 'glossy') mat = new THREE.MeshStandardMaterial({ color: c, roughness: 0.15, metalness: 0.35 });
  else if (opts.mat === 'neon') mat = new THREE.MeshStandardMaterial({ color: c.clone().multiplyScalar(0.25), emissive: c, emissiveIntensity: 0.9, roughness: 0.5 });
  else mat = new THREE.MeshLambertMaterial({ color: c });
  const m = new THREE.Mesh(geo, mat);
  m.scale.set(w, BH, d);
  if (opts.mat === 'neon') {
    const e = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: 0xffffff }));
    m.add(e);
  }
  return m;
}
function lerpHsl(a, b, t) { return `hsl(${a[0] + (b[0] - a[0]) * t},${a[1] + (b[1] - a[1]) * t}%,${a[2] + (b[2] - a[2]) * t}%)`; }
function applyBg(l) {
  pal = PALETTES.find((p) => p.id === opts.palette) || PALETTES[0];
  const t = Math.min(1, l / 60);
  // higher = darker/space-like
  const top = lerpHsl(pal.bg[0], [pal.bg[0][0], pal.bg[0][1], 4], t);
  const bot = lerpHsl(pal.bg[1], pal.bg[0], t * 0.85);
  document.body.style.background = `linear-gradient(180deg,${top},${bot})`;
}

function clearAll() {
  [...blocks.map((b) => b.mesh), ...debris.map((d) => d.mesh), ...rings.map((r) => r.mesh)].forEach((m) => world.remove(m));
  if (mover) world.remove(mover.mesh);
  blocks = []; debris = []; rings = []; mover = null;
}

function startGame() {
  clearAll(); applyBg(0);
  level = 0; combo = 0; perfects = 0; camY = 0; camTarget = 0; shake = 0;
  const m = makeMesh(START, START, 0); m.position.set(0, -BH / 2, 0); world.add(m);
  blocks.push({ mesh: m, x: 0, z: 0, w: START, d: START });
  state = 'play';
  $('menu').hidden = true; $('over').hidden = true; $('hud').hidden = false;
  $('score').textContent = '0'; $('combo').textContent = '';
  spawnMover();
  beep(330, 0.08, 'triangle', 0.08);
}

function spawnMover() {
  level++;
  const top = blocks[blocks.length - 1];
  axis = level % 2 ? 'x' : 'z';
  const m = makeMesh(top.w, top.d, level);
  const y = level * BH - BH / 2;
  m.position.set(top.x, y, top.z);
  world.add(m);
  mover = { mesh: m, w: top.w, d: top.d, y };
  tPhase = -Math.PI / 2; // starts at one edge
}

function moverPos() { return Math.sin(tPhase) * RANGE; }

function place() {
  if (state !== 'play' || !mover) return;
  const top = blocks[blocks.length - 1];
  const pos = moverPos();
  const isX = axis === 'x';
  const topC = isX ? top.x : top.z;
  const size = isX ? mover.w : mover.d;
  const delta = pos - topC;
  const overlap = size - Math.abs(delta);
  if (overlap <= 0.02) { // miss entirely
    mover.mesh.position[axis] = pos;
    debris.push({ mesh: mover.mesh, vy: 0, vx: 0, vz: 0, rx: (Math.random() - 0.5) * 2, rz: (Math.random() - 0.5) * 2, life: 0 });
    mover = null; gameOver(); return;
  }
  let nx = top.x, nz = top.z, nw = mover.w, nd = mover.d;
  const perfect = Math.abs(delta) < TOL;
  if (perfect) {
    combo++; perfects++;
    if (combo >= 3 && size < MAXW) { // regrow
      if (isX) nw = Math.min(MAXW, nw + 0.25); else nd = Math.min(MAXW, nd + 0.25);
    }
    ringFx(top.x, mover.y, top.z, nw, nd);
    const pitch = 520 * Math.pow(1.0595, Math.min(combo, 14));
    beep(pitch, 0.18, 'sine', 0.14); setTimeout(() => beep(pitch * 1.5, 0.14, 'sine', 0.08), 70);
    toast(combo >= 3 ? `PERFECT x${combo}` : 'PERFECT');
    $('combo').textContent = combo >= 2 ? `🔥 COMBO x${combo}` : '';
  } else {
    combo = 0; $('combo').textContent = '';
    const cutSize = Math.abs(delta);
    const sign = Math.sign(delta);
    const newC = topC + delta / 2;
    if (isX) { nx = newC; nw = overlap; } else { nz = newC; nd = overlap; }
    // debris: the chunk hanging off
    const cm = makeMesh(isX ? cutSize : mover.w, isX ? mover.d : cutSize, level);
    cm.position.set(top.x, mover.y, top.z);
    if (isX) cm.position.x = pos + sign * overlap / 2; else cm.position.z = pos + sign * overlap / 2;
    world.add(cm);
    debris.push({ mesh: cm, vy: 0, vx: isX ? sign * 1.2 : 0, vz: isX ? 0 : sign * 1.2, rx: isX ? 0 : sign * 1.5, rz: isX ? -sign * 1.5 : 0, life: 0 });
    world.remove(mover.mesh);
    const nm = makeMesh(nw, nd, level); nm.position.set(nx, mover.y, nz); world.add(nm);
    mover.mesh = nm;
    beep(220 + level * 4, 0.1, 'triangle', 0.1);
    shake = 0.12;
  }
  if (perfect) {
    world.remove(mover.mesh);
    const nm = makeMesh(nw, nd, level); nm.position.set(nx, mover.y, nz); world.add(nm); mover.mesh = nm;
  }
  blocks.push({ mesh: mover.mesh, x: nx, z: nz, w: nw, d: nd });
  mover = null;
  const sc = $('score'); sc.textContent = level; sc.classList.remove('pop'); void sc.offsetWidth; sc.classList.add('pop');
  camTarget = level * BH;
  if (level % 10 === 0) applyBg(level); else applyBg(level);
  spawnMover();
}

function ringFx(x, y, z, w, d) {
  const g = opts.shape === 'round' ? new THREE.RingGeometry(0.5, 0.56, 48) : new THREE.PlaneGeometry(1, 1);
  let mesh;
  if (opts.shape === 'round') {
    mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, side: THREE.DoubleSide }));
  } else {
    mesh = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(1, 1)), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true }));
  }
  mesh.rotation.x = -Math.PI / 2; mesh.position.set(x, y + BH / 2 + 0.02, z); mesh.scale.set(w, d, 1);
  world.add(mesh); rings.push({ mesh, t: 0, w, d });
}

function gameOver() {
  state = 'over';
  const score = level - 1; // last placed level
  $('score').textContent = score;
  let isBest = false;
  if (score > best) { best = score; isBest = true; try { localStorage.setItem('skystack-best', String(best)); } catch (e) {} }
  $('finalScore').textContent = score; $('best').textContent = best; $('best2').textContent = best; $('perfects').textContent = perfects;
  $('newBest').hidden = !isBest;
  beep(160, 0.4, 'sawtooth', 0.1);
  setTimeout(() => { if (state === 'over') { $('over').hidden = false; $('hud').hidden = true; } }, 900);
}

let toastT = 0;
function toast(t) {
  const el = $('toast'); el.textContent = t; el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
}

// ---------- audio (short SFX only) ----------
let actx = null;
function beep(f, dur, type = 'sine', vol = 0.1) {
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = type; o.frequency.value = f; o.connect(g); g.connect(actx.destination);
    g.gain.setValueAtTime(vol, actx.currentTime); g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + dur);
    o.start(); o.stop(actx.currentTime + dur);
  } catch (e) {}
}

// ---------- input ----------
function act() { if (state === 'play') place(); }
canvas.addEventListener('pointerdown', (e) => { e.preventDefault(); act(); });
addEventListener('keydown', (e) => {
  if (e.code === 'Space' || e.code === 'Enter') {
    e.preventDefault();
    if (state === 'play') place();
    else if (state === 'over' && !$('over').hidden) startGame();
    else if (state === 'menu') startGame();
  }
});
$('play').onclick = startGame;
$('again').onclick = startGame;
$('toMenu').onclick = () => { $('over').hidden = true; $('hud').hidden = true; $('menu').hidden = false; state = 'menu'; clearAll(); demoTower(); };

// decorative tower behind the menu
function demoTower() {
  applyBg(0);
  for (let i = 0; i < 9; i++) {
    const s = START - i * 0.12;
    const m = makeMesh(s, s, i); m.position.set(Math.sin(i) * 0.25, i * BH - BH / 2, Math.cos(i) * 0.25); world.add(m);
    blocks.push({ mesh: m, x: m.position.x, z: m.position.z, w: s, d: s });
  }
  camY = 2; camTarget = 2;
}
demoTower();

// ---------- loop ----------
const speedOf = () => (SPEEDS.find((s) => s.id === opts.speed) || SPEEDS[1]).v;
let last = performance.now(), spin = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - last) / 1000, 0.05); last = now;
  if (state === 'play' && mover) {
    const sp = speedOf() * (1 + Math.min(level, 40) * 0.018);
    tPhase += dt * sp;
    mover.mesh.position[axis] = moverPos();
    mover.mesh.position.y = mover.y;
  }
  if (state === 'menu') { spin += dt * 0.25; world.rotation.y = Math.sin(spin) * 0.4; } else world.rotation.y *= 0.9;
  // debris
  for (let i = debris.length - 1; i >= 0; i--) {
    const d = debris[i]; d.life += dt; d.vy -= 22 * dt;
    d.mesh.position.x += d.vx * dt; d.mesh.position.z += d.vz * dt; d.mesh.position.y += d.vy * dt;
    d.mesh.rotation.x += d.rx * dt; d.mesh.rotation.z += d.rz * dt;
    if (d.life > 2.5) { world.remove(d.mesh); debris.splice(i, 1); }
  }
  for (let i = rings.length - 1; i >= 0; i--) {
    const r = rings[i]; r.t += dt * 2.2; const k = 1 + r.t * 0.8;
    r.mesh.scale.set(r.w * k, r.d * k, 1);
    (r.mesh.material.opacity !== undefined) && (r.mesh.material.opacity = Math.max(0, 1 - r.t));
    if (r.t >= 1) { world.remove(r.mesh); rings.splice(i, 1); }
  }
  camY += (camTarget - camY) * Math.min(1, dt * 4);
  shake = Math.max(0, shake - dt);
  const sx = shake ? (Math.random() - 0.5) * shake * 1.2 : 0, sy = shake ? (Math.random() - 0.5) * shake * 1.2 : 0;
  cam.position.set(CAMOFF.x + sx, CAMOFF.y + camY + sy, CAMOFF.z);
  cam.lookAt(0, camY + 1.2 + (viewH > 12 ? 2.5 : 0), 0);
  renderer.render(scene, cam);
}
requestAnimationFrame(frame);

// ---------- debug hooks for tests ----------
if (location.search.includes('debug')) {
  window.__ss = {
    get state() { return state; }, get level() { return level; }, get combo() { return combo; },
    start: startGame,
    // place exactly aligned (perfect) or offset by `off` units
    drop(off = 0) {
      const top = blocks[blocks.length - 1];
      const c = axis === 'x' ? top.x : top.z;
      tPhase = Math.asin(Math.max(-1, Math.min(1, (c + off) / RANGE)));
      place();
    },
    blocks: () => blocks.map((b) => ({ x: b.x, z: b.z, w: b.w, d: b.d })),
  };
}
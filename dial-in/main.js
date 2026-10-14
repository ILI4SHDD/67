// ============================================================
//  DIAL IN — two sensory-memory games: PITCH and COLOR
//  Memorize a target, then recreate it. Same seed = same rounds (challenge links).
// ============================================================
const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function mulberry(a) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ROUNDS = 5;
const MEM = {
  pitch: { easy: 3500, hard: 1800 },
  color: { easy: 4000, hard: 2000 },
};
const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const LOG_MIN = Math.log2(110),
  LOG_MAX = Math.log2(1760);

// ---------- Storage ----------
let bests = {};
try {
  bests = JSON.parse(localStorage.getItem('dialin-bests') || '{}');
} catch (e) {}
function saveBests(total) {
  try {
    localStorage.setItem('dialin-bests', JSON.stringify(bests));
    const m = Math.max(0, ...Object.values(bests));
    localStorage.setItem('dialin-best', String(m));
  } catch (e) {}
}
function renderBests() {
  const lab = {
    'pitch-easy': 'Pitch · Easy',
    'pitch-hard': 'Pitch · Hard',
    'color-easy': 'Color · Easy',
    'color-hard': 'Color · Hard',
  };
  $('bests').innerHTML = Object.keys(lab)
    .map((k) => `<span>${lab[k]}: <b>${bests[k] ?? '—'}</b></span>`)
    .join('');
}

// ---------- Audio ----------
let ac = null,
  osc = null,
  gain = null;
function initAudio() {
  if (!ac) {
    try {
      ac = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) {}
  }
  if (ac && ac.state === 'suspended') ac.resume();
}
function toneStart(f, v = 0.22) {
  if (!ac) return;
  toneStop(true);
  osc = ac.createOscillator();
  gain = ac.createGain();
  osc.type = 'sine';
  osc.frequency.value = f;
  gain.gain.setValueAtTime(0, ac.currentTime);
  gain.gain.linearRampToValueAtTime(v, ac.currentTime + 0.04);
  osc.connect(gain).connect(ac.destination);
  osc.start();
}
function toneSet(f) {
  if (osc) osc.frequency.setTargetAtTime(f, ac.currentTime, 0.015);
}
function toneStop(now) {
  if (!osc) return;
  const o = osc,
    g = gain;
  osc = gain = null;
  const t = ac.currentTime;
  g.gain.cancelScheduledValues(t);
  g.gain.setValueAtTime(g.gain.value, t);
  g.gain.linearRampToValueAtTime(0, t + (now ? 0.01 : 0.07));
  o.stop(t + 0.1);
}
function beep(f, d = 0.12, delay = 0, v = 0.05) {
  if (!ac) return;
  const t = ac.currentTime + delay,
    o = ac.createOscillator(),
    g = ac.createGain();
  o.type = 'triangle';
  o.frequency.value = f;
  g.gain.setValueAtTime(v, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  o.connect(g).connect(ac.destination);
  o.start(t);
  o.stop(t + d);
}
const noteInfo = (f) => {
  const m = 69 + 12 * Math.log2(f / 440),
    r = Math.round(m),
    cents = Math.round((m - r) * 100);
  return {
    name: NAMES[((r % 12) + 12) % 12] + (Math.floor(r / 12) - 1),
    cents,
  };
};

// ---------- Scoring ----------
const erb = (f) => 21.4 * Math.log10(1 + 0.00437 * f);
const scorePitch = (a, b, hard) =>
  Math.round(100 * Math.exp(-Math.abs(erb(a) - erb(b)) / (hard ? 1.1 : 1.9)));
function hsl2rgb(h, s, l) {
  s /= 100;
  l /= 100;
  const k = (n) => (n + h / 30) % 12,
    a = s * Math.min(l, 1 - l),
    f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0) * 255, f(8) * 255, f(4) * 255];
}
function lab([r, g, b]) {
  const lin = (c) => {
    c /= 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const R = lin(r),
    G = lin(g),
    B = lin(b);
  let x = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047,
    y = R * 0.2126 + G * 0.7152 + B * 0.0722,
    z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}
const deltaE = (c1, c2) => {
  const a = lab(hsl2rgb(...c1)),
    b = lab(hsl2rgb(...c2));
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
};
const scoreColor = (c1, c2, hard) =>
  Math.round(100 * Math.exp(-deltaE(c1, c2) / (hard ? 11 : 18)));
const hslStr = (c) => `hsl(${c[0]} ${c[1]}% ${c[2]}%)`;

// ---------- State ----------
let mode = 'pitch',
  diff = 'easy',
  seed = 0,
  targets = [],
  idx = 0,
  results = [],
  phase = 'menu',
  token = 0,
  runScore = 0;
let cur = null; // current guess: pitch -> {lg}; color -> [h,s,l]
const viz = { held: false, memo: false, level: 0 };

function makeTargets(sd, m, d) {
  const r = mulberry(
    sd * 31 + (m === 'pitch' ? 1 : 2) * 7 + (d === 'hard' ? 3 : 0)
  );
  const out = [];
  for (let i = 0; i < ROUNDS; i++) {
    if (m === 'pitch') {
      let lg;
      do {
        lg = lerp(Math.log2(150), Math.log2(1250), r());
      } while (out.length && Math.abs(lg - out[out.length - 1].lg) < 0.4);
      let st;
      do {
        st = lerp(LOG_MIN + 0.3, LOG_MAX - 0.3, r());
      } while (Math.abs(st - lg) < 0.6);
      out.push({ lg, start: st });
    } else {
      out.push({
        c: [
          Math.floor(r() * 360),
          Math.round(lerp(d === 'hard' ? 25 : 45, 95, r())),
          Math.round(lerp(28, 72, r())),
        ],
        start: Math.floor(r() * 360),
      });
    }
  }
  return out;
}

// ---------- Screens ----------
function show(id) {
  for (const s of ['menu', 'game', 'final'])
    $(s).classList.toggle('hidden', s !== id);
}
function setDots() {
  $('dots').innerHTML = Array.from(
    { length: ROUNDS },
    (_, i) => `<i class="${i < idx ? 'done' : i === idx ? 'cur' : ''}"></i>`
  ).join('');
}
function setPhase(t) {
  $('phase').textContent = t;
}
function msg(t) {
  $('stageMsg').textContent = t;
}
function timerAnim(ms) {
  const b = $('timerBar');
  b.style.transition = 'none';
  b.style.width = '100%';
  void b.offsetWidth;
  b.style.transition = `width ${ms}ms linear`;
  b.style.width = '0%';
}
function timerReset() {
  const b = $('timerBar');
  b.style.transition = 'none';
  b.style.width = '0%';
}

function startGame(sd) {
  initAudio();
  seed = sd;
  targets = makeTargets(seed, mode, diff);
  idx = 0;
  results = [];
  runScore = 0;
  $('runScore').textContent = '0';
  $('pad').classList.toggle('color', mode === 'color');
  show('game');
  runRound();
}

async function runRound() {
  const my = ++token,
    alive = () => my === token;
  phase = 'memo';
  setDots();
  const T = targets[idx],
    hard = diff === 'hard';
  $('reveal').classList.add('hidden');
  $('nextBtn').classList.add('hidden');
  $('controls').classList.remove('hidden');
  $('stage').style.backgroundColor = '';
  $('pad').classList.add('disabled');
  $('pad').classList.remove('held');
  $('lockBtn').disabled = true;
  $('lightWrap').classList.add('hidden');
  $('padHint').textContent = '';
  timerReset();
  viz.memo = false;
  viz.held = false;
  setPhase(`ROUND ${idx + 1}`);
  msg('GET READY');
  await sleep(900);
  if (!alive()) return;
  const dur = MEM[mode][diff];
  setPhase(mode === 'pitch' ? 'LISTEN' : 'MEMORIZE');
  msg('');
  timerAnim(dur);
  if (mode === 'pitch') {
    viz.memo = true;
    toneStart(Math.pow(2, T.lg));
    await sleep(dur);
    toneStop();
    viz.memo = false;
  } else {
    $('stage').style.backgroundColor = hslStr(T.c);
    await sleep(dur);
  }
  if (!alive()) return;
  $('stage').style.backgroundColor = '';
  timerReset();
  msg(mode === 'pitch' ? '…' : '');
  await sleep(hard ? 1100 : 700);
  if (!alive()) return;
  // dial phase
  phase = 'dial';
  setPhase('DIAL IT IN');
  msg('');
  $('pad').classList.remove('disabled');
  $('lockBtn').disabled = false;
  if (mode === 'pitch') {
    cur = { lg: T.start };
    $('padHint').textContent =
      'Press & hold, then drag left / right · drag upwards = fine tuning';
  } else {
    cur = [T.start, 55, hard ? 50 : T.c[2]];
    $('stage').style.backgroundColor = hslStr(cur);
    $('padHint').textContent = 'Drag: ← → hue · ↑ ↓ saturation';
    if (hard) {
      $('lightWrap').classList.remove('hidden');
      $('light').value = 50;
    }
    placeKnob();
  }
}

// ---------- Input ----------
const pad = $('pad');
let drag = null;
pad.addEventListener('pointerdown', (e) => {
  if (phase !== 'dial') return;
  pad.setPointerCapture(e.pointerId);
  pad.classList.add('held');
  viz.held = true;
  const r = pad.getBoundingClientRect();
  if (mode === 'pitch') {
    drag = {
      x: e.clientX,
      y: e.clientY,
      lg: cur.lg,
      w: r.width,
      lastX: e.clientX,
    };
    toneStart(Math.pow(2, cur.lg));
  } else {
    drag = {};
    moveColor(e, r);
  }
});
pad.addEventListener('pointermove', (e) => {
  if (!drag || phase !== 'dial') return;
  const r = pad.getBoundingClientRect();
  if (mode === 'pitch') {
    const fine = e.clientY < drag.y - 40 ? 0.2 : 1; // dragging upwards = fine tuning
    drag.lg += ((e.clientX - drag.lastX) / drag.w) * 3 * fine;
    drag.lastX = e.clientX;
    cur.lg = clamp(drag.lg, LOG_MIN, LOG_MAX);
    drag.lg = cur.lg;
    toneSet(Math.pow(2, cur.lg));
  } else moveColor(e, r);
});
const endDrag = () => {
  if (!drag) return;
  drag = null;
  pad.classList.remove('held');
  viz.held = false;
  if (mode === 'pitch') toneStop();
};
pad.addEventListener('pointerup', endDrag);
pad.addEventListener('pointercancel', endDrag);
function moveColor(e, r) {
  cur[0] = Math.round(clamp((e.clientX - r.left) / r.width, 0, 1) * 360) % 360;
  cur[1] = Math.round((1 - clamp((e.clientY - r.top) / r.height, 0, 1)) * 100);
  $('stage').style.backgroundColor = hslStr(cur);
  placeKnob();
}
function placeKnob() {
  const k = $('knob');
  k.style.left = (cur[0] / 360) * 100 + '%';
  k.style.top = (1 - cur[1] / 100) * 100 + '%';
}
$('light').addEventListener('input', (e) => {
  if (phase === 'dial' && mode === 'color') {
    cur[2] = +e.target.value;
    $('stage').style.backgroundColor = hslStr(cur);
  }
});

$('lockBtn').addEventListener('click', lockIn);
async function lockIn() {
  if (phase !== 'dial') return;
  phase = 'reveal';
  endDrag();
  toneStop();
  const T = targets[idx],
    hard = diff === 'hard';
  $('pad').classList.add('disabled');
  $('lockBtn').disabled = true;
  let pts, html;
  if (mode === 'pitch') {
    const tf = Math.pow(2, T.lg),
      yf = Math.pow(2, cur.lg);
    pts = scorePitch(tf, yf, hard);
    const pos = (lg) => ((lg - LOG_MIN) / (LOG_MAX - LOG_MIN)) * 100,
      tn = noteInfo(tf),
      yn = noteInfo(yf),
      off = Math.round(1200 * (cur.lg - T.lg));
    html = `<div class="pts">${pts}</div><div class="scale"><div class="line"></div><div class="mk t" style="left:${pos(
      T.lg
    )}%">TARGET<br>${Math.round(
      tf
    )} Hz</div><div class="mk y" id="mkY" style="left:${pos(
      cur.lg < T.lg ? T.lg - 0.0 : T.lg
    )}%">YOU<br>${Math.round(yf)} Hz</div></div><div class="sub">${tn.name} → ${
      yn.name
    } · ${off > 0 ? '+' : ''}${off} cents</div>`;
    results.push({ pts, txt: `${off > 0 ? '+' : ''}${off}¢` });
    $('reveal').innerHTML = html;
    $('reveal').classList.remove('hidden');
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const m = $('mkY');
        if (m) m.style.left = pos(cur.lg) + '%';
      })
    );
    toneStart(tf, 0.12);
    setTimeout(() => toneSet(yf), 450);
    setTimeout(() => toneStop(), 900);
  } else {
    pts = scoreColor(T.c, cur, hard);
    html = `<div class="pts">${pts}</div><div class="pair"><div style="background:${hslStr(
      T.c
    )}">TARGET</div><div style="background:${hslStr(
      cur
    )}">YOU</div></div><div class="sub">${
      pts >= 90
        ? 'Spot on!'
        : pts >= 70
        ? 'Very close'
        : pts >= 40
        ? 'Getting there'
        : 'Not quite'
    }</div>`;
    results.push({ pts, t: hslStr(T.c), y: hslStr(cur) });
    $('reveal').innerHTML = html;
    $('reveal').classList.remove('hidden');
  }
  $('reveal').querySelector('.pts').style.color =
    pts >= 85 ? '#4dffa6' : pts >= 55 ? '#ffd23f' : '#ff6b8b';
  runScore += pts;
  $('runScore').textContent = runScore;
  if (pts >= 85) {
    beep(660, 0.12);
    beep(880, 0.12, 0.1);
    beep(1320, 0.2, 0.2);
  } else beep(330, 0.15);
  setPhase(idx + 1 === ROUNDS ? 'LAST ROUND DONE' : 'RESULT');
  $('controls').classList.add('hidden');
  $('nextBtn').textContent = idx + 1 === ROUNDS ? 'FINISH ▶' : 'NEXT ▶';
  $('nextBtn').classList.remove('hidden');
}
$('nextBtn').addEventListener('click', () => {
  if (phase !== 'reveal') return;
  idx++;
  if (idx >= ROUNDS) finish();
  else runRound();
});

// ---------- Final ----------
function finish() {
  phase = 'final';
  token++;
  show('final');
  const total = results.reduce((a, r) => a + r.pts, 0),
    key = `${mode}-${diff}`,
    isBest = total > (bests[key] ?? -1);
  if (isBest) {
    bests[key] = total;
    saveBests();
  }
  $('finalScore').innerHTML = `${total}<small>/${ROUNDS * 100}</small>`;
  const rank =
    total >= 450
      ? mode === 'pitch'
        ? 'PERFECT PITCH'
        : 'GOLDEN EYE'
      : total >= 380
      ? 'SHARP SENSES'
      : total >= 300
      ? 'SOLID'
      : total >= 200
      ? 'WARMING UP'
      : 'KEEP TRAINING';
  $('rank').textContent = rank;
  $('newBest').classList.toggle('hidden', !isBest || total === 0);
  $('roundList').innerHTML = results
    .map(
      (r, i) =>
        `<div>R${i + 1}<b>${r.pts}</b>${
          mode === 'color'
            ? `<i><u style="background:${r.t}"></u><u style="background:${r.y}"></u></i>`
            : `<span>${r.txt}</span>`
        }</div>`
    )
    .join('');
  $(
    'shareLink'
  ).value = `${location.origin}${location.pathname}?mode=${mode}&diff=${diff}&seed=${seed}`;
  renderBests();
  beep(523, 0.15);
  beep(659, 0.15, 0.12);
  beep(784, 0.15, 0.24);
  beep(1047, 0.3, 0.36);
}
$('copyBtn').addEventListener('click', async () => {
  const i = $('shareLink');
  i.select();
  try {
    await navigator.clipboard.writeText(i.value);
    $('copyBtn').textContent = 'COPIED ✓';
    setTimeout(() => ($('copyBtn').textContent = 'COPY CHALLENGE LINK'), 1500);
  } catch (e) {
    document.execCommand && document.execCommand('copy');
  }
});
$('againBtn').addEventListener('click', () =>
  startGame(Math.floor(Math.random() * 900000) + 100000)
);
$('menuBtn').addEventListener('click', () => {
  token++;
  toneStop();
  phase = 'menu';
  renderBests();
  show('menu');
});

// ---------- Menu ----------
document.querySelectorAll('.mode').forEach((b) =>
  b.addEventListener('click', () => {
    mode = b.dataset.mode;
    document
      .querySelectorAll('.mode')
      .forEach((x) => x.classList.toggle('sel', x === b));
  })
);
document.querySelectorAll('#diffSeg button').forEach((b) =>
  b.addEventListener('click', () => {
    diff = b.dataset.diff;
    document
      .querySelectorAll('#diffSeg button')
      .forEach((x) => x.classList.toggle('sel', x === b));
  })
);
$('startBtn').addEventListener('click', () =>
  startGame(Math.floor(Math.random() * 900000) + 100000)
);
addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    if (phase === 'dial') {
      e.preventDefault();
      lockIn();
    } else if (phase === 'reveal') {
      e.preventDefault();
      $('nextBtn').click();
    }
  }
});
renderBests();

// ---------- Pitch visualizer ----------
const cv = $('viz'),
  cx = cv.getContext('2d');
function frame(now) {
  requestAnimationFrame(frame);
  if (phase === 'menu' || phase === 'final') return;
  const dpr = Math.min(2, devicePixelRatio || 1),
    w = cv.clientWidth,
    h = cv.clientHeight;
  if (cv.width !== w * dpr) {
    cv.width = w * dpr;
    cv.height = h * dpr;
  }
  cx.setTransform(dpr, 0, 0, dpr, 0, 0);
  cx.clearRect(0, 0, w, h);
  if (mode !== 'pitch') return;
  const t = now / 1000,
    mx = w / 2,
    my = h / 2;
  viz.level = lerp(viz.level, viz.memo || viz.held ? 1 : 0.08, 0.1);
  const pos =
    phase === 'dial' && cur ? (cur.lg - LOG_MIN) / (LOG_MAX - LOG_MIN) : 0.5;
  const hue = viz.memo ? 190 : 200 + pos * 160;
  for (let i = 0; i < 5; i++) {
    const ph = (t * (viz.memo ? 0.7 : 0.4 + pos) + i / 5) % 1,
      rad =
        (0.12 + ph * 0.55 + (phase === 'dial' ? pos * 0.12 : 0)) *
        Math.min(w, h);
    cx.strokeStyle = `hsla(${hue},90%,65%,${
      (1 - ph) * 0.8 * viz.level + 0.04
    })`;
    cx.lineWidth = 2 + (1 - ph) * 4;
    cx.beginPath();
    cx.arc(mx, my, rad, 0, Math.PI * 2);
    cx.stroke();
  }
  const g = cx.createRadialGradient(mx, my, 0, mx, my, 70);
  g.addColorStop(0, `hsla(${hue},95%,70%,${0.4 + 0.5 * viz.level})`);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  cx.fillStyle = g;
  cx.beginPath();
  cx.arc(mx, my, 70, 0, Math.PI * 2);
  cx.fill();
  cx.fillStyle = `hsl(${hue},90%,75%)`;
  cx.beginPath();
  cx.arc(
    mx,
    my,
    10 + 6 * viz.level * (0.5 + 0.5 * Math.sin(t * 8)),
    0,
    Math.PI * 2
  );
  cx.fill();
}
requestAnimationFrame(frame);

// ---------- Challenge link ----------
{
  const q = new URLSearchParams(location.search),
    s = parseInt(q.get('seed') || '', 10);
  if (['pitch', 'color'].includes(q.get('mode'))) {
    mode = q.get('mode');
    document
      .querySelectorAll('.mode')
      .forEach((x) => x.classList.toggle('sel', x.dataset.mode === mode));
  }
  if (['easy', 'hard'].includes(q.get('diff'))) {
    diff = q.get('diff');
    document
      .querySelectorAll('#diffSeg button')
      .forEach((x) => x.classList.toggle('sel', x.dataset.diff === diff));
  }
  if (s > 0) {
    const b = document.createElement('button');
    b.className = 'btn2';
    b.style.marginTop = '14px';
    b.textContent = `ACCEPT CHALLENGE · ${mode.toUpperCase()} · ${diff.toUpperCase()}`;
    b.onclick = () => {
      b.remove();
      startGame(s);
    };
    $('menu').appendChild(b);
  }
}
if (location.search.includes('debug'))
  window.__di = {
    get targets() {
      return targets;
    },
    get cur() {
      return cur;
    },
    set cur(v) {
      cur = v;
    },
    get phase() {
      return phase;
    },
    lockIn,
    startGame,
    setMode: (m, d) => {
      mode = m;
      diff = d;
    },
  };

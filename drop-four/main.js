// ============================================================
//  DROP FOUR : customizable connect-four (vs computer or local)
// ============================================================
const $ = (id) => document.getElementById(id);
const TAU = Math.PI * 2;

// ---------- settings ----------
const COLORS = [
  '#ef4444',
  '#f97316',
  '#facc15',
  '#22c55e',
  '#14b8a6',
  '#3b82f6',
  '#8b5cf6',
  '#ec4899',
  '#f8fafc',
  '#111827',
];
const STYLES = [
  ['solid', 'Solid'],
  ['ring', 'Ring'],
  ['stripes', 'Stripes'],
  ['star', '★ Star'],
  ['heart', '♥ Heart'],
  ['smile', '☺ Smiley'],
  ['emoji', 'Emoji'],
  ['photo', '📷 Photo'],
];
const EMOJIS = [
  '😎',
  '🔥',
  '⚡',
  '🐱',
  '🐶',
  '🦄',
  '🍕',
  '⚽',
  '🌸',
  '💀',
  '👑',
  '🌈',
  '🍩',
  '🎃',
  '❄️',
  '🪐',
];
const THEMES = {
  classic: {
    n: 'Classic',
    dot: '#2f6bff',
    a: '#3b7bff',
    b: '#1c3fb5',
    rim: '#12307f',
    bg: ['#0b1330', '#16296b'],
  },
  wood: {
    n: 'Wood',
    dot: '#b07a44',
    a: '#c9955c',
    b: '#8a5a2b',
    rim: '#5c3a18',
    bg: ['#24160b', '#4a2e18'],
    wood: true,
  },
  neon: {
    n: 'Neon',
    dot: '#22d3ee',
    a: '#1b1240',
    b: '#0c0722',
    rim: '#22d3ee',
    bg: ['#05020f', '#170a3a'],
    glow: '#22d3ee',
  },
  sakura: {
    n: 'Sakura',
    dot: '#f472b6',
    a: '#ffb8d6',
    b: '#f06aa8',
    rim: '#a21e5f',
    bg: ['#3b0a2a', '#7a1a55'],
  },
  slate: {
    n: 'Slate',
    dot: '#64748b',
    a: '#7b8aa0',
    b: '#3b475a',
    rim: '#1e293b',
    bg: ['#0b0f19', '#1f2937'],
  },
  glass: {
    n: 'Glass',
    dot: '#9ad7ff',
    a: 'rgba(255,255,255,0.30)',
    b: 'rgba(255,255,255,0.14)',
    rim: 'rgba(255,255,255,0.65)',
    bg: ['#0f2027', '#2c5364'],
    glass: true,
  },
};
const DEFAULTS = {
  mode: 'ai',
  level: 3,
  first: 'p1',
  theme: 'classic',
  size: '7x6',
  n: 4,
  variant: 'classic',
  timer: 0,
  series: 0,
  hints: true,
  muted: false,
  p1: {
    name: 'Player 1',
    color: '#ef4444',
    style: 'solid',
    emoji: '😎',
    img: null,
  },
  p2: {
    name: 'Player 2',
    color: '#facc15',
    style: 'solid',
    emoji: '🔥',
    img: null,
  },
};
const SKEY = 'dropfour-settings',
  WKEY = 'dropfour-wins';
const clone = (o) => JSON.parse(JSON.stringify(o));
let S = clone(DEFAULTS);
try {
  const l = JSON.parse(localStorage.getItem(SKEY) || '{}');
  Object.assign(S, l, {
    p1: { ...S.p1, ...(l.p1 || {}) },
    p2: { ...S.p2, ...(l.p2 || {}) },
  });
} catch (e) {
  /* ignore */
}
let wins = 0;
try {
  wins = parseInt(localStorage.getItem(WKEY) || '0', 10) || 0;
} catch (e) {
  /* ignore */
}
let warned = false;
function persist() {
  try {
    localStorage.setItem(SKEY, JSON.stringify(S));
  } catch (e) {
    if (!warned) {
      warned = true;
      toast('Settings kept for this session only (photo too big to store).');
    }
  }
}
function toast(msg) {
  const t = document.createElement('div');
  t.textContent = msg;
  t.style.cssText =
    'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:99;background:#1e293b;color:#fff;border:2px solid #ffd23f;padding:8px 16px;border-radius:12px;font-weight:700;max-width:90vw;text-align:center';
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3200);
}
const pName = (p) => {
  const s = p === 1 ? S.p1 : S.p2;
  return p === 2 && S.mode === 'ai' && (!s.name.trim() || s.name === 'Player 2')
    ? 'Computer'
    : s.name.trim() || 'Player ' + p;
};

// ---------- images ----------
const imgs = { 1: null, 2: null };
function refreshImgs() {
  [1, 2].forEach((p) => {
    const src = (p === 1 ? S.p1 : S.p2).img;
    if (src) {
      const im = new Image();
      im.src = src;
      imgs[p] = im;
    } else imgs[p] = null;
  });
}
function readImage(file) {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => {
      const im = new Image();
      im.onload = () => res(im);
      im.onerror = rej;
      im.src = fr.result;
    };
    fr.onerror = rej;
    fr.readAsDataURL(file);
  });
}
async function setPhoto(p, file) {
  if (!file || !file.type.startsWith('image/'))
    return toast('Please choose an image file.');
  let im;
  try {
    im = await readImage(file);
  } catch (e) {
    return toast("Couldn't read that image. Try JPG, PNG or WebP.");
  }
  const c = document.createElement('canvas');
  c.width = c.height = 192;
  const x = c.getContext('2d');
  const iw = im.naturalWidth,
    ih = im.naturalHeight,
    m = Math.min(iw, ih);
  x.drawImage(im, (iw - m) / 2, (ih - m) / 2, m, m, 0, 0, 192, 192);
  (p === 1 ? S.p1 : S.p2).img = c.toDataURL('image/jpeg', 0.85);
  refreshImgs();
  persist();
  renderPlayerCards();
  drawPreview();
}

// ---------- audio ----------
let ac = null;
function audio() {
  if (!ac) {
    try {
      ac = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) {
      ac = null;
    }
  }
  if (ac && ac.state === 'suspended') ac.resume();
  return ac;
}
function tone(f, d, type = 'sine', v = 0.12, at = 0, f2) {
  if (S.muted || !audio()) return;
  const t = ac.currentTime + at,
    o = ac.createOscillator(),
    g = ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + d);
  g.gain.setValueAtTime(v, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + d);
  o.connect(g).connect(ac.destination);
  o.start(t);
  o.stop(t + d + 0.02);
}
const sfx = {
  hit: (s = 1) => {
    tone(180 + 80 * s, 0.1, 'triangle', 0.12 * Math.min(1, s + 0.3), 0, 90);
    tone(900, 0.04, 'square', 0.03 * s);
  },
  click: () => tone(560, 0.04, 'triangle', 0.07),
  win: () =>
    [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) =>
      tone(f, 0.2, 'triangle', 0.13, i * 0.1)
    ),
  lose: () =>
    [400, 330, 262, 196].forEach((f, i) =>
      tone(f, 0.25, 'sawtooth', 0.08, i * 0.15)
    ),
  draw: () =>
    [392, 392, 330].forEach((f, i) => tone(f, 0.2, 'triangle', 0.1, i * 0.15)),
  tick: () => tone(1000, 0.04, 'square', 0.04),
  pop: () => tone(700, 0.18, 'sine', 0.1, 0, 200),
  hint: () => {
    tone(880, 0.1, 'sine', 0.08);
    tone(1320, 0.14, 'sine', 0.08, 0.08);
  },
};

// ---------- color helpers ----------
function hexRgb(h) {
  const n = parseInt(h.slice(1), 16);
  return [n >> 16, (n >> 8) & 255, n & 255];
}
function shade(h, a) {
  const [r, g, b] = hexRgb(h),
    f = (v) =>
      Math.max(
        0,
        Math.min(255, Math.round(a >= 0 ? v + (255 - v) * a : v * (1 + a)))
      );
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}

// ---------- token drawing ----------
function starPath(c, x, y, r) {
  c.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5,
      rr = i % 2 ? r * 0.45 : r;
    c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  c.closePath();
}
function heartPath(c, x, y, r) {
  c.beginPath();
  c.moveTo(x, y + r * 0.9);
  c.bezierCurveTo(
    x - r * 1.5,
    y - r * 0.1,
    x - r * 0.7,
    y - r * 1.2,
    x,
    y - r * 0.4
  );
  c.bezierCurveTo(
    x + r * 0.7,
    y - r * 1.2,
    x + r * 1.5,
    y - r * 0.1,
    x,
    y + r * 0.9
  );
  c.closePath();
}
function drawToken(c, x, y, r, p, alpha = 1) {
  const s = p === 1 ? S.p1 : S.p2,
    col = s.color;
  c.save();
  c.globalAlpha *= alpha;
  const g = c.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
  g.addColorStop(0, shade(col, 0.45));
  g.addColorStop(0.55, col);
  g.addColorStop(1, shade(col, -0.35));
  c.fillStyle = g;
  c.beginPath();
  c.arc(x, y, r, 0, TAU);
  c.fill();
  c.lineWidth = r * 0.08;
  c.strokeStyle = shade(col, -0.5);
  c.stroke();
  c.lineWidth = r * 0.06;
  c.strokeStyle = 'rgba(255,255,255,0.35)';
  c.beginPath();
  c.arc(x, y, r * 0.74, 0, TAU);
  c.stroke();
  const light = ['#f8fafc', '#facc15'].includes(col),
    ink = light ? 'rgba(30,30,40,0.8)' : 'rgba(255,255,255,0.92)';
  switch (s.style) {
    case 'ring':
      c.lineWidth = r * 0.22;
      c.strokeStyle = ink;
      c.globalAlpha *= 0.55;
      c.beginPath();
      c.arc(x, y, r * 0.42, 0, TAU);
      c.stroke();
      break;
    case 'stripes':
      c.save();
      c.beginPath();
      c.arc(x, y, r * 0.72, 0, TAU);
      c.clip();
      c.fillStyle = ink;
      c.globalAlpha *= 0.3;
      for (let i = -3; i <= 3; i++) {
        c.save();
        c.translate(x + i * r * 0.36, y);
        c.rotate(0.6);
        c.fillRect(-r * 0.09, -r * 1.2, r * 0.18, r * 2.4);
        c.restore();
      }
      c.restore();
      break;
    case 'star':
      c.fillStyle = ink;
      starPath(c, x, y + r * 0.04, r * 0.55);
      c.fill();
      break;
    case 'heart':
      c.fillStyle = ink;
      heartPath(c, x, y, r * 0.42);
      c.fill();
      break;
    case 'smile':
      c.fillStyle = ink;
      c.beginPath();
      c.arc(x - r * 0.25, y - r * 0.15, r * 0.09, 0, TAU);
      c.arc(x + r * 0.25, y - r * 0.15, r * 0.09, 0, TAU);
      c.fill();
      c.strokeStyle = ink;
      c.lineWidth = r * 0.1;
      c.lineCap = 'round';
      c.beginPath();
      c.arc(x, y + r * 0.02, r * 0.38, 0.2, Math.PI - 0.2);
      c.stroke();
      break;
    case 'emoji':
      c.font = `${
        r * 1.05
      }px 'Segoe UI Emoji','Apple Color Emoji','Noto Color Emoji',sans-serif`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(s.emoji, x, y + r * 0.06);
      break;
    case 'photo': {
      const im = imgs[p];
      if (im && im.complete && im.naturalWidth) {
        c.save();
        c.beginPath();
        c.arc(x, y, r * 0.78, 0, TAU);
        c.clip();
        c.drawImage(im, x - r * 0.78, y - r * 0.78, r * 1.56, r * 1.56);
        c.restore();
        c.strokeStyle = shade(col, 0.3);
        c.lineWidth = r * 0.07;
        c.beginPath();
        c.arc(x, y, r * 0.78, 0, TAU);
        c.stroke();
      }
      break;
    }
    default:
      break;
  }
  c.globalAlpha = alpha;
  c.fillStyle = 'rgba(255,255,255,0.28)';
  c.beginPath();
  c.ellipse(x - r * 0.38, y - r * 0.5, r * 0.28, r * 0.15, -0.6, 0, TAU);
  c.fill();
  c.restore();
}
function tokenCanvas(canvas, p) {
  const c = canvas.getContext('2d'),
    w = canvas.width;
  c.clearRect(0, 0, w, w);
  drawToken(c, w / 2, w / 2, w * 0.42, p);
}

// ================= BOARD LOGIC =================
class Board {
  constructor(cols, rows, N, pop) {
    this.cols = cols;
    this.rows = rows;
    this.N = N;
    this.pop = pop;
    this.cells = new Int8Array(cols * rows);
    this.h = new Int8Array(cols);
    this.moves = 0;
  }
  copy() {
    const b = new Board(this.cols, this.rows, this.N, this.pop);
    b.cells.set(this.cells);
    b.h.set(this.h);
    b.moves = this.moves;
    return b;
  }
  get(c, r) {
    return this.cells[c * this.rows + r];
  }
  drop(c, p) {
    const r = this.h[c]++;
    this.cells[c * this.rows + r] = p;
    this.moves++;
    return r;
  }
  undrop(c) {
    const r = --this.h[c];
    this.cells[c * this.rows + r] = 0;
    this.moves--;
  }
  popBottom(c) {
    const base = c * this.rows,
      saved = this.cells.slice(base, base + this.rows),
      n = this.h[c];
    for (let r = 0; r < n - 1; r++)
      this.cells[base + r] = this.cells[base + r + 1];
    this.cells[base + n - 1] = 0;
    this.h[c]--;
    this.moves++;
    return saved;
  }
  unpop(c, saved) {
    const base = c * this.rows;
    for (let r = 0; r < this.rows; r++) this.cells[base + r] = saved[r];
    this.h[c]++;
    this.moves--;
  }
  line(c, r, p) {
    const dirs = [
      [1, 0],
      [0, 1],
      [1, 1],
      [1, -1],
    ];
    for (const [dx, dy] of dirs) {
      const out = [[c, r]];
      for (let s = 1; ; s++) {
        const x = c + dx * s,
          y = r + dy * s;
        if (
          x < 0 ||
          y < 0 ||
          x >= this.cols ||
          y >= this.rows ||
          this.cells[x * this.rows + y] !== p
        )
          break;
        out.push([x, y]);
      }
      for (let s = 1; ; s++) {
        const x = c - dx * s,
          y = r - dy * s;
        if (
          x < 0 ||
          y < 0 ||
          x >= this.cols ||
          y >= this.rows ||
          this.cells[x * this.rows + y] !== p
        )
          break;
        out.push([x, y]);
      }
      if (out.length >= this.N) return out;
    }
    return null;
  }
  wins(c, r, p) {
    const dirs = [
      [1, 0],
      [0, 1],
      [1, 1],
      [1, -1],
    ];
    for (const [dx, dy] of dirs) {
      let n = 1;
      for (let s = 1; s < this.N; s++) {
        const x = c + dx * s,
          y = r + dy * s;
        if (
          x < 0 ||
          y < 0 ||
          x >= this.cols ||
          y >= this.rows ||
          this.cells[x * this.rows + y] !== p
        )
          break;
        n++;
      }
      for (let s = 1; s < this.N; s++) {
        const x = c - dx * s,
          y = r - dy * s;
        if (
          x < 0 ||
          y < 0 ||
          x >= this.cols ||
          y >= this.rows ||
          this.cells[x * this.rows + y] !== p
        )
          break;
        n++;
      }
      if (n >= this.N) return true;
    }
    return false;
  }
  // after a pop in column c: returns winner (mover wins ties) or 0
  popWinner(c, mover) {
    let other = 0;
    for (let r = 0; r < this.h[c]; r++) {
      const p = this.cells[c * this.rows + r];
      if (this.wins(c, r, p)) {
        if (p === mover) return mover;
        other = p;
      }
    }
    return other;
  }
  full() {
    for (let c = 0; c < this.cols; c++) if (this.h[c] < this.rows) return false;
    return true;
  }
  legal(p) {
    const m = [],
      mid = (this.cols - 1) / 2,
      order = [...Array(this.cols).keys()].sort(
        (a, b) => Math.abs(a - mid) - Math.abs(b - mid)
      );
    for (const c of order) if (this.h[c] < this.rows) m.push({ t: 'd', c });
    if (this.pop)
      for (const c of order)
        if (this.h[c] > 0 && this.cells[c * this.rows] === p)
          m.push({ t: 'p', c });
    return m;
  }
}

// ================= AI =================
const winCache = {};
function windows(cols, rows, N) {
  const key = `${cols}x${rows}x${N}`;
  if (winCache[key]) return winCache[key];
  const w = [];
  for (const [dx, dy] of [
    [1, 0],
    [0, 1],
    [1, 1],
    [1, -1],
  ])
    for (let c = 0; c < cols; c++)
      for (let r = 0; r < rows; r++) {
        const ex = c + dx * (N - 1),
          ey = r + dy * (N - 1);
        if (ex < 0 || ey < 0 || ex >= cols || ey >= rows) continue;
        const cells = [];
        for (let s = 0; s < N; s++)
          cells.push((c + dx * s) * rows + (r + dy * s));
        w.push(cells);
      }
  return (winCache[key] = w);
}
const WIN = 100000;
function evaluate(b, p) {
  const o = 3 - p,
    ws = windows(b.cols, b.rows, b.N);
  let sc = 0;
  for (const w of ws) {
    let a = 0,
      e = 0;
    for (const i of w) {
      const v = b.cells[i];
      if (v === p) a++;
      else if (v === o) e++;
    }
    if (a && e) continue;
    if (a) sc += Math.pow(10, a - 1);
    else if (e) sc -= Math.pow(10, e - 1) * 1.05;
  }
  const mid = (b.cols - 1) / 2;
  for (let c = 0; c < b.cols; c++)
    for (let r = 0; r < b.h[c]; r++) {
      const v = b.cells[c * b.rows + r],
        bonus = (b.cols / 2 - Math.abs(c - mid)) * 0.8;
      sc += v === p ? bonus : v === o ? -bonus : 0;
    }
  return sc;
}
let nodes = 0,
  deadline = 0,
  aborted = false;
function negamax(b, p, depth, alpha, beta, ply) {
  if ((++nodes & 1023) === 0 && performance.now() > deadline) aborted = true;
  if (aborted) return 0;
  const moves = b.legal(p);
  if (!moves.length) return 0;
  if (depth === 0) return evaluate(b, p);
  let best = -Infinity;
  for (const m of moves) {
    let sc,
      saved = null;
    if (m.t === 'd') {
      const r = b.drop(m.c, p);
      sc = b.wins(m.c, r, p) ? WIN - ply : null;
    } else {
      saved = b.popBottom(m.c);
      const w = b.popWinner(m.c, p);
      sc = w === p ? WIN - ply : w ? -(WIN - ply) : null;
    }
    if (sc === null) sc = -negamax(b, 3 - p, depth - 1, -beta, -alpha, ply + 1);
    if (m.t === 'd') b.undrop(m.c);
    else b.unpop(m.c, saved);
    if (aborted) return 0;
    if (sc > best) best = sc;
    if (best > alpha) alpha = best;
    if (alpha >= beta) break;
  }
  return best;
}
function searchRoot(b0, p, depth, ms) {
  const b = b0.copy(),
    moves = b.legal(p);
  let result = null;
  nodes = 0;
  aborted = false;
  deadline = performance.now() + ms;
  for (let d = 1; d <= depth; d++) {
    const scored = [];
    let alpha = -Infinity;
    for (const m of moves) {
      let sc,
        saved = null;
      if (m.t === 'd') {
        const r = b.drop(m.c, p);
        sc = b.wins(m.c, r, p) ? WIN : null;
      } else {
        saved = b.popBottom(m.c);
        const w = b.popWinner(m.c, p);
        sc = w === p ? WIN : w ? -WIN : null;
      }
      if (sc === null) sc = -negamax(b, 3 - p, d - 1, -Infinity, -alpha + 1, 1);
      if (m.t === 'd') b.undrop(m.c);
      else b.unpop(m.c, saved);
      if (aborted) break;
      scored.push({ m, sc });
      if (sc > alpha) alpha = sc - 0;
      if (sc >= WIN) break;
    }
    if (aborted) break;
    result = scored;
    if (scored.some((s) => s.sc >= WIN)) break;
    if (performance.now() > deadline) break;
  }
  if (!result) result = moves.map((m) => ({ m, sc: 0 }));
  return result;
}
function aiChoose(b, p, level, fast) {
  const moves = b.legal(p);
  if (!moves.length) return null;
  const big = b.cols * b.rows > 56,
    popM = b.pop;
  const cfg = fast
    ? { depth: popM ? 5 : big ? 6 : 8, ms: 700 }
    : {
        1: { depth: 2, ms: 200 },
        2: { depth: 4, ms: 400 },
        3: { depth: popM ? 4 : 6, ms: 700 },
        4: { depth: popM ? 6 : big ? 7 : 11, ms: 1100 },
      }[level];
  if (level === 1 && !fast && Math.random() < 0.3)
    return moves[Math.floor(Math.random() * Math.min(moves.length, b.cols))];
  const res = searchRoot(b, p, cfg.depth, cfg.ms),
    top = Math.max(...res.map((r) => r.sc));
  const best = res.filter((r) => r.sc >= top - (level <= 2 && !fast ? 3 : 0));
  return best[Math.floor(Math.random() * best.length)].m;
}

// ================= GAME STATE =================
let B = null,
  turn = 1,
  over = false,
  busy = false,
  started = false,
  tokens = [],
  ghosts = [],
  history = [],
  scores = [0, 0, 0],
  round = 0,
  starter = 1,
  hintCol = -1,
  hintT = 0,
  hover = -1,
  kbCol = 3,
  timeLeft = 0,
  lastSec = -1,
  winCells = [],
  winPulse = 0,
  afterSettle = null,
  thinking = false,
  seriesOver = false,
  lastTick = performance.now();
const cv = $('cv'),
  ctx = cv.getContext('2d');
let L = null,
  geo = null;

function sizeOf() {
  const [c, r] = S.size.split('x').map(Number);
  return { cols: c, rows: r };
}
function newRound(keepScores = true) {
  const { cols, rows } = sizeOf();
  B = new Board(cols, rows, +S.n, S.variant === 'pop');
  if (!keepScores) {
    scores = [0, 0, 0];
    round = 0;
    seriesOver = false;
  }
  starter =
    S.first === 'p1'
      ? 1
      : S.first === 'p2'
      ? 2
      : S.first === 'rand'
      ? Math.random() < 0.5
        ? 1
        : 2
      : round % 2 === 0
      ? 1
      : 2;
  turn = starter;
  over = false;
  busy = false;
  tokens = [];
  ghosts = [];
  history = [];
  winCells = [];
  hintCol = -1;
  afterSettle = null;
  thinking = false;
  kbCol = Math.floor(cols / 2);
  hover = -1;
  started = true;
  round++;
  $('result').classList.add('hidden');
  layout();
  buildLayer();
  beginTurn();
  updateHud();
}
function showGame() {
  $('menu').classList.add('hidden');
  $('game').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  newRound(false);
}
function showMenu() {
  started = false;
  $('game').classList.add('hidden');
  $('result').classList.add('hidden');
  $('menu').classList.remove('hidden');
  document.body.style.overflow = '';
  renderAll();
}
const isAI = (p) => S.mode === 'ai' && p === 2;
function beginTurn() {
  timeLeft = +S.timer;
  lastSec = -1;
  updateHud();
  if (over) return;
  if (isAI(turn)) {
    thinking = true;
    setTimeout(aiMove, 450);
  } else thinking = false;
}
function aiMove() {
  if (over || !started || !isAI(turn)) return;
  const m = aiChoose(B, 2, +S.level, false);
  thinking = false;
  if (m) doMove(m);
}
function doMove(m) {
  if (over || busy) return;
  hintCol = -1;
  history.push({
    cells: B.cells.slice(),
    h: B.h.slice(),
    moves: B.moves,
    turn,
    round,
  });
  const p = turn;
  let win = 0,
    cells = null;
  if (m.t === 'd') {
    const r = B.drop(m.c, p);
    tokens.push({
      c: m.c,
      r,
      p,
      y: B.rows + 0.9,
      vd: 0,
      settled: false,
      hit: false,
    });
    cells = B.line(m.c, r, p);
    if (cells) win = p;
  } else {
    const idx = tokens.findIndex((t) => t.c === m.c && t.r === 0);
    const bt = tokens[idx];
    tokens.splice(idx, 1);
    ghosts.push({ c: m.c, y: 0, vy: 1, p: bt.p, rot: 0, life: 1 });
    B.popBottom(m.c);
    tokens
      .filter((t) => t.c === m.c)
      .forEach((t) => {
        t.r--;
        t.settled = false;
        t.hit = false;
        t.vd = 0;
      });
    sfx.pop();
    win = B.popWinner(m.c, p);
    if (win) {
      cells = [];
      for (let r = 0; r < B.h[m.c]; r++) {
        const q = B.get(m.c, r);
        if (q === win) {
          const l = B.line(m.c, r, q);
          if (l) {
            cells = l;
            break;
          }
        }
      }
    }
  }
  busy = true;
  afterSettle = () => {
    busy = false;
    if (win) return finish(win, cells || []);
    if (B.full() && !B.legal(3 - p).length && !B.legal(p).length)
      return finish(0, []);
    if (B.moves >= 160) return finish(0, []);
    if (!B.legal(3 - p).length) {
      /* opponent stuck: skip their turn */ return beginTurn();
    }
    turn = 3 - p;
    beginTurn();
  };
  updateHud();
}
function finish(w, cells) {
  over = true;
  winCells = cells;
  winPulse = 0;
  thinking = false;
  if (w) {
    scores[w]++;
    if (S.mode === 'ai' && w === 1) {
      wins++;
      try {
        localStorage.setItem(WKEY, String(wins));
      } catch (e) {
        /* ignore */
      }
    }
    S.mode === 'ai' && w === 2 ? sfx.lose() : sfx.win();
    if (!(S.mode === 'ai' && w === 2)) confetti(w === 1 ? 140 : 140);
  } else sfx.draw();
  updateHud();
  setTimeout(() => showResult(w), 1100);
}
function showResult(w) {
  if (!over || !started) return;
  const need = S.series ? Math.ceil(+S.series / 2) : 0;
  seriesOver = !!(need && (scores[1] >= need || scores[2] >= need));
  const rt = $('rTok');
  rt.classList.remove('hidden');
  if (w) tokenCanvas(rt, w);
  else {
    const c = rt.getContext('2d');
    c.clearRect(0, 0, 140, 140);
    drawToken(c, 48, 70, 40, 1);
    drawToken(c, 92, 70, 40, 2);
  }
  $('rTitle').textContent = w
    ? S.mode === 'ai' && w === 2
      ? 'Computer wins!'
      : `${pName(w)} wins!`
    : "It's a draw!";
  $('rSub').textContent = seriesOver
    ? `🏆 ${pName(scores[1] > scores[2] ? 1 : 2)} takes the series ${Math.max(
        scores[1],
        scores[2]
      )}–${Math.min(scores[1], scores[2])}`
    : `Score: ${pName(1)} ${scores[1]} – ${scores[2]} ${pName(2)}`;
  $('nextBtn').textContent = seriesOver
    ? 'NEW SERIES'
    : S.series
    ? 'NEXT ROUND'
    : 'PLAY AGAIN';
  $('result').classList.remove('hidden');
}
function undo() {
  if (busy || over || !history.length || thinking) return;
  let h;
  if (S.mode === 'ai') {
    while (history.length && history[history.length - 1].turn === 2)
      h = history.pop();
    if (history.length) h = history.pop();
  } else h = history.pop();
  if (!h) return;
  B.cells.set(h.cells);
  B.h.set(h.h);
  B.moves = h.moves;
  turn = h.turn;
  tokens = [];
  ghosts = [];
  winCells = [];
  for (let c = 0; c < B.cols; c++)
    for (let r = 0; r < B.h[c]; r++)
      tokens.push({
        c,
        r,
        p: B.get(c, r),
        y: r,
        vd: 0,
        settled: true,
        hit: true,
      });
  hintCol = -1;
  sfx.click();
  beginTurn();
  updateHud();
}
function hint() {
  if (busy || over || thinking || isAI(turn)) return;
  const m = aiChoose(B, turn, 4, true);
  if (!m) return;
  hintCol = m.c;
  hintT = 2.5;
  hintPop = m.t === 'p';
  sfx.hint();
}
let hintPop = false;

// ---------- HUD ----------
function updateHud() {
  [1, 2].forEach((p) => {
    const el = $('pl' + p);
    el.querySelector('.nm').textContent = pName(p);
    el.querySelector('.sc').textContent = scores[p];
    tokenCanvas(el.querySelector('canvas'), p);
    el.classList.toggle('active', started && !over && turn === p);
  });
  const st = $('status');
  if (over)
    st.textContent = winCells.length
      ? '🎉 Four in a row!'.replace(
          'Four',
          ['', '', '', 'Three', 'Four', 'Five'][B.N]
        )
      : 'Draw';
  else if (thinking) st.textContent = '🤔 Thinking…';
  else
    st.textContent = isAI(turn)
      ? 'Computer…'
      : S.mode === 'ai'
      ? 'Your turn'
      : `${pName(turn)}'s turn`;
  $('tbar').classList.toggle('hidden', !+S.timer);
  $('undoBtn').classList.toggle('hidden', !S.hints);
  $('hintBtn').classList.toggle('hidden', !S.hints);
  $('undoBtn').disabled = busy || over || !history.length || thinking;
  $('hintBtn').disabled = busy || over || thinking || isAI(turn);
  $('muteBtn2').textContent = S.muted ? '🔇' : '🔊';
}

// ---------- layout / rendering ----------
let cssW = 0,
  cssH = 0,
  dpr = 1;
function layout() {
  const wrap = $('wrap');
  if (!B || !wrap.clientWidth) return;
  const aw = wrap.clientWidth,
    ah = wrap.clientHeight,
    popExtra = B.pop ? 0.95 : 0.35;
  const u = Math.max(
    24,
    Math.min(
      92,
      Math.floor(
        Math.min(aw / (B.cols + 0.9), ah / (B.rows + 1.2 + 0.5 + popExtra))
      )
    )
  );
  const pad = u * 0.25,
    bw = B.cols * u + pad * 2,
    bh = B.rows * u + pad * 2,
    top = u * 1.2,
    mx = u * 0.45;
  geo = {
    u,
    pad,
    bw,
    bh,
    top,
    mx,
    W: bw + mx * 2,
    H: top + bh + u * (B.pop ? 1.0 : 0.4),
  };
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  cv.style.width = geo.W + 'px';
  cv.style.height = geo.H + 'px';
  cv.width = Math.round(geo.W * dpr);
  cv.height = Math.round(geo.H * dpr);
}
window.addEventListener('resize', () => {
  if (started) {
    layout();
    buildLayer();
  }
});
const colX = (c) => geo.mx + geo.pad + (c + 0.5) * geo.u;
const rowY = (y) => geo.top + geo.pad + (B.rows - 1 - y + 0.5) * geo.u;
function rr(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}
function applyTheme() {
  const t = THEMES[S.theme];
  document.documentElement.style.setProperty('--bg1', t.bg[0]);
  document.documentElement.style.setProperty('--bg2', t.bg[1]);
}
function drawPlate(c, th, x, y, w, h, u) {
  const g = c.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, th.a);
  g.addColorStop(1, th.b);
  if (th.glow) {
    c.shadowColor = th.glow;
    c.shadowBlur = u * 0.5;
  }
  c.fillStyle = g;
  rr(c, x, y, w, h, u * 0.3);
  c.fill();
  c.shadowBlur = 0;
  if (th.wood) {
    c.save();
    rr(c, x, y, w, h, u * 0.3);
    c.clip();
    c.strokeStyle = 'rgba(60,30,10,0.22)';
    c.lineWidth = 2;
    for (let i = 0; i < h; i += u * 0.22) {
      c.beginPath();
      c.moveTo(x, y + i);
      c.bezierCurveTo(
        x + w * 0.3,
        y + i - 6,
        x + w * 0.6,
        y + i + 8,
        x + w,
        y + i
      );
      c.stroke();
    }
    c.restore();
  }
  c.lineWidth = th.glow ? 3 : 4;
  c.strokeStyle = th.rim;
  rr(c, x, y, w, h, u * 0.3);
  c.stroke();
}
function buildLayer() {
  if (!geo || !B) return;
  applyTheme();
  const th = THEMES[S.theme],
    { u, pad, bw, bh, top, mx } = geo;
  L = document.createElement('canvas');
  L.width = cv.width;
  L.height = cv.height;
  const c = L.getContext('2d');
  c.scale(dpr, dpr);
  // feet
  c.fillStyle = th.glass
    ? 'rgba(255,255,255,0.35)'
    : th.glow
    ? '#0c0722'
    : th.rim;
  rr(c, mx + u * 0.15, top + bh - 6, u * 0.55, u * 0.4 + 6, u * 0.1);
  c.fill();
  rr(c, mx + bw - u * 0.7, top + bh - 6, u * 0.55, u * 0.4 + 6, u * 0.1);
  c.fill();
  drawPlate(c, th, mx, top, bw, bh, u);
  c.globalCompositeOperation = 'destination-out';
  c.fillStyle = '#000';
  for (let col = 0; col < B.cols; col++)
    for (let r = 0; r < B.rows; r++) {
      c.beginPath();
      c.arc(colX(col), rowY(B.rows - 1 - r), u * 0.385, 0, TAU);
      c.fill();
    }
  c.globalCompositeOperation = 'source-over';
  for (let col = 0; col < B.cols; col++)
    for (let r = 0; r < B.rows; r++) {
      const x = colX(col),
        y = rowY(r);
      c.lineWidth = u * 0.06;
      c.strokeStyle = th.glass ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.35)';
      c.beginPath();
      c.arc(x, y, u * 0.4, 0, TAU);
      c.stroke();
      c.lineWidth = u * 0.03;
      c.strokeStyle = 'rgba(255,255,255,0.25)';
      c.beginPath();
      c.arc(x, y, u * 0.43, Math.PI * 0.15, Math.PI * 0.85);
      c.stroke();
    }
  const gl = c.createLinearGradient(0, top, 0, top + bh * 0.5);
  gl.addColorStop(0, 'rgba(255,255,255,0.16)');
  gl.addColorStop(1, 'rgba(255,255,255,0)');
  c.globalCompositeOperation = 'source-atop';
  c.fillStyle = gl;
  c.fillRect(mx, top, bw, bh * 0.5);
  c.globalCompositeOperation = 'source-over';
}
function stepTokens(dt) {
  const G = 38;
  for (const t of tokens) {
    if (t.settled) continue;
    t.vd += G * dt;
    t.y -= t.vd * dt;
    if (t.y <= t.r && t.vd > 0) {
      t.y = t.r;
      if (t.vd < 3.2) {
        t.vd = 0;
        t.settled = true;
        if (!t.hit) {
          t.hit = true;
          sfx.hit(0.5);
        }
      } else {
        sfx.hit(Math.min(1, t.vd / 14));
        t.vd = -t.vd * 0.3;
        t.hit = true;
      }
    }
  }
  for (const g of ghosts) {
    g.vy += 40 * dt;
    g.y -= g.vy * dt;
    g.rot += dt * 5;
    g.life -= dt * 1.2;
  }
  ghosts = ghosts.filter((g) => g.life > 0 && g.y > -4);
}
function draw() {
  if (!geo || !B) return;
  const { u, top, bh, mx, bw } = geo,
    th = THEMES[S.theme];
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, geo.W, geo.H);
  // inner backing
  ctx.fillStyle = th.glass ? 'rgba(0,0,0,0.25)' : 'rgba(0,0,0,0.5)';
  rr(ctx, mx + 6, top + 6, bw - 12, bh - 12, u * 0.25);
  ctx.fill();
  // ghost cursor
  const human = !busy && !over && !thinking && !isAI(turn);
  const colSel = hover >= 0 ? hover : kbCol;
  if (human && started) {
    const x = colX(colSel),
      bob = Math.sin(performance.now() / 220) * 3;
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(x - u / 2, top + geo.pad, u, bh - geo.pad * 2);
    drawToken(ctx, x, top * 0.55 + bob, u * 0.4, turn, 0.75);
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.beginPath();
    ctx.moveTo(x - 7, top - 13);
    ctx.lineTo(x + 7, top - 13);
    ctx.lineTo(x, top - 5);
    ctx.fill();
  }
  for (const g of ghosts) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, g.life);
    ctx.translate(colX(g.c), rowY(g.y));
    ctx.rotate(g.rot);
    drawToken(ctx, 0, 0, u * 0.4, g.p);
    ctx.restore();
  }
  for (const t of tokens) drawToken(ctx, colX(t.c), rowY(t.y), u * 0.4, t.p);
  if (L) ctx.drawImage(L, 0, 0, geo.W, geo.H);
  // hint
  if (hintCol >= 0 && hintT > 0) {
    const x = colX(hintCol),
      a = 0.4 + Math.sin(performance.now() / 120) * 0.25;
    ctx.fillStyle = `rgba(52,211,153,${a})`;
    ctx.fillRect(x - u / 2 + 3, top + geo.pad, u - 6, bh - geo.pad * 2);
    ctx.fillStyle = '#34d399';
    ctx.font = `700 ${u * 0.34}px Fredoka, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(hintPop ? 'POP ↓' : '💡 here', x, top - 6);
  }
  // pop buttons
  if (B.pop && human) {
    for (let c = 0; c < B.cols; c++)
      if (B.h[c] > 0 && B.get(c, 0) === turn) {
        const x = colX(c),
          y = top + bh + u * 0.55,
          hv = hover === c;
        ctx.fillStyle = hv ? '#fff' : 'rgba(255,255,255,0.8)';
        ctx.beginPath();
        ctx.arc(x, y, u * 0.3, 0, TAU);
        ctx.fill();
        ctx.fillStyle = '#1c1b29';
        ctx.font = `700 ${u * 0.36}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('⤓', x, y + 1);
        ctx.textBaseline = 'alphabetic';
      }
  }
  // win highlight
  if (winCells.length) {
    const pulse = 0.6 + Math.sin(winPulse * 6) * 0.4;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = `rgba(255,255,255,${0.5 + pulse * 0.4})`;
    ctx.lineWidth = u * 0.12;
    const cs = [...winCells].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    ctx.beginPath();
    cs.forEach(([c, r], i) => {
      const x = colX(c),
        y = rowY(r);
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    });
    ctx.stroke();
    winCells.forEach(([c, r]) => {
      ctx.shadowColor = '#fff';
      ctx.shadowBlur = 20 * pulse;
      ctx.lineWidth = u * 0.07;
      ctx.beginPath();
      ctx.arc(colX(c), rowY(r), u * (0.43 + pulse * 0.04), 0, TAU);
      ctx.stroke();
    });
    ctx.restore();
  }
}
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTick) / 1000, 0.05);
  lastTick = now;
  if (!started) return;
  stepTokens(dt);
  if (hintT > 0) hintT -= dt;
  if (over) winPulse += dt;
  if (busy && tokens.every((t) => t.settled) && afterSettle) {
    const f = afterSettle;
    afterSettle = null;
    f();
  }
  if (!busy && !over && !thinking && +S.timer) {
    timeLeft -= dt;
    const f = Math.max(0, timeLeft / +S.timer);
    $('tfill').style.transform = `scaleX(${f})`;
    $('tfill').style.background =
      f > 0.5 ? '#34d399' : f > 0.25 ? '#fbbf24' : '#ef4444';
    const sec = Math.ceil(timeLeft);
    if (sec !== lastSec) {
      lastSec = sec;
      if (sec <= 5 && sec > 0 && !isAI(turn)) sfx.tick();
    }
    if (timeLeft <= 0 && !isAI(turn)) {
      const open = B.legal(turn).filter((m) => m.t === 'd');
      if (open.length) {
        toast("⏰ Time's up! Random move.");
        doMove(open[Math.floor(Math.random() * open.length)]);
      }
    }
  } else if (+S.timer)
    $('tfill').style.transform =
      busy || over ? $('tfill').style.transform : 'scaleX(1)';
  draw();
}
requestAnimationFrame(frame);

// ---------- input ----------
function colAt(e) {
  const r = cv.getBoundingClientRect(),
    x = e.clientX - r.left,
    y = e.clientY - r.top;
  const c = Math.floor((x - geo.mx - geo.pad) / geo.u);
  return { c: c >= 0 && c < B.cols ? c : -1, below: y > geo.top + geo.bh };
}
cv.addEventListener('pointermove', (e) => {
  if (!geo || !B) return;
  hover = colAt(e).c;
});
cv.addEventListener('pointerleave', () => {
  hover = -1;
});
cv.addEventListener('pointerdown', (e) => {
  if (!geo || !B || !started || busy || over || thinking || isAI(turn)) return;
  audio();
  const { c, below } = colAt(e);
  if (c < 0) return;
  hover = e.pointerType === 'mouse' ? c : -1;
  kbCol = c;
  if (below) {
    if (B.pop && B.h[c] > 0 && B.get(c, 0) === turn) doMove({ t: 'p', c });
    return;
  }
  if (B.h[c] < B.rows) doMove({ t: 'd', c });
});
window.addEventListener('keydown', (e) => {
  if (!started || $('game').classList.contains('hidden')) {
    if (
      e.key === 'Enter' &&
      !$('menu').classList.contains('hidden') &&
      document.activeElement.tagName !== 'INPUT'
    ) {
      audio();
      showGame();
    }
    return;
  }
  const k = e.key.toLowerCase();
  if (!$('result').classList.contains('hidden')) {
    if (k === 'enter') nextRound();
    return;
  }
  if (k === 'arrowleft' || k === 'a' || k === 'q') {
    kbCol = (kbCol + B.cols - 1) % B.cols;
    hover = -1;
    e.preventDefault();
  } else if (k === 'arrowright' || k === 'd') {
    kbCol = (kbCol + 1) % B.cols;
    hover = -1;
    e.preventDefault();
  } else if (
    (k === 'enter' || k === ' ' || k === 'arrowdown' || k === 's') &&
    !busy &&
    !over &&
    !thinking &&
    !isAI(turn)
  ) {
    e.preventDefault();
    if (B.h[kbCol] < B.rows) doMove({ t: 'd', c: kbCol });
  } else if (
    k === 'p' &&
    B.pop &&
    !busy &&
    !over &&
    !thinking &&
    !isAI(turn) &&
    B.h[kbCol] > 0 &&
    B.get(kbCol, 0) === turn
  )
    doMove({ t: 'p', c: kbCol });
  else if (
    k >= '1' &&
    k <= '9' &&
    +k <= B.cols &&
    !busy &&
    !over &&
    !thinking &&
    !isAI(turn)
  ) {
    kbCol = +k - 1;
    if (B.h[kbCol] < B.rows) doMove({ t: 'd', c: kbCol });
  } else if (k === 'u' || (k === 'z' && (e.ctrlKey || e.metaKey))) undo();
  else if (k === 'h') hint();
  else if (k === 'm') toggleMute();
});

// ---------- confetti ----------
const cf = $('confetti'),
  cx = cf.getContext('2d');
let parts = [],
  cfRun = false;
function confetti(n) {
  cf.width = innerWidth;
  cf.height = innerHeight;
  const cols = [S.p1.color, S.p2.color, '#ffd23f', '#fff', '#22d3ee'];
  for (let i = 0; i < n; i++)
    parts.push({
      x: Math.random() * cf.width,
      y: -20 - Math.random() * cf.height * 0.5,
      vx: (Math.random() - 0.5) * 4,
      vy: 2 + Math.random() * 5,
      r: Math.random() * 6,
      vr: (Math.random() - 0.5) * 0.3,
      s: 6 + Math.random() * 8,
      c: cols[Math.floor(Math.random() * cols.length)],
    });
  if (!cfRun) {
    cfRun = true;
    requestAnimationFrame(cfLoop);
  }
}
function cfLoop() {
  cx.clearRect(0, 0, cf.width, cf.height);
  parts.forEach((p) => {
    p.x += p.vx;
    p.y += p.vy;
    p.r += p.vr;
    cx.save();
    cx.translate(p.x, p.y);
    cx.rotate(p.r);
    cx.fillStyle = p.c;
    cx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2);
    cx.restore();
  });
  parts = parts.filter((p) => p.y < cf.height + 20);
  if (parts.length) requestAnimationFrame(cfLoop);
  else {
    cfRun = false;
    cx.clearRect(0, 0, cf.width, cf.height);
  }
}

// ================= SETUP UI =================
function renderPlayerCards() {
  [1, 2].forEach((p) => {
    const s = p === 1 ? S.p1 : S.p2,
      card = $('card' + p);
    card.innerHTML = `<h2>${p === 1 ? '🔴' : '🟡'} Player ${p}${
      p === 2 && S.mode === 'ai'
        ? ' <small style="opacity:.6;font-family:Fredoka">(computer)</small>'
        : ''
    }</h2>
      <div class="p-head"><canvas width="112" height="112"></canvas><input type="text" maxlength="14" aria-label="Name" /></div>
      <div class="lbl">Token color</div><div class="swatches"></div>
      <div class="lbl">Token style</div><div class="chips st"></div>
      <div class="extra"></div>`;
    const inp = card.querySelector('input');
    inp.value = s.name;
    inp.placeholder = p === 2 && S.mode === 'ai' ? 'Computer' : 'Player ' + p;
    inp.addEventListener('input', () => {
      s.name = inp.value;
      persist();
    });
    const sw = card.querySelector('.swatches');
    COLORS.forEach((c) => {
      const b = document.createElement('button');
      b.style.setProperty('--c', c);
      b.className = s.color === c ? 'on' : '';
      b.setAttribute('aria-label', c);
      b.addEventListener('click', () => {
        s.color = c;
        persist();
        renderPlayerCards();
        drawPreview();
      });
      sw.appendChild(b);
    });
    const cl = document.createElement('label');
    cl.title = 'Any color';
    cl.className = !COLORS.includes(s.color) ? 'on' : '';
    cl.innerHTML = '<input type="color" />';
    cl.querySelector('input').value = s.color;
    cl.querySelector('input').addEventListener('input', (e) => {
      s.color = e.target.value;
      persist();
      drawPreview();
      card
        .querySelector('.p-head canvas')
        .getContext('2d')
        .clearRect(0, 0, 112, 112);
      tokenCanvas(card.querySelector('.p-head canvas'), p);
    });
    cl.querySelector('input').addEventListener('change', renderPlayerCards);
    sw.appendChild(cl);
    const st = card.querySelector('.st');
    STYLES.forEach(([k, n]) => {
      const b = document.createElement('button');
      b.textContent = n;
      b.className = s.style === k ? 'on' : '';
      b.addEventListener('click', () => {
        s.style = k;
        persist();
        renderPlayerCards();
        drawPreview();
      });
      st.appendChild(b);
    });
    const ex = card.querySelector('.extra');
    if (s.style === 'emoji') {
      ex.innerHTML = '<div class="emoji-grid"></div>';
      const g = ex.firstChild;
      EMOJIS.forEach((em) => {
        const b = document.createElement('button');
        b.textContent = em;
        b.className = s.emoji === em ? 'on' : '';
        b.addEventListener('click', () => {
          s.emoji = em;
          persist();
          renderPlayerCards();
          drawPreview();
        });
        g.appendChild(b);
      });
    } else if (s.style === 'photo') {
      ex.innerHTML = `<div class="photo-row"><label class="up-btn">📷 Upload a picture<input type="file" accept="image/*" hidden /></label>${
        s.img
          ? `<img class="thumb" src="${s.img}" alt="" /><button class="x">✕ remove</button>`
          : '<span style="opacity:.7;font-size:13px">Your face, a pet, a logo…</span>'
      }</div>`;
      ex.querySelector('input').addEventListener('change', (e) => {
        setPhoto(p, e.target.files[0]);
        e.target.value = '';
      });
      const x = ex.querySelector('.x');
      if (x)
        x.addEventListener('click', () => {
          s.img = null;
          refreshImgs();
          persist();
          renderPlayerCards();
          drawPreview();
        });
    }
    tokenCanvas(card.querySelector('.p-head canvas'), p);
  });
}
const pv = $('pv'),
  pc = pv.getContext('2d');
function drawPreview() {
  if (!$('menu') || $('menu').classList.contains('hidden')) return;
  applyTheme();
  const th = THEMES[S.theme],
    w = 520,
    h = 300,
    u = 64;
  pc.setTransform(1, 0, 0, 1, 0, 0);
  pc.clearRect(0, 0, w, h);
  const [cols, rows] = [6, 4],
    bw = cols * u + 24,
    bh = rows * u + 24,
    x0 = (w - bw) / 2,
    y0 = (h - bh) / 2;
  pc.fillStyle = 'rgba(0,0,0,0.5)';
  rr(pc, x0 + 6, y0 + 6, bw - 12, bh - 12, 14);
  pc.fill();
  const demo = [
    [1, 0, 1],
    [2, 0, 2],
    [2, 1, 1],
    [3, 0, 1],
    [3, 1, 2],
    [3, 2, 1],
    [4, 0, 2],
    [4, 1, 2],
    [1, 1, 2],
    [0, 0, 2],
    [5, 0, 1],
  ];
  demo.forEach(([c, r, p]) =>
    drawToken(
      pc,
      x0 + 12 + (c + 0.5) * u,
      y0 + 12 + (rows - 1 - r + 0.5) * u,
      u * 0.4,
      p
    )
  );
  const lay = document.createElement('canvas');
  lay.width = w;
  lay.height = h;
  const lc = lay.getContext('2d');
  drawPlate(lc, th, x0, y0, bw, bh, u);
  lc.globalCompositeOperation = 'destination-out';
  for (let c = 0; c < cols; c++)
    for (let r = 0; r < rows; r++) {
      lc.beginPath();
      lc.arc(
        x0 + 12 + (c + 0.5) * u,
        y0 + 12 + (r + 0.5) * u,
        u * 0.385,
        0,
        TAU
      );
      lc.fill();
    }
  lc.globalCompositeOperation = 'source-over';
  for (let c = 0; c < cols; c++)
    for (let r = 0; r < rows; r++) {
      lc.lineWidth = 4;
      lc.strokeStyle = th.glass ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.35)';
      lc.beginPath();
      lc.arc(x0 + 12 + (c + 0.5) * u, y0 + 12 + (r + 0.5) * u, u * 0.4, 0, TAU);
      lc.stroke();
    }
  pc.drawImage(lay, 0, 0);
}
function syncChips() {
  document.querySelectorAll('.chips[data-key]').forEach((ch) => {
    const k = ch.dataset.key;
    ch.querySelectorAll('button').forEach((b) =>
      b.classList.toggle('on', b.dataset.v === String(S[k]))
    );
  });
  $('aiOpts').classList.toggle('hidden', S.mode !== 'ai');
  $('hints').checked = S.hints;
  $('winsMenu').textContent = wins;
  $('muteBtn').textContent = S.muted ? '🔇' : '🔊';
}
function renderAll() {
  syncChips();
  renderPlayerCards();
  drawPreview();
}
function initSetup() {
  const tc = $('themeChips');
  Object.entries(THEMES).forEach(([k, t]) => {
    const b = document.createElement('button');
    b.dataset.v = k;
    b.innerHTML = `<span class="dot" style="background:${t.dot}"></span>${t.n}`;
    tc.appendChild(b);
  });
  document.querySelectorAll('.chips[data-key]').forEach((ch) =>
    ch.querySelectorAll('button').forEach((b) =>
      b.addEventListener('click', () => {
        const k = ch.dataset.key,
          num = ['level', 'n', 'timer', 'series'].includes(k);
        S[k] = num ? +b.dataset.v : b.dataset.v;
        if (k === 'n') {
          const [c, r] = S.size.split('x').map(Number);
          if (S.n > Math.max(c, r)) S.n = 4;
        }
        persist();
        sfx.click();
        syncChips();
        if (k === 'mode') renderPlayerCards();
        if (k === 'theme') drawPreview();
      })
    )
  );
  $('hints').addEventListener('change', (e) => {
    S.hints = e.target.checked;
    persist();
  });
  $('resetBtn').addEventListener('click', () => {
    S = clone(DEFAULTS);
    S.muted = false;
    refreshImgs();
    persist();
    renderAll();
  });
  $('playBtn').addEventListener('click', () => {
    audio();
    showGame();
  });
}
function toggleMute() {
  S.muted = !S.muted;
  persist();
  syncChips();
  updateHudMute();
}
function updateHudMute() {
  $('muteBtn2').textContent = S.muted ? '🔇' : '🔊';
}
function nextRound() {
  sfx.click();
  if (seriesOver) return newRound(false);
  newRound(true);
}
['muteBtn', 'muteBtn2'].forEach((id) =>
  $(id).addEventListener('click', toggleMute)
);
$('menuBtn').addEventListener('click', showMenu);
$('rMenuBtn').addEventListener('click', showMenu);
$('nextBtn').addEventListener('click', nextRound);
$('undoBtn').addEventListener('click', undo);
$('hintBtn').addEventListener('click', hint);
$('restartBtn').addEventListener('click', () => {
  sfx.click();
  newRound(false);
});

refreshImgs();
initSetup();
renderAll();
applyTheme();
if (location.search.includes('debug')) {
  window.__d4 = {
    get B() {
      return B;
    },
    S,
    get turn() {
      return turn;
    },
    get over() {
      return over;
    },
    get busy() {
      return busy;
    },
    get scores() {
      return scores;
    },
    doMove,
    aiChoose,
    Board,
    showGame,
    newRound,
    tokens: () => tokens,
    set(o) {
      Object.assign(S, o);
    },
    undo,
  };
}

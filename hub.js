// ================= OVERDRIVE hub =================
import { ACCOUNTS } from './accounts.js';
function readBest(key) {
  try { const v = parseInt(localStorage.getItem(key) || '0', 10); return Number.isFinite(v) ? v : 0; } catch (e) { return 0; }
}
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

// ---------- records shown as a chip on each tile ----------
const fmtN = (v) => v.toLocaleString('en-US');
const abbr = (n) => { if (n < 1000) return String(Math.floor(n)); const s = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi'], e = Math.min(s.length - 1, Math.floor(Math.log10(n) / 3)); return (n / 10 ** (e * 3)).toFixed(1) + s[e]; };
const BESTS = [
  ['bestNeon', 'neondrift-best', fmtN], ['bestCosmo', 'cosmohop-best', (v) => v + ' m'], ['bestPrism', 'prismblocks-best', fmtN],
  ['bestSlice', 'slicerush-best', fmtN], ['bestWall', 'dhtw-best', (v) => fmtN(v) + ' m'], ['bestBounce', 'bounce-best', fmtN],
  ['bestHyper', 'hyperlane-best', fmtN], ['bestDash', 'dash-best', fmtN], ['bestDial', 'dialin-best', fmtN],
  ['bestFalafel', 'falafel-best', abbr], ['bestWorld', 'countries-best', (v) => v + ' / 196'], ['bestRoll', 'rollrush-best', fmtN],
  ['bestBull', 'bullseye-best', fmtN], ['bestSnake', 'snakestudio-best', fmtN],
  ['bestD4', 'dropfour-wins', (v) => v + ' wins'], ['bestRubik', 'rubik-best', (v) => Math.floor(v / 60000) + ':' + ((v / 1000) % 60).toFixed(1).padStart(4, '0')],
  ['bestBuddy', 'buddy-best', fmtN],
  ['bestPot', 'potpeak-best', (v) => Math.round(v) + ' m'],
];
BESTS.forEach(([id, key, f]) => { const b = document.getElementById(id); if (!b) return; const v = readBest(key); if (v > 0) { b.textContent = f(v); b.closest('.best').hidden = false; } });

// ---------- Prism Blocks thumbnail ----------
(function () {
  const pattern = ['.##..#', '.#.###', '###.#.', '..####', '##..##'], hues = [190, 330, 45, 140, 265, 18, 215], mini = document.getElementById('mini');
  if (!mini) return;
  pattern.forEach((row, r) => [...row].forEach((ch, c) => { const i = document.createElement('i'); if (ch === '.') i.className = 'e'; i.style.setProperty('--h', hues[(r * 2 + c * 3) % hues.length]); i.style.setProperty('--d', (r + c) * 0.14 + 's'); mini.appendChild(i); }));
})();

// ---------- page-transition colors ----------
const WIPE = {
  neon: 'linear-gradient(180deg,#0a0620,#1a0f4a)', cosmo: 'linear-gradient(180deg,#3a1c71,#d65a9a 60%,#ff7e5f)', prism: 'linear-gradient(180deg,#1a0f4d,#0b0624)',
  slice: 'linear-gradient(180deg,#2a0f45,#7a2a4a)', wall: 'linear-gradient(180deg,#3a9d4c,#2a7a3a)', bounce: 'linear-gradient(180deg,#12153a,#070815)',
  hyper: 'linear-gradient(180deg,#1a0a3a,#ff2fb9)', dash: 'linear-gradient(180deg,#ff8f4d,#f2c14e)', dial: 'linear-gradient(180deg,#7c5cff,#22d3ee)',
  falafel: 'linear-gradient(180deg,#0d3b8c,#ffc83a)', world: 'linear-gradient(180deg,#17408a,#34d399)', roll: 'linear-gradient(180deg,#2a0a55,#22d3ee)',
  bullseye: 'linear-gradient(180deg,#d83a3a,#5b3018)', snake: 'linear-gradient(180deg,#0b1020,#4ade80)',
  drop4: 'linear-gradient(180deg,#1d4ed8,#facc15)', rubik: 'linear-gradient(180deg,#16a34a,#d62839)', buddy: 'linear-gradient(180deg,#c9784f,#7c3aed)', pot: 'linear-gradient(180deg,#38bdf8,#475569)',
};

// ---------- filtering / search ----------
const grid = $('#grid'), recentGrid = $('#recentGrid');
const tiles = $$('.tile', grid);
const NAMES = { all: 'All games', action: 'Action games', arcade: 'Arcade games', puzzle: 'Puzzle & Brain games', casual: 'Casual & Fun games' };
const state = { f: 'all', q: '' };
tiles.forEach((t, i) => { t.style.animationDelay = i * 35 + 'ms'; });
['all', 'action', 'arcade', 'puzzle', 'casual'].forEach((f) => {
  const n = f === 'all' ? tiles.length : tiles.filter((t) => t.dataset.cat === f).length;
  const e = document.getElementById('n-' + f); if (e) e.textContent = n;
});
function apply() {
  const q = state.q.trim().toLowerCase(); let shown = 0;
  tiles.forEach((t) => {
    const okF = state.f === 'all' || t.dataset.cat === state.f;
    const okQ = !q || t.dataset.name.includes(q) || $('small', t).textContent.toLowerCase().includes(q);
    const ok = okF && okQ; t.classList.toggle('hide', !ok); if (ok) shown++;
  });
  const flat = state.f !== 'all' || !!q;
  grid.classList.toggle('flat', flat);
  $('#gridTitle').textContent = q ? `Results for “${state.q.trim()}”` : NAMES[state.f];
  $('#count').textContent = `${shown} game${shown === 1 ? '' : 's'}`;
  $('#empty').hidden = shown > 0;
  $('#recent').hidden = flat || !recentGrid.children.length;
  $$('.nv').forEach((b) => b.classList.toggle('on', b.dataset.f === state.f));
  layout();
}
$('#side').addEventListener('click', (e) => { const b = e.target.closest('.nv'); if (!b) return; state.f = b.dataset.f; apply(); if (matchMedia('(max-width:900px)').matches) b.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' }); });
const qEl = $('#q');
qEl.addEventListener('input', () => { state.q = qEl.value; apply(); });
qEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { const t = tiles.find((x) => !x.classList.contains('hide')); if (t) t.click(); }
  if (e.key === 'Escape') { qEl.value = ''; state.q = ''; apply(); qEl.blur(); }
});
addEventListener('keydown', (e) => { if (e.key === '/' && document.activeElement !== qEl) { e.preventDefault(); qEl.focus(); qEl.select(); } });

// ---------- tile sizing (rows follow column width, art thumbnails scale to fit) ----------
function sizeGrid(g, flat, fit) {
  const W = g.clientWidth; if (!W) return;
  const gap = parseFloat(getComputedStyle(g).columnGap) || 14, min = innerWidth <= 480 ? 150 : innerWidth <= 900 ? 165 : 190;
  let n = Math.max(2, Math.floor((W + gap) / (min + gap)));
  if (fit) { const m = $$('.tile:not(.hide)', g).length || 1; n = Math.min(n, Math.max(W < 500 ? (m <= 2 ? 1 : 2) : 2, Math.ceil(Math.sqrt(m * 1.6)))); }
  const tw = (W - gap * (n - 1)) / n, rh = (tw * 2) / 3;
  g.style.gridTemplateColumns = `repeat(${n}, minmax(0, 1fr))`; g.style.gridAutoRows = rh + 'px';
  let bi = 0;
  $$('.tile', g).forEach((t) => {
    const isBig = t.classList.contains('big') && !flat && (n >= 4 || (!t.classList.contains('hide') && bi++ === 0));
    const big = isBig, w = big ? tw * 2 + gap : tw, h = big ? rh * 2 + gap : rh;
    t.style.setProperty('--k', Math.max(w / 360, h / 240).toFixed(3));
    t.style.gridColumn = big ? 'span 2' : 'auto'; t.style.gridRow = big ? 'span 2' : 'auto';
  });
}
function layout() { sizeGrid(grid, grid.classList.contains('flat'), state.f !== 'all'); sizeGrid(recentGrid, true); }
new ResizeObserver(layout).observe(grid);
addEventListener('resize', layout);

// ---------- recently played ----------
const RK = 'overdrive-recent';
function recent() { try { const a = JSON.parse(localStorage.getItem(RK)); return Array.isArray(a) ? a : []; } catch (e) { return []; } }
function pushRecent(key) { try { localStorage.setItem(RK, JSON.stringify([key, ...recent().filter((k) => k !== key)].slice(0, 6))); } catch (e) { /* ignore */ } }
function buildRecent() {
  recentGrid.innerHTML = '';
  recent().forEach((k) => {
    const src = tiles.find((t) => t.dataset.key === k); if (!src) return;
    const c = src.cloneNode(true); c.classList.remove('big', 'hide'); c.removeAttribute('style'); c.style.animation = 'none';
    $$('[id]', c).forEach((n) => n.removeAttribute('id')); recentGrid.appendChild(c);
  });
}
buildRecent();

// ---------- open a game with the circular wipe ----------
function openTile(t, x, y) {
  const key = t.dataset.key; pushRecent(key);
  const r = t.getBoundingClientRect(); if (!x && !y) { x = r.left + r.width / 2; y = r.top + r.height / 2; }
  const w = document.createElement('div'); w.className = 'wipe'; w.style.setProperty('--x', x + 'px'); w.style.setProperty('--y', y + 'px'); w.style.setProperty('--wipe', WIPE[key] || '#120a33');
  document.body.appendChild(w); setTimeout(() => { location.href = t.href; }, 520);
}
document.addEventListener('click', (e) => {
  const t = e.target.closest('.tile'); if (!t || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
  e.preventDefault(); openTile(t, e.clientX, e.clientY);
});
$('#rand').addEventListener('click', (e) => {
  const vis = tiles.filter((t) => !t.classList.contains('hide')), pool = vis.length ? vis : tiles, t = pool[(Math.random() * pool.length) | 0];
  openTile(t, e.clientX, e.clientY);
});
addEventListener('pageshow', () => { $$('.wipe').forEach((n) => n.remove()); buildRecent(); apply(); });

apply();


// ================= account: custom thumbnails are a member perk =================
// Guests see the built-in tile art. Logged-in members see <game-folder>/thumbnail.(png|jpg|jpeg|webp|gif).
const THUMB_LOADERS = import.meta.glob('./*/thumbnail.{png,jpg,jpeg,webp,gif,PNG,JPG,JPEG,WEBP}', { query: '?url', import: 'default' });
const UK = 'overdrive-user';
const sha256 = async (s) => {
  if (!(globalThis.crypto && crypto.subtle)) throw new Error('nocrypto');
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
};
const credHash = (u, p) => sha256('overdrive|' + u.trim().toLowerCase() + '|' + p);
let user = null;
try { const u = localStorage.getItem(UK); if (u && ACCOUNTS[u]) user = u; } catch (e) { /* ignore */ }

async function applyThumbs() {
  await Promise.all(tiles.map(async (t) => {
    const art = $('.art', t); if (!art) return;
    if (t._orig === undefined) t._orig = art.innerHTML;
    const dir = (t.getAttribute('href') || '').replace(/\/$/, '');
    const key = Object.keys(THUMB_LOADERS).find((p) => p.startsWith('./' + dir + '/'));
    if (user && key) {
      let url; try { url = await THUMB_LOADERS[key](); } catch (e) { return; }
      art.innerHTML = '';
      const img = document.createElement('img');
      img.className = 'thumb'; img.src = url; img.alt = ''; img.decoding = 'async'; img.draggable = false;
      art.appendChild(img); art.classList.add('has-thumb');
    } else {
      art.innerHTML = t._orig; art.classList.remove('has-thumb');
    }
  }));
  buildRecent();
}

// ---- top bar button + login dialog ----
const acct = document.createElement('button');
acct.className = 'acct'; acct.id = 'acct'; $('.topbar').insertBefore(acct, $('#rand'));
function paintAcct() {
  acct.innerHTML = user ? '<span class="av">' + user[0].toUpperCase() + '</span><span class="nm"></span>' : '<span>👤</span><span class="nm">Log in</span>';
  if (user) $('.nm', acct).textContent = user;
  acct.title = user ? 'Log out' : 'Log in to unlock custom thumbnails';
}
paintAcct();

const dlg = document.createElement('div');
dlg.className = 'login'; dlg.hidden = true;
dlg.innerHTML = '<form class="lbox" autocomplete="on"><button type="button" class="lx" aria-label="Close">✕</button><h2>Member login</h2>' +
  '<p>Play everything for free. Logging in unlocks the custom game thumbnails.</p>' +
  '<label>Username<input name="username" autocomplete="username" required /></label>' +
  '<label>Password<input name="password" type="password" autocomplete="current-password" required /></label>' +
  '<div class="lerr" role="alert"></div><button class="lgo" type="submit">Log in</button></form>';
document.body.appendChild(dlg);
const lform = $('form', dlg), lerr = $('.lerr', dlg);
const openLogin = () => { lerr.textContent = ''; dlg.hidden = false; setTimeout(() => lform.username.focus(), 30); };
const closeLogin = () => { dlg.hidden = true; lform.reset(); };
$('.lx', dlg).addEventListener('click', closeLogin);
dlg.addEventListener('mousedown', (e) => { if (e.target === dlg) closeLogin(); });
addEventListener('keydown', (e) => { if (e.key === 'Escape' && !dlg.hidden) closeLogin(); });
acct.addEventListener('click', () => {
  if (!user) return openLogin();
  user = null; try { localStorage.removeItem(UK); } catch (e) { /* ignore */ }
  paintAcct(); applyThumbs();
});
lform.addEventListener('submit', async (e) => {
  e.preventDefault(); lerr.textContent = '';
  const u = lform.username.value.trim().toLowerCase(), p = lform.password.value;
  try {
    const hsh = await credHash(u, p);
    if (ACCOUNTS[u] && ACCOUNTS[u] === hsh) {
      user = u; try { localStorage.setItem(UK, u); } catch (er) { /* ignore */ }
      closeLogin(); paintAcct(); applyThumbs();
    } else lerr.textContent = 'Wrong username or password.';
  } catch (er) { lerr.textContent = 'Login needs a secure (https) connection.'; }
});
applyThumbs();
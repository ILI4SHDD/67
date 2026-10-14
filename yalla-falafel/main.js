// ============================================================
//  YALLA FALAFEL — a cookie-clicker-style idle game with an Israeli food & culture flavor
// ============================================================
const $ = (id) => document.getElementById(id);
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[Math.floor(Math.random() * a.length)];

// ---------- Data ----------
const BUILD = [
  { name: 'Falafel Cart', icon: '🛺', base: 15, cps: 0.1, desc: 'A little cart rolling through the streets, honking happily.' },
  { name: "Bubbe's Kitchen", icon: '👵', base: 100, cps: 1, desc: 'Grandma makes falafel while asking if you ate enough.' },
  { name: 'Shuk Stall', icon: '🧺', base: 1100, cps: 8, desc: '"Yalla, yalla, fresh falafel!" shouts a very enthusiastic vendor.' },
  { name: 'Pita Bakery', icon: '🥖', base: 12000, cps: 47, desc: 'Warm pita and challah, baked before sunrise.' },
  { name: 'Kibbutz Orange Grove', icon: '🍊', base: 130000, cps: 260, desc: 'Sunshine, fresh juice and a lot of chickpea fields.' },
  { name: 'Sufganiyot Factory', icon: '🍩', base: 1.4e6, cps: 1400, desc: 'Jelly donuts, but with a falafel center. Don\'t ask.' },
  { name: 'Tel Aviv Beach Café', icon: '🏖️', base: 2e7, cps: 7800, desc: 'Sunset, matkot and a falafel at 2 a.m.' },
  { name: 'Jerusalem Street Festival', icon: '🎶', base: 3.3e8, cps: 44000, desc: 'Music, stone alleys and one very long falafel line.' },
  { name: 'Falafel Space Program', icon: '🚀', base: 5.1e9, cps: 260000, desc: 'Next stop: the Moon. Tahini included.' },
  { name: 'Food-Tech Startup', icon: '🧪', base: 7.5e10, cps: 1.6e6, desc: 'Disrupting chickpeas with AI. Pitch deck included.' },
  { name: 'Spice Route Portal', icon: '🌀', base: 1e12, cps: 1e7, desc: 'Pulls falafel from every era of history.' },
];
const TIERS = [
  { n: 1, m: 10, name: 'Extra Tahini', icon: '🥣' }, { n: 5, m: 50, name: "Fresh Za'atar", icon: '🌿' }, { n: 25, m: 500, name: "Grandma's Secret", icon: '📜' },
  { n: 50, m: 5000, name: 'Sababa Edition', icon: '😎' }, { n: 100, m: 50000, name: 'Legendary Recipe', icon: '🏆' },
];
const UPS = [];
BUILD.forEach((b, i) => TIERS.forEach((t, k) => UPS.push({ id: `b${i}t${k}`, kind: 'b', b: i, name: `${t.name} · ${b.name}`, icon: t.icon, n: t.n, cost: b.base * t.m, desc: `${b.name} makes twice as much.` })));
[['Tahini Drizzle', '🥣', 100], ['Pickled Turnips', '🥒', 500], ['Amba Splash', '🥭', 1e4], ['Sumac Sprinkle', '🍷', 1e5], ['Fresh-Out-Of-The-Oven Pita', '🫓', 5e6], ['Shatta Kick', '🌶️', 5e8]]
  .forEach(([name, icon, cost], i) => UPS.push({ id: `c${i}`, kind: 'c', name, icon, cost, desc: 'Clicking is twice as productive.' }));
[['Yalla Hands', 5e4], ['Double Yalla', 5e6], ['Triple Yalla', 5e8]].forEach(([name, cost], i) => UPS.push({ id: `f${i}`, kind: 'f', name, icon: '🤲', cost, desc: 'Each click also gives +1% of your falafels per second.' }));
[['Pickle Barrel', '🥒', 5e5], ['Hummus Bar', '🫘', 5e7], ['Shabbat Table', '🕯️', 5e9], ['Free Refills', '♾️', 5e11]]
  .forEach(([name, icon, cost], i) => UPS.push({ id: `g${i}`, kind: 'g', name, icon, cost, desc: 'All falafel production +10%.' }));

const ACH = [];
['First Bite', 'Snack Time', 'Lunch Rush', 'Neighborhood Favorite', 'City Famous', 'Chickpea Million', 'Hummus Mountain', 'National Treasure', 'Falafel Galaxy', 'Tahini Ocean', 'Beyond Sababa', 'Infinite Chickpeas']
  .forEach((name, i) => { const v = [1, 100, 1e3, 1e4, 1e5, 1e6, 1e7, 1e8, 1e9, 1e10, 1e11, 1e12][i]; ACH.push({ id: `t${i}`, name, icon: '🧆', desc: `Bake ${fmt(v)} falafels in total.`, test: (S) => S.total >= v }); });
['Poke', 'Hands On', 'Busy Fingers', 'Pita Pro', 'Yalla Yalla Yalla'].forEach((name, i) => { const v = [1, 100, 1e3, 1e4, 1e5][i]; ACH.push({ id: `k${i}`, name, icon: '👆', desc: `Click ${fmt(v)} times.`, test: (S) => S.clicks >= v }); });
BUILD.forEach((b, i) => [[1, 'Open!'], [10, 'Booming'], [25, 'Famous'], [50, 'Legend']].forEach(([n, w]) => ACH.push({ id: `o${i}_${n}`, name: `${b.name}: ${w}`, icon: b.icon, desc: `Own ${n} × ${b.name}.`, test: (S) => S.owned[i] >= n })));
['Golden Touch', 'Lucky Seven', 'Challah Back'].forEach((name, i) => { const v = [1, 7, 27][i]; ACH.push({ id: `g${i}`, name, icon: '🥖', desc: `Click ${v} golden challah${v > 1 ? 's' : ''}.`, test: (S) => S.golden >= v }); });

const NEWS = [
  [() => true, 'Local grandma insists you look too skinny. Eat something.'],
  [() => true, 'Breaking: the hummus debate continues. Nobody wins, everybody eats.'],
  [() => true, 'Sababa levels reach an all-time high.'],
  [() => true, 'Study finds: tahini goes with everything, including more tahini.'],
  [() => true, 'A cat in the shuk steals a falafel. The shuk approves.'],
  [() => true, 'Sufganiyot fans divided once again: jelly or dulce de leche?'],
  [() => true, 'It\'s Friday: the whole neighborhood smells like fresh challah.'],
  [() => true, 'Tourist asks "is it spicy?" Vendor replies: "A little." It is not a little.'],
  [() => true, 'Customer review: "Yalla, take my order, I\'m starving!" ★★★★★'],
  [(S) => S.owned[0] > 0, 'Your cart honks twice. Somewhere, a pita hears it and smiles.'],
  [(S) => S.owned[1] > 0, 'Grandma\'s secret ingredient is revealed: more garlic.'],
  [(S) => S.owned[2] > 0, 'The shuk is loud, colorful and smells amazing. Typical Tuesday.'],
  [(S) => S.owned[4] > 0, 'Kibbutz volunteers report: the chickpeas are doing great.'],
  [(S) => S.owned[6] > 0, 'Tel Aviv beach: a falafel at 2 a.m. solves every problem.'],
  [(S) => S.owned[7] > 0, 'Jerusalem festival: the falafel line is longer than the music set.'],
  [(S) => S.owned[8] > 0, 'A falafel orbits the Earth. Mission control: "Todah!"'],
  [(S) => S.owned[9] > 0, 'Startup raises a huge round to put hummus on the blockchain.'],
  [(S) => S.total > 1e6, 'Experts agree: chickpea supply is "surprisingly fine".'],
  [(S) => S.total > 1e9, 'Scientists confirm the universe is 13.8 billion years old and 4% tahini.'],
];

// ---------- State ----------
const fresh = () => ({ baked: 0, total: 0, clicks: 0, golden: 0, owned: BUILD.map(() => 0), ups: [], ach: [], name: "Bubbe's Falafel Shop", played: 0, last: Date.now() });
let S = fresh(), buyN = 1, buffs = [], muted = false;
try { const j = JSON.parse(localStorage.getItem('yalla-save') || 'null'); if (j) S = Object.assign(fresh(), j); muted = localStorage.getItem('yalla-muted') === '1'; } catch (e) {}
S.owned = BUILD.map((_, i) => S.owned[i] || 0);

function fmt(n) {
  if (!isFinite(n)) return '∞'; if (n < 1000) return n < 10 && n % 1 ? n.toFixed(1) : Math.floor(n).toString();
  const s = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No'], e = Math.min(s.length - 1, Math.floor(Math.log10(n) / 3)), v = n / 10 ** (e * 3);
  return (v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(2)) + s[e];
}
const cost = (i, n = buyN) => BUILD[i].base * 1.15 ** S.owned[i] * ((1.15 ** n - 1) / 0.15);
const has = (id) => S.ups.includes(id);
const buffMult = (kind) => buffs.reduce((m, b) => (b.kind === kind ? m * b.mult : m), 1);
function baseCps() {
  let t = 0; BUILD.forEach((b, i) => { let m = 1; TIERS.forEach((_, k) => { if (has(`b${i}t${k}`)) m *= 2; }); t += S.owned[i] * b.cps * m; });
  const g = 1 + 0.1 * UPS.filter((u) => u.kind === 'g' && has(u.id)).length; return t * g;
}
const cps = () => baseCps() * buffMult('cps');
function clickVal() {
  let v = 1; UPS.forEach((u) => { if (u.kind === 'c' && has(u.id)) v *= 2; });
  const pct = 0.01 * UPS.filter((u) => u.kind === 'f' && has(u.id)).length; return (v + pct * baseCps()) * buffMult('click');
}

// ---------- Audio ----------
let ac = null;
function beep(f, d = 0.08, delay = 0, v = 0.05, type = 'triangle') {
  if (muted) return; if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; } } if (ac.state === 'suspended') ac.resume();
  const t = ac.currentTime + delay, o = ac.createOscillator(), g = ac.createGain(); o.type = type; o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * 1.5, t + d);
  g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d); o.connect(g).connect(ac.destination); o.start(t); o.stop(t + d);
}
const sfx = { click: () => beep(rand(380, 520), 0.07, 0, 0.05), buy: () => { beep(520, 0.08); beep(780, 0.12, 0.07); }, gold: () => [523, 659, 784, 1047].forEach((f, i) => beep(f, 0.18, i * 0.08, 0.06)), ach: () => [660, 880, 1100].forEach((f, i) => beep(f, 0.15, i * 0.07)) };

// ---------- UI helpers ----------
function toast(t) { const d = document.createElement('div'); d.className = 'toast'; d.textContent = t; $('toasts').appendChild(d); setTimeout(() => d.remove(), 4000); while ($('toasts').children.length > 4) $('toasts').firstChild.remove(); }
function floatText(x, y, t) { const d = document.createElement('div'); d.className = 'float'; d.textContent = t; d.style.left = x - 20 + 'px'; d.style.top = y - 20 + 'px'; document.body.appendChild(d); setTimeout(() => d.remove(), 1000); }
const tip = $('tip');
function showTip(e, html) { tip.innerHTML = html; tip.classList.remove('hidden'); const w = tip.offsetWidth, h = tip.offsetHeight; tip.style.left = Math.max(8, Math.min(innerWidth - w - 8, e.clientX - w - 14)) + 'px'; tip.style.top = Math.max(8, Math.min(innerHeight - h - 8, e.clientY - 10)) + 'px'; }
const hideTip = () => tip.classList.add('hidden');

// ---------- Core actions ----------
function gain(n) { S.baked += n; S.total += n; }
$('big').addEventListener('pointerdown', (e) => {
  const v = clickVal(); gain(v); S.clicks++; sfx.click();
  $('big').classList.add('press'); setTimeout(() => $('big').classList.remove('press'), 80);
  floatText(e.clientX, e.clientY, '+' + fmt(v));
  if (S.clicks % 3 === 0) spawnRain(1, e.clientX);
});
$('big').addEventListener('keydown', (e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); const r = $('big').getBoundingClientRect(); gain(clickVal()); S.clicks++; sfx.click(); floatText(r.left + r.width / 2, r.top + r.height / 2, '+' + fmt(clickVal())); } });

function buyBuilding(i) { const c = cost(i); if (S.baked < c) return; S.baked -= c; S.owned[i] += buyN; sfx.buy(); save(); renderStore(); renderUps(); }
function buyUp(id) { const u = UPS.find((x) => x.id === id); if (!u || has(id) || S.baked < u.cost) return; S.baked -= u.cost; S.ups.push(id); sfx.buy(); hideTip(); renderUps(); renderStore(); }

// ---------- Rendering ----------
function renderStore() {
  const box = $('buildings'); box.innerHTML = ''; let shownLocked = false;
  BUILD.forEach((b, i) => {
    const vis = S.owned[i] > 0 || S.total >= b.base * 0.3; if (!vis && shownLocked) return; const locked = !vis; if (locked) shownLocked = true;
    const d = document.createElement('div'); d.className = 'bld' + (locked ? ' locked' : ''); d.dataset.i = i;
    d.innerHTML = `<div class="ic">${b.icon}</div><div><div class="nm">${locked ? '???' : b.name}</div><div class="co">${locked ? '' : '🧆 ' + fmt(cost(i))}</div></div><div class="n">${S.owned[i] || ''}</div>`;
    if (!locked) {
      d.onclick = () => buyBuilding(i);
      d.onmousemove = (e) => { let m = 1; TIERS.forEach((_, k) => { if (has(`b${i}t${k}`)) m *= 2; }); const each = b.cps * m * (1 + 0.1 * UPS.filter((u) => u.kind === 'g' && has(u.id)).length);
        showTip(e, `<b>${b.name}</b><br>${b.desc}<em>Each makes ${fmt(each)} falafels/sec${S.owned[i] ? ` · all ${S.owned[i]} make ${fmt(each * S.owned[i])}/sec` : ''}</em>`); };
      d.onmouseleave = hideTip;
    }
    box.appendChild(d);
  });
  refreshAfford();
}
function renderUps() {
  const box = $('upgrades'); box.innerHTML = '';
  const avail = UPS.filter((u) => !has(u.id) && (u.kind === 'b' ? S.owned[u.b] >= u.n : S.total >= u.cost * 0.4)).sort((a, b) => a.cost - b.cost);
  for (const u of avail.slice(0, 14)) {
    const d = document.createElement('div'); d.className = 'up'; d.textContent = u.icon; d.dataset.id = u.id; d.onclick = () => buyUp(u.id);
    d.onmousemove = (e) => showTip(e, `<b>${u.name}</b> — 🧆 ${fmt(u.cost)}<br>${u.desc}`); d.onmouseleave = hideTip; box.appendChild(d);
  }
  refreshAfford();
}
function refreshAfford() {
  document.querySelectorAll('.bld:not(.locked)').forEach((d) => { const i = +d.dataset.i, c = cost(i); d.classList.toggle('cant', S.baked < c); const co = d.querySelector('.co'); co.textContent = '🧆 ' + fmt(c); co.classList.toggle('ok', S.baked >= c); });
  document.querySelectorAll('.up').forEach((d) => d.classList.toggle('cant', S.baked < UPS.find((u) => u.id === d.dataset.id).cost));
}
function renderBuffs() {
  const now = Date.now(); buffs = buffs.filter((b) => b.until > now);
  $('buffs').innerHTML = buffs.map((b) => `<span class="buff">${b.name} ${Math.ceil((b.until - now) / 1000)}s</span>`).join('');
}
let lastRender = 0;
function updateCounters() {
  $('count').textContent = fmt(Math.floor(S.baked)); $('countLbl').textContent = Math.floor(S.baked) === 1 ? 'falafel' : 'falafels'; $('cps').textContent = fmt(cps());
  document.title = fmt(Math.floor(S.baked)) + ' falafels · YALLA FALAFEL';
}

// ---------- Achievements ----------
function checkAch() {
  for (const a of ACH) if (!S.ach.includes(a.id) && a.test(S)) { S.ach.push(a.id); toast(`${a.icon} ${a.name}`); sfx.ach(); }
}

// ---------- Golden challah ----------
let goldenTimer = rand(45, 90), goldenLife = 0;
function spawnGolden() {
  const g = $('golden'); g.style.left = rand(8, 85) + 'vw'; g.style.top = rand(15, 80) + 'vh'; g.classList.remove('hidden'); goldenLife = 13;
}
$('golden').addEventListener('pointerdown', (e) => {
  $('golden').classList.add('hidden'); S.golden++; sfx.gold(); const r = Math.random(), c = cps();
  if (r < 0.55) { buffs.push({ name: '🥖 Frenzy ×7', kind: 'cps', mult: 7, until: Date.now() + 30000 }); toast('Shabbat Frenzy! Falafel production ×7 for 30s'); }
  else if (r < 0.85) { const g = Math.min(S.baked * 0.1, c * 900) + 13; gain(g); toast(`Lucky! +${fmt(g)} falafels`); floatText(e.clientX, e.clientY, '+' + fmt(g)); }
  else { buffs.push({ name: '👆 Click Frenzy ×777', kind: 'click', mult: 777, until: Date.now() + 10000 }); toast('Click Frenzy! Clicks ×777 for 10s'); }
});

// ---------- Rain ----------
function spawnRain(n, x) { for (let k = 0; k < n; k++) { const s = document.createElement('span'); s.textContent = pick(['🧆', '🧆', '🥙', '🫘', '🍩', '🥖']); s.style.left = (x !== undefined ? x - 13 + rand(-40, 40) : rand(0, innerWidth)) + 'px'; const d = rand(4, 8); s.style.animationDuration = d + 's'; $('rain').appendChild(s); setTimeout(() => s.remove(), d * 1000); } }
setInterval(() => { const n = Math.min(5, Math.floor(Math.log10(cps() + 1) * 1.2)); if (n > 0 && !document.hidden) spawnRain(n); }, 900);

// ---------- News ----------
function news() { const pool = NEWS.filter(([c]) => c(S)); const el = $('news'); el.style.animation = 'none'; void el.offsetWidth; el.style.animation = ''; el.textContent = pick(pool)[1]; }
setInterval(news, 14000);

// ---------- Save / stats ----------
function save() { S.last = Date.now(); try { localStorage.setItem('yalla-save', JSON.stringify(S)); localStorage.setItem('falafel-best', String(Math.floor(S.total))); } catch (e) {} }
setInterval(save, 10000); addEventListener('beforeunload', save);
function fmtTime(s) { const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return h ? `${h}h ${m}m` : `${m}m ${Math.floor(s % 60)}s`; }
function openStats() {
  const rows = [['Falafels in bank', fmt(Math.floor(S.baked))], ['Baked all time', fmt(Math.floor(S.total))], ['Per second', fmt(cps())], ['Per click', fmt(clickVal())], ['Clicks', fmt(S.clicks)], ['Golden challahs', S.golden], ['Buildings', S.owned.reduce((a, b) => a + b, 0)], ['Time played', fmtTime(S.played)]];
  $('stats').innerHTML = rows.map(([a, b]) => `<div>${a}<b>${b}</b></div>`).join('');
  $('ach').innerHTML = ACH.map((a) => `<i class="${S.ach.includes(a.id) ? '' : 'lock'}" data-t="${a.name}||${a.desc}">${a.icon}</i>`).join('');
  $('ach').querySelectorAll('i').forEach((i) => { i.onmousemove = (e) => { const [n, d] = i.dataset.t.split('||'); showTip(e, `<b>${i.classList.contains('lock') ? '???' : n}</b><br>${d}`); }; i.onmouseleave = hideTip; });
  $('achCount').textContent = `${S.ach.length}/${ACH.length}`; $('modal').classList.remove('hidden');
}
$('statsBtn').onclick = openStats; $('closeModal').onclick = () => $('modal').classList.add('hidden');
let resetArm = 0;
$('resetBtn').onclick = () => { if (Date.now() - resetArm > 4000) { resetArm = Date.now(); $('resetBtn').textContent = 'CLICK AGAIN TO CONFIRM'; setTimeout(() => ($('resetBtn').textContent = 'RESET PROGRESS'), 4000); return; } S = fresh(); buffs = []; save(); $('modal').classList.add('hidden'); $('shopName').value = S.name; renderStore(); renderUps(); $('resetBtn').textContent = 'RESET PROGRESS'; };
$('muteBtn').onclick = () => { muted = !muted; try { localStorage.setItem('yalla-muted', muted ? '1' : '0'); } catch (e) {} $('muteBtn').textContent = 'SOUND: ' + (muted ? 'OFF' : 'ON'); };
$('muteBtn').textContent = 'SOUND: ' + (muted ? 'OFF' : 'ON');
$('shopName').value = S.name; $('shopName').addEventListener('input', (e) => { S.name = e.target.value; });
document.querySelectorAll('#buyAmt button').forEach((b) => (b.onclick = () => { buyN = +b.dataset.n; document.querySelectorAll('#buyAmt button').forEach((x) => x.classList.toggle('sel', x === b)); renderStore(); }));

// ---------- Loop ----------
let last = performance.now(), acc = 0, storeAcc = 0;
setInterval(() => {
  const now = performance.now(), dt = Math.min(1, (now - last) / 1000); last = now;
  gain(cps() * dt); S.played += dt; acc += dt; storeAcc += dt;
  if (goldenLife > 0) { goldenLife -= dt; if (goldenLife <= 0) $('golden').classList.add('hidden'); } else { goldenTimer -= dt; if (goldenTimer <= 0) { spawnGolden(); goldenTimer = rand(60, 130); } }
  if (acc > 0.1) { acc = 0; updateCounters(); renderBuffs(); refreshAfford(); }
  if (storeAcc > 1) { storeAcc = 0; checkAch(); const need = BUILD.some((b, i) => !document.querySelector(`.bld[data-i="${i}"]:not(.locked)`) && (S.owned[i] > 0 || S.total >= b.base * 0.3)) || UPS.some((u) => !has(u.id) && (u.kind === 'b' ? S.owned[u.b] >= u.n : S.total >= u.cost * 0.4) && !document.querySelector(`.up[data-id="${u.id}"]`)); if (need) { renderStore(); renderUps(); } }
}, 50);

// ---------- Init (offline earnings) ----------
{
  const away = Math.min(8 * 3600, (Date.now() - S.last) / 1000);
  if (away > 30 && cps() > 0) { const g = cps() * away * 0.5; gain(g); setTimeout(() => toast(`While you were away (${fmtTime(away)}): +${fmt(g)} falafels`), 600); }
  renderStore(); renderUps(); updateCounters(); checkAch(); news();
}
if (location.search.includes('debug')) window.__yf = { get S() { return S; }, gain, buyBuilding, buyUp, spawnGolden, cps, clickVal, UPS, BUILD, ACH, set buyN(v) { buyN = v; renderStore(); } };
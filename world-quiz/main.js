// ============================================================
//  WORLD QUIZ — name all 196 countries in 15 minutes (French or English, accent-insensitive)
//  196 = 193 UN members + Vatican City + Palestine + Kosovo
// ============================================================
const $ = (id) => document.getElementById(id);
const TIME = 15 * 60;
const CONTS = { AF: 'Africa', EU: 'Europe', AS: 'Asia', NA: 'North America', SA: 'South America', OC: 'Oceania' };

// continent | French name | English name | extra aliases / abbreviations (;)
const RAW = `
AF|Afrique du Sud|South Africa|rsa;sud afrique
AF|Algérie|Algeria|
AF|Angola|Angola|
AF|Bénin|Benin|
AF|Botswana|Botswana|
AF|Burkina Faso|Burkina Faso|burkina
AF|Burundi|Burundi|
AF|Cameroun|Cameroon|
AF|Cap-Vert|Cape Verde|cabo verde
AF|Comores|Comoros|
AF|Congo|Republic of the Congo|république du congo;congo brazzaville;rep du congo;congo-brazzaville
AF|République démocratique du Congo|DR Congo|rdc;rd congo;drc;congo kinshasa;democratic republic of the congo;congo kinshasa
AF|Côte d'Ivoire|Ivory Coast|cote d ivoire;ivoire;civ
AF|Djibouti|Djibouti|
AF|Égypte|Egypt|
AF|Érythrée|Eritrea|
AF|Eswatini|Eswatini|swaziland
AF|Éthiopie|Ethiopia|
AF|Gabon|Gabon|
AF|Gambie|Gambia|
AF|Ghana|Ghana|
AF|Guinée|Guinea|
AF|Guinée-Bissau|Guinea-Bissau|guinee bissao
AF|Guinée équatoriale|Equatorial Guinea|
AF|Kenya|Kenya|
AF|Lesotho|Lesotho|
AF|Libéria|Liberia|
AF|Libye|Libya|
AF|Madagascar|Madagascar|
AF|Malawi|Malawi|
AF|Mali|Mali|
AF|Maroc|Morocco|
AF|Maurice|Mauritius|ile maurice
AF|Mauritanie|Mauritania|
AF|Mozambique|Mozambique|
AF|Namibie|Namibia|
AF|Niger|Niger|
AF|Nigéria|Nigeria|nigeria
AF|Ouganda|Uganda|
AF|République centrafricaine|Central African Republic|rca;centrafrique
AF|Rwanda|Rwanda|
AF|Sao Tomé-et-Principe|Sao Tome and Principe|sao tome;stp
AF|Sénégal|Senegal|
AF|Seychelles|Seychelles|
AF|Sierra Leone|Sierra Leone|
AF|Somalie|Somalia|
AF|Soudan|Sudan|
AF|Soudan du Sud|South Sudan|
AF|Tanzanie|Tanzania|
AF|Tchad|Chad|
AF|Togo|Togo|
AF|Tunisie|Tunisia|
AF|Zambie|Zambia|
AF|Zimbabwe|Zimbabwe|
EU|Albanie|Albania|
EU|Allemagne|Germany|
EU|Andorre|Andorra|
EU|Autriche|Austria|
EU|Belgique|Belgium|
EU|Biélorussie|Belarus|belarus
EU|Bosnie-Herzégovine|Bosnia and Herzegovina|bosnie;bosnia
EU|Bulgarie|Bulgaria|
EU|Chypre|Cyprus|
EU|Croatie|Croatia|
EU|Danemark|Denmark|
EU|Espagne|Spain|
EU|Estonie|Estonia|
EU|Finlande|Finland|
EU|France|France|
EU|Grèce|Greece|
EU|Hongrie|Hungary|
EU|Irlande|Ireland|
EU|Islande|Iceland|
EU|Italie|Italy|
EU|Kosovo|Kosovo|
EU|Lettonie|Latvia|
EU|Liechtenstein|Liechtenstein|
EU|Lituanie|Lithuania|
EU|Luxembourg|Luxembourg|
EU|Macédoine du Nord|North Macedonia|macedoine;macedonia
EU|Malte|Malta|
EU|Moldavie|Moldova|moldova
EU|Monaco|Monaco|
EU|Monténégro|Montenegro|
EU|Norvège|Norway|
EU|Pays-Bas|Netherlands|holland;hollande
EU|Pologne|Poland|
EU|Portugal|Portugal|
EU|République tchèque|Czechia|tchequie;czech republic
EU|Roumanie|Romania|
EU|Royaume-Uni|United Kingdom|uk;gb;grande bretagne;great britain
EU|Russie|Russia|
EU|Saint-Marin|San Marino|saint marin
EU|Serbie|Serbia|
EU|Slovaquie|Slovakia|
EU|Slovénie|Slovenia|
EU|Suède|Sweden|
EU|Suisse|Switzerland|
EU|Ukraine|Ukraine|
EU|Vatican|Vatican City|saint siege;ville du vatican;vatican city
AS|Afghanistan|Afghanistan|
AS|Arabie saoudite|Saudi Arabia|arabie;ksa
AS|Arménie|Armenia|
AS|Azerbaïdjan|Azerbaijan|
AS|Bahreïn|Bahrain|
AS|Bangladesh|Bangladesh|
AS|Bhoutan|Bhutan|
AS|Birmanie|Myanmar|myanmar;burma
AS|Brunei|Brunei|
AS|Cambodge|Cambodia|
AS|Chine|China|
AS|Corée du Nord|North Korea|
AS|Corée du Sud|South Korea|coree
AS|Émirats arabes unis|United Arab Emirates|eau;uae;emirats
AS|Géorgie|Georgia|
AS|Inde|India|
AS|Indonésie|Indonesia|
AS|Irak|Iraq|
AS|Iran|Iran|
AS|Israël|Israel|
AS|Japon|Japan|
AS|Jordanie|Jordan|
AS|Kazakhstan|Kazakhstan|
AS|Kirghizistan|Kyrgyzstan|kirghizstan;kirghizie
AS|Koweït|Kuwait|
AS|Laos|Laos|
AS|Liban|Lebanon|
AS|Malaisie|Malaysia|
AS|Maldives|Maldives|
AS|Mongolie|Mongolia|
AS|Népal|Nepal|
AS|Oman|Oman|
AS|Ouzbékistan|Uzbekistan|
AS|Pakistan|Pakistan|
AS|Palestine|Palestine|
AS|Philippines|Philippines|
AS|Qatar|Qatar|
AS|Singapour|Singapore|
AS|Sri Lanka|Sri Lanka|
AS|Syrie|Syria|
AS|Tadjikistan|Tajikistan|tajikistan
AS|Thaïlande|Thailand|
AS|Timor oriental|Timor-Leste|east timor;timor
AS|Turkménistan|Turkmenistan|
AS|Turquie|Turkey|turkiye
AS|Viêt Nam|Vietnam|vietnam
AS|Yémen|Yemen|
NA|Antigua-et-Barbuda|Antigua and Barbuda|antigua
NA|Bahamas|Bahamas|
NA|Barbade|Barbados|
NA|Belize|Belize|
NA|Canada|Canada|
NA|Costa Rica|Costa Rica|
NA|Cuba|Cuba|
NA|Dominique|Dominica|
NA|République dominicaine|Dominican Republic|rep dominicaine
NA|Salvador|El Salvador|
NA|Grenade|Grenada|
NA|Guatemala|Guatemala|
NA|Haïti|Haiti|
NA|Honduras|Honduras|
NA|Jamaïque|Jamaica|
NA|Mexique|Mexico|
NA|Nicaragua|Nicaragua|
NA|Panama|Panama|
NA|Saint-Christophe-et-Niévès|Saint Kitts and Nevis|saint kitts;st kitts
NA|Sainte-Lucie|Saint Lucia|st lucia
NA|Saint-Vincent-et-les-Grenadines|Saint Vincent and the Grenadines|saint vincent;st vincent
NA|Trinité-et-Tobago|Trinidad and Tobago|trinidad;trinidad et tobago
NA|États-Unis|United States|usa;us;etats unis d amerique;united states of america;america
SA|Argentine|Argentina|
SA|Bolivie|Bolivia|
SA|Brésil|Brazil|
SA|Chili|Chile|
SA|Colombie|Colombia|
SA|Équateur|Ecuador|
SA|Guyana|Guyana|
SA|Paraguay|Paraguay|
SA|Pérou|Peru|
SA|Suriname|Suriname|
SA|Uruguay|Uruguay|
SA|Venezuela|Venezuela|
OC|Australie|Australia|
OC|Fidji|Fiji|
OC|Kiribati|Kiribati|
OC|Îles Marshall|Marshall Islands|marshall
OC|Micronésie|Micronesia|
OC|Nauru|Nauru|
OC|Nouvelle-Zélande|New Zealand|nz
OC|Palaos|Palau|palau
OC|Papouasie-Nouvelle-Guinée|Papua New Guinea|png;papouasie
OC|Samoa|Samoa|
OC|Îles Salomon|Solomon Islands|salomon
OC|Tonga|Tonga|
OC|Tuvalu|Tuvalu|
OC|Vanuatu|Vanuatu|
`;

// ---------- Matching ----------
function norm(s) {
  return s.toLowerCase().replace(/^(l['’]|le |la |les |the )/, '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’'`]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}
const C = RAW.trim().split('\n').map((l, i) => { const [k, fr, en, al] = l.split('|'); return { id: i, k, fr, en, keys: [...new Set([fr, en, ...(al ? al.split(';') : [])].filter(Boolean).map(norm))], found: false, hinted: false }; });
const LOOK = new Map(); const ALLKEYS = [];
for (const c of C) for (const key of c.keys) { if (LOOK.has(key) && LOOK.get(key) !== c) console.warn('alias clash', key); LOOK.set(key, c); ALLKEYS.push([key, c]); }
function lev(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let p2 = null, prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]; let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (p2 && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, p2[j - 2] + 1); // swapped letters count as 1
      cur.push(v); if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1; p2 = prev; prev = cur;
  }
  return prev[b.length];
}
function fuzzy(t) {
  if (t.length < 5) return null; let best = 99, who = null, tie = false;
  for (const [key, c] of ALLKEYS) {
    if (key.length < 5) continue; const max = key.length >= 10 ? 2 : key.length >= 6 ? 1 : 0; if (!max) continue;
    const d = lev(t, key, max); if (d > max) continue;
    if (d < best) { best = d; who = c; tie = false; } else if (d === best && c !== who) tie = true;
  }
  return tie ? null : who;
}
const hasLonger = (t) => ALLKEYS.some(([k, c]) => !c.found && k !== t && k.startsWith(t));

// ---------- State ----------
let running = false, endAt = 0, tick = null, found = 0, hints = 0, timer1 = null, timer2 = null, hintTarget = null;
let best = 0, bestTime = 0;
try { best = +localStorage.getItem('countries-best') || 0; bestTime = +localStorage.getItem('countries-besttime') || 0; } catch (e) {}
const fmtT = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
function menuBest() { $('bestMenu').textContent = best; $('bestTime').textContent = bestTime ? `· fastest full clear ${fmtT(bestTime)}` : ''; }
menuBest();

// ---------- Grid ----------
function buildGrid() {
  $('grid').innerHTML = '';
  for (const [k, name] of Object.entries(CONTS)) {
    const list = C.filter((c) => c.k === k).sort((a, b) => norm(a.fr).localeCompare(norm(b.fr)));
    const d = document.createElement('section'); d.className = 'cont'; d.id = 'cont-' + k;
    d.innerHTML = `<h3>${name.toUpperCase()}<span id="cc-${k}">0 / ${list.length}</span></h3><div class="slots">${list.map((c) => `<div class="slot" id="s${c.id}"></div>`).join('')}</div>`;
    $('grid').appendChild(d);
  }
}
const slot = (c) => $('s' + c.id);
function reveal(c, cls) { const s = slot(c); s.className = 'slot ' + cls; s.innerHTML = `${c.fr}<em>${c.en !== c.fr ? c.en : ''}</em>`; }
function toast(t) { const d = document.createElement('div'); d.className = 'toast'; d.textContent = t; $('toasts').appendChild(d); setTimeout(() => d.remove(), 3600); }
function flash(cls, text) { const a = $('answer'); a.classList.remove('ok', 'dup', 'bad'); void a.offsetWidth; a.classList.add(cls); $('msg').textContent = text || ''; setTimeout(() => { a.classList.remove(cls); if ($('msg').textContent === text) $('msg').textContent = ''; }, 1100); }

function accept(c) {
  const a = $('answer'); a.value = '';
  if (c.found) { flash('dup', `Already found: ${c.fr}`); return; }
  c.found = true; found++; reveal(c, 'got'); flash('ok', ''); if (hintTarget === c) { hintTarget = null; $('hintBox').textContent = 'Nice! Complete a continent to earn another hint.'; }
  $('found').textContent = found; $('barFill').style.width = (found / C.length) * 100 + '%';
  const list = C.filter((x) => x.k === c.k), n = list.filter((x) => x.found).length;
  $('cc-' + c.k).textContent = `${n} / ${list.length}`;
  if (n === list.length) { $('cont-' + c.k).classList.add('done'); hints++; updHint(); toast(`🎉 ${CONTS[c.k]} complete! +1 hint`); }
  if (found === C.length) end(true);
}
function check(immediate) {
  if (!running) return; clearTimeout(timer1); clearTimeout(timer2);
  const t = norm($('answer').value); if (!t) return;
  const exact = LOOK.get(t);
  if (exact) { if (immediate || !hasLonger(t)) accept(exact); else timer1 = setTimeout(() => accept(exact), 850); return; }
  if (immediate) { const f = fuzzy(t); if (f) accept(f); else flash('bad', 'Not found'); }
  else timer2 = setTimeout(() => { const f = fuzzy(norm($('answer').value)); if (f) accept(f); }, 1100);
}
$('answer').addEventListener('input', () => check(false));
$('answer').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); check(true); } });

// ---------- Hints ----------
function updHint() { $('hintN').textContent = hints; $('hintBtn').disabled = !running || hints <= 0; $('hintBtn').classList.toggle('hot', running && hints > 0); }
$('hintBtn').onclick = () => {
  if (!running || hints <= 0) return; const missing = C.filter((c) => !c.found); if (!missing.length) return;
  const c = hintTarget && !hintTarget.found ? hintTarget : missing[Math.floor(Math.random() * missing.length)]; hintTarget = c; hints--; updHint();
  const letters = c.fr.replace(/[^\p{L}]/gu, '').length, first = c.fr[0].normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
  const s = slot(c); s.className = 'slot hint'; s.textContent = first + ' ' + '·'.repeat(Math.min(letters - 1, 14));
  $('hintBox').innerHTML = `💡 <b>${CONTS[c.k]}</b> · starts with <b>${first}</b> · ${letters} letters`; $('answer').focus(); s.scrollIntoView({ block: 'center', behavior: 'smooth' });
};

// ---------- Flow ----------
function start() {
  C.forEach((c) => { c.found = false; }); found = 0; hints = 0; hintTarget = null; buildGrid();
  $('found').textContent = 0; $('barFill').style.width = '0'; $('hintBox').textContent = 'Complete a continent to earn a hint.';
  $('menu').classList.add('hidden'); $('end').classList.add('hidden'); running = true; endAt = performance.now() + TIME * 1000;
  $('answer').disabled = false; $('answer').value = ''; $('answer').focus(); $('giveUp').disabled = false; updHint();
  clearInterval(tick); tick = setInterval(loop, 200); loop();
}
function loop() {
  const left = Math.max(0, (endAt - performance.now()) / 1000); $('timer').textContent = fmtT(Math.ceil(left)); $('timer').classList.toggle('low', left < 60);
  if (left <= 0) end(false);
}
function end(perfect) {
  if (!running) return; running = false; clearInterval(tick); clearTimeout(timer1); clearTimeout(timer2);
  const used = TIME - Math.max(0, (endAt - performance.now()) / 1000);
  $('answer').disabled = true; $('giveUp').disabled = true; updHint();
  for (const c of C) if (!c.found) reveal(c, 'miss');
  const isBest = found > best; if (isBest) { best = found; }
  if (perfect && (!bestTime || used < bestTime)) bestTime = Math.round(used);
  try { localStorage.setItem('countries-best', String(best)); if (bestTime) localStorage.setItem('countries-besttime', String(bestTime)); } catch (e) {}
  $('endTitle').textContent = perfect ? 'PERFECT!' : $('timer').textContent === '0:00' ? "TIME'S UP" : 'GAME OVER';
  $('endScore').textContent = found; $('newBest').classList.toggle('hidden', !isBest || found === 0);
  $('endBreak').innerHTML = Object.entries(CONTS).map(([k, n]) => { const l = C.filter((c) => c.k === k); return `<div>${n}<b>${l.filter((c) => c.found).length}/${l.length}</b></div>`; }).join('');
  menuBest(); setTimeout(() => $('end').classList.remove('hidden'), 700);
}
$('startBtn').onclick = start; $('againBtn').onclick = start;
$('giveUp').onclick = () => { if ($('giveUp').dataset.arm) { end(false); delete $('giveUp').dataset.arm; $('giveUp').textContent = 'GIVE UP'; } else { $('giveUp').dataset.arm = 1; $('giveUp').textContent = 'SURE?'; setTimeout(() => { delete $('giveUp').dataset.arm; $('giveUp').textContent = 'GIVE UP'; }, 2500); } };
$('reviewBtn').onclick = () => $('end').classList.add('hidden');
buildGrid();
if (location.search.includes('debug')) window.__wq = { C, norm, fuzzy, LOOK, accept, check, get found() { return found; } };
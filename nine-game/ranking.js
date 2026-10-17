// Online ranking on Firestore, arcade style: every play is its own entry. Two boards: the last 7 days
// and all time. Players type any name; no account needed. Firebase anonymous auth gives each
// browser a private id that is stored on its entries.
// Bump VERSION (here and in index.html) when ranking code changes, so browsers fetch the new files.
import { firebaseConfig } from './firebase-config.js?v=20261022';

// Name used for players who would rather not type one.
const ANON_NAME = '名無しさん';

const SDK = 'https://www.gstatic.com/firebasejs/12.19.0';
const NAME_KEY = 'nine-game-name';
const RANK_SIZE = 100;

const $ = id => document.getElementById(id);
let fb = null;          // { auth, db, A: auth module, F: firestore module }
let last = null;        // result of the game that just ended
let submitted = false;
let lastId = null;      // id of the entry this browser just submitted, highlighted in the list
let tab = 'weekly';
// "自分" tab: this browser's own top scores, kept only in localStorage (no Firestore reads).
const MINE_KEY = 'nine-game-mine';
const MINE_SIZE = 10;
let mineLast = null;    // `at` of the play that just ended, highlighted in the 自分 tab
// Ranking lists already read, kept in memory for a few minutes so switching tabs or reopening
// the ranking does not read the same entries again. Cleared when this browser registers a score.
const CACHE_MS = 3 * 60 * 1000;
let cache = {};         // collection path -> { at, rows: [{ id, v }] }

function readName() { try { return localStorage.getItem(NAME_KEY) || ''; } catch { return ''; } }
function writeName(v) { try { localStorage.setItem(NAME_KEY, v); } catch {} }

// Days run 00:00 to 24:00 Japan time. The id is that date, e.g. "2026-10-09".
function dayStart(now = new Date()) {
  const jst = new Date(now.getTime() + 9 * 3600e3);
  return new Date(Date.UTC(jst.getUTCFullYear(), jst.getUTCMonth(), jst.getUTCDate()));
}
const dateId = d => d.toISOString().slice(0, 10);
// The weekly board covers the last 7 days in Japan time: today plus the 6 days before it.
const WEEK_DAYS = 7;
// The moment the window opens (00:00 Japan time, 6 days ago) and a label like "10/11〜10/17".
function weekSince() {
  return new Date(dayStart().getTime() - (WEEK_DAYS - 1) * 86400e3 - 9 * 3600e3);
}
function weekLabel() {
  const md = x => `${x.getUTCMonth() + 1}/${x.getUTCDate()}`;
  const today = dayStart();
  return `${md(new Date(today.getTime() - (WEEK_DAYS - 1) * 86400e3))}〜${md(today)}`;
}

// Crown icon for the top three: gold, silver, bronze.
const CROWN_COLORS = ['#f5c542', '#c9ced6', '#d08a4a'];
function crown(pos, size = 22) {
  const c = CROWN_COLORS[pos - 1];
  return `<svg viewBox="0 0 24 20" width="${size}" height="${Math.round(size * 20 / 24)}" aria-hidden="true">`
    + `<path d="M2 6l5 5 5-9 5 9 5-5-2 12H4z" fill="${c}" stroke="#111" stroke-width="1.6" stroke-linejoin="round"/>`
    + `<circle cx="2" cy="6" r="1.8" fill="${c}"/><circle cx="12" cy="2" r="1.8" fill="${c}"/><circle cx="22" cy="6" r="1.8" fill="${c}"/></svg>`;
}

// ---- celebration for a top-10 finish: confetti and a big badge ----
// Shows one board only, by priority: all-time, then weekly.
function celebrate({ rankAll, rankWeek }) {
  const pick = [['総合ランキング', rankAll], ['週間ランキング', rankWeek]]
    .find(([, r]) => r && r <= 10);
  if (!pick) return;
  const [board, rank] = pick;
  window.dispatchEvent(new CustomEvent('nine:fanfare'));
  const wrap = document.createElement('div');
  wrap.className = 'celebrate';
  wrap.setAttribute('role', 'status');
  wrap.innerHTML = `<canvas></canvas><div class="celebrate-card">
    <div class="celebrate-crown">${crown(rank <= 3 ? rank : 1, 64)}</div>
    <div class="celebrate-board">${board}</div>
    <div class="celebrate-rank">${rank}<small>位</small></div>
    <div class="celebrate-msg">おめでとう！</div></div>`;
  document.body.appendChild(wrap);
  const close = () => wrap.remove();
  wrap.addEventListener('click', close);
  setTimeout(close, 3600);
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  // confetti in the game's colours
  const cv = wrap.querySelector('canvas'), ctx = cv.getContext('2d');
  const dpr = Math.min(2, devicePixelRatio || 1);
  const W = innerWidth, H = innerHeight;
  cv.width = W * dpr; cv.height = H * dpr; ctx.scale(dpr, dpr);
  const COLORS = ['#be2a3c', '#c8c846', '#5e8fbd', '#5b6fa6', '#64955a', '#f5c542', '#f2f2ef'];
  const bits = Array.from({ length: 140 }, () => ({
    x: Math.random() * W, y: -20 - Math.random() * H * .6, w: 6 + Math.random() * 6, h: 8 + Math.random() * 8,
    vx: (Math.random() - .5) * 120, vy: 120 + Math.random() * 220, rot: Math.random() * 6, vr: (Math.random() - .5) * 10,
    c: COLORS[Math.floor(Math.random() * COLORS.length)]
  }));
  let last = performance.now();
  (function frame(now) {
    if (!wrap.isConnected) return;
    const dt = Math.min(.05, (now - last) / 1000); last = now;
    ctx.clearRect(0, 0, W, H);
    bits.forEach(b => {
      b.x += b.vx * dt; b.y += b.vy * dt; b.rot += b.vr * dt; b.vy += 40 * dt;
      ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.rot);
      ctx.fillStyle = b.c; ctx.fillRect(-b.w / 2, -b.h / 2, b.w, b.h * Math.abs(Math.cos(b.rot)));
      ctx.restore();
    });
    requestAnimationFrame(frame);
  })(last);
}

// A short, actionable message for a failed Firebase call, with the error code for troubleshooting.
function errorText(e, action) {
  const code = e?.code || e?.name || 'unknown';
  let hint = '通信状況を確かめて、もう一度お試しください。';
  if (code === 'permission-denied') hint = 'ページを再読み込みしてから、もう一度お試しください。';
  else if (code === 'unavailable' || code === 'auth/network-request-failed' || code === 'TypeError') hint = '電波の良いところで、もう一度お試しください。';
  else if (code === 'auth/operation-not-allowed' || code === 'auth/admin-restricted-operation') hint = 'Firebase で匿名ログインがオフになっています。';
  return `${action}できませんでした。${hint}（${code}）`;
}

function note(text, kind = '') {
  const n = $('submitNote');
  n.hidden = !text;
  n.textContent = text;
  n.className = 'note' + (kind ? ' ' + kind : '');
  if (kind !== 'ok') showRanks(null);
}

// The player's ranks after registering, one board per line: weekly, all-time.
function showRanks(rows) {
  const box = $('rankResult');
  box.replaceChildren();
  box.hidden = !rows;
  (rows || []).forEach(([label, rank]) => {
    const dt = document.createElement('dt'); dt.textContent = label;
    const dd = document.createElement('dd');
    dd.textContent = rank ? `${rank}位` : '—';
    dd.classList.toggle('top10', !!rank && rank <= 10);
    box.append(dt, dd);
  });
}

async function load() {
  if (!firebaseConfig) return null;
  if (fb) return fb;
  const [appM, A, F] = await Promise.all([
    import(`${SDK}/firebase-app.js`),
    import(`${SDK}/firebase-auth.js`),
    import(`${SDK}/firebase-firestore.js`)
  ]);
  const app = appM.initializeApp(firebaseConfig);
  fb = { auth: A.getAuth(app), db: F.getFirestore(app), A, F };
  return fb;
}

async function uid() {
  const { auth, A } = fb;
  // Wait for a saved sign-in to be restored first, or every page load would become a new player.
  await auth.authStateReady();
  if (!auth.currentUser) await A.signInAnonymously(auth);
  return auth.currentUser.uid;
}

// plays/{id}                 … all-time ranking
const allCol = () => fb.F.collection(fb.db, 'plays');
// Every play from the last 7 days, best first. Read with a range on createdAt only (no extra index
// needed) and sorted here; capped so a very busy week cannot run up the read count.
const WEEK_CAP = 2000;
async function weekRows() {
  const hit = cache.week;
  if (hit && Date.now() - hit.at <= CACHE_MS) return hit.rows;
  const { F } = fb;
  const snap = await F.getDocs(F.query(allCol(), F.where('createdAt', '>=', weekSince()), F.limit(WEEK_CAP)));
  const rows = snap.docs.map(d => ({ id: d.id, v: d.data() })).sort((a, b) => b.v.score - a.v.score);
  cache.week = { at: Date.now(), rows };
  return rows;
}

// Every finished game goes on the ranking. The first time, the player must pick a name before
// "もう一度" appears; after that each game is registered automatically under the saved name.
// renaming: the player opened "次から名前を変える" after this game was registered.
let failed = false;
let renaming = false;

function showEndButtons(show) {
  $('againBtn').hidden = !show;
  $('rankBtnEnd').hidden = !show;
}

function refresh() {
  const box = $('submitBox'), input = $('nameInput'), btn = $('submitBtn');
  box.hidden = true;
  $('renameBtn').hidden = true;
  showEndButtons(true);
  if (!last) return;
  if (!firebaseConfig) { note('オンラインランキングは準備中です。'); return; }
  if (last.score <= 0) { note('0 点はランキングに載りません。'); return; }
  if (submitted) {
    if (renaming) {
      box.hidden = false;
      btn.textContent = '保存';
      $('anonBtn').textContent = `${ANON_NAME}にする`;
      $('nameHelp').textContent = '次のゲームから、この名前で登録します。';
      if (!input.value) input.value = readName();
    } else {
      $('renameBtn').hidden = false;
    }
    return;
  }
  const saved = readName();
  if (saved && !failed) {           // returning player: register right away
    submit(saved);
    return;
  }
  // first game (or a retry after a failure): ask for the name; replay waits until it is registered
  box.hidden = false;
  btn.textContent = '登録';
  $('anonBtn').textContent = `名前を入れずに登録（${ANON_NAME}）`;
  $('nameHelp').textContent = failed
    ? '「登録」をもう一度押してください。'
    : 'ランキングに載せる名前を決めてください。次からは自動で登録されます。';
  if (!input.value) input.value = saved;
  showEndButtons(failed);
}

function saveRename(nameArg) {
  const name = (nameArg ?? $('nameInput').value).trim();
  if (!name) { note('名前を入れてください。', 'err'); return; }
  writeName(name);
  renaming = false;
  refresh();
  note(`次のゲームから「${name}」で登録します。`, 'ok');
}

async function submit(nameArg) {
  const name = (nameArg ?? $('nameInput').value).trim();
  if (!name) { note('名前を入れてください。', 'err'); return; }
  if (!last || submitted) return;
  const btn = $('submitBtn');
  btn.disabled = true;
  $('anonBtn').disabled = true;
  showEndButtons(false);
  note(`「${name}」でランキングに登録中…`);
  try {
    const { F } = await load();
    const me = await uid();
    const allRef = F.doc(allCol());
    const row = { name, score: last.score, nines: last.nines, level: last.level, uid: me, createdAt: F.serverTimestamp() };
    await F.setDoc(allRef, row);
    writeName(name);
    lastId = allRef.id;
    cache = {};
    const [rows, ha] = await Promise.all([
      weekRows(),
      F.getCountFromServer(F.query(allCol(), F.where('score', '>', last.score)))
    ]);
    const rankWeek = rows.filter(r => r.v.score > last.score).length + 1, rankAll = ha.data().count + 1;
    submitted = true;
    failed = false;
    refresh();
    note(`「${name}」で ${last.score} 点を登録しました！`, 'ok');
    showRanks([['週間', rankWeek], ['総合', rankAll]]);
    celebrate({ rankAll, rankWeek });
  } catch (e) {
    failed = true;
    refresh();
    note(errorText(e, '登録'), 'err');
    console.error(e);
  } finally {
    btn.disabled = false;
    $('anonBtn').disabled = false;
  }
}

async function renderRanking() {
  const list = $('rankList'), status = $('rankStatus'), period = $('rankPeriod');
  document.querySelectorAll('.rank-tab').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
  list.innerHTML = '';
  status.hidden = false;
  status.className = 'note';
  period.textContent = tab === 'weekly' ? `直近7日間 ${weekLabel()}`
    : tab === 'mine' ? `この端末で遊んだ個人の記録（上位${MINE_SIZE}件）` : 'これまでの全期間';
  $('rankTop').hidden = tab === 'mine';
  $('rankFoot').hidden = tab !== 'mine';
  if (tab === 'mine') { renderMine(); return; }
  if (!firebaseConfig) { status.textContent = 'オンラインランキングは準備中です。'; return; }
  status.textContent = '読み込み中…';
  const want = tab;
  try {
    const { F, auth } = await load();
    let rows;
    if (want === 'weekly') {
      rows = (await weekRows()).slice(0, RANK_SIZE);
    } else {
      const col = allCol();
      let hit = cache[col.path];
      if (!hit || Date.now() - hit.at > CACHE_MS) {
        const snap = await F.getDocs(F.query(col, F.orderBy('score', 'desc'), F.limit(RANK_SIZE)));
        hit = cache[col.path] = { at: Date.now(), rows: snap.docs.map(d => ({ id: d.id, v: d.data() })) };
      }
      rows = hit.rows;
    }
    if (want !== tab) return;                 // tab switched while loading
    if (!rows.length) {
      const when = want === 'weekly' ? 'この7日間は' : '';
      status.textContent = `${when}まだ誰も登録していません。最初の 1 人になろう！`;
      return;
    }
    status.hidden = true;
    const me = auth.currentUser?.uid;
    let pos = 0, prevScore = null, shown = 0;
    rows.forEach(d => {
      const v = d.v;
      shown++;
      if (v.score !== prevScore) { pos = shown; prevScore = v.score; }   // ties share a rank
      const li = document.createElement('li');
      li.classList.toggle('top', pos <= 3);
      const isNew = d.id === lastId;
      li.classList.toggle('me', isNew);
      li.classList.toggle('mine', !isNew && !!me && v.uid === me);
      const a = document.createElement('span'); a.className = 'pos';
      if (pos <= 3) { a.innerHTML = crown(pos); a.setAttribute('aria-label', `${pos}位`); } else a.textContent = pos;
      const b = document.createElement('span'); b.className = 'who'; b.textContent = v.name;
      const c = document.createElement('span'); c.className = 'pts'; c.textContent = v.score;
      li.append(a, b, c);
      list.appendChild(li);
    });
  } catch (e) {
    if (want !== tab) return;
    status.textContent = errorText(e, 'ランキングを読み込み');
    status.className = 'note err';
    console.error(e);
  }
}

function readMine() {
  try {
    const rows = JSON.parse(localStorage.getItem(MINE_KEY) || 'null');
    if (Array.isArray(rows)) return rows;
    // First time: start from the best score saved by older versions (date unknown).
    const best = Number(localStorage.getItem('nine-game-best')) || 0;
    return best > 0 ? [{ score: best, level: null, at: null }] : [];
  } catch { return []; }
}

// Adds a play to this browser's top list; returns its place there (1 = best), or 0 when outside.
function addMine({ score, level }) {
  if (!(score > 0)) return 0;
  const at = Date.now();
  const rows = readMine();
  rows.push({ score, level, at });
  rows.sort((a, b) => b.score - a.score || (a.at ?? 0) - (b.at ?? 0));   // ties: older first
  const kept = rows.slice(0, MINE_SIZE);
  try { localStorage.setItem(MINE_KEY, JSON.stringify(kept)); } catch {}
  const i = kept.findIndex(r => r.at === at);
  if (i < 0) return 0;
  mineLast = at;
  return kept.filter(r => r.score > score).length + 1;
}

function mineDate(at) {
  if (!at) return '以前の記録';
  const d = new Date(at), p = n => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function renderMine() {
  const list = $('rankList'), status = $('rankStatus');
  const rows = readMine();
  if (!rows.length) { status.textContent = 'まだ記録がありません。遊ぶとここに残ります。'; return; }
  status.hidden = true;
  let pos = 0, prevScore = null;
  rows.forEach((v, i) => {
    if (v.score !== prevScore) { pos = i + 1; prevScore = v.score; }
    const li = document.createElement('li');
    li.classList.toggle('top', pos <= 3);
    li.classList.toggle('me', !!v.at && v.at === mineLast);
    const a = document.createElement('span'); a.className = 'pos';
    if (pos <= 3) { a.innerHTML = crown(pos); a.setAttribute('aria-label', `${pos}位`); } else a.textContent = pos;
    const b = document.createElement('span'); b.className = 'who'; b.textContent = mineDate(v.at);
    if (v.level) { const s = document.createElement('small'); s.textContent = `Lv${v.level}`; b.appendChild(s); }
    const c = document.createElement('span'); c.className = 'pts'; c.textContent = v.score;
    li.append(a, b, c);
    list.appendChild(li);
  });
}

function showRanking() {
  $('rankOverlay').hidden = false;
  renderRanking();
}

window.addEventListener('nine:gameover', e => {
  last = e.detail;
  const place = addMine(last);
  // "ベストスコア更新！" already covers 1st place; other top-10 places get their own line.
  $('rMine').hidden = !(place > 1);
  $('rMine').textContent = place > 1 ? `自分の記録で ${place} 位！` : '';
  submitted = false;
  failed = false;
  renaming = false;
  $('nameInput').value = '';
  note('');
  refresh();
});

const onSubmit = () => (renaming ? saveRename() : submit());
// "名無しさん": register (or, when renaming, switch to it) without typing a name.
$('anonBtn').addEventListener('click', () => (renaming ? saveRename(ANON_NAME) : submit(ANON_NAME)));
$('submitBtn').addEventListener('click', onSubmit);
$('nameInput').addEventListener('keydown', e => { if (e.key === 'Enter') onSubmit(); });
$('renameBtn').addEventListener('click', () => { renaming = true; $('nameInput').value = readName(); refresh(); });
document.querySelectorAll('.rank-tab').forEach(b => b.addEventListener('click', () => {
  if (tab === b.dataset.tab) return;
  tab = b.dataset.tab;
  renderRanking();
}));
$('rankBtnStart').addEventListener('click', showRanking);
$('rankBtnEnd').addEventListener('click', showRanking);
$('rankCloseBtn').addEventListener('click', () => { $('rankOverlay').hidden = true; });

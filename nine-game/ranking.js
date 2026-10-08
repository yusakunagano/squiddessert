// Online ranking (weekly + all-time) on Firestore, arcade style: every play is its own entry.
// Players type any name; no account needed. Firebase anonymous auth gives each
// browser a private id that is stored on its entries.
// Bump VERSION (here and in index.html) when ranking code changes, so browsers fetch the new files.
import { firebaseConfig } from './firebase-config.js?v=20261009';

const SDK = 'https://www.gstatic.com/firebasejs/12.19.0';
const NAME_KEY = 'nine-game-name';
const RANK_SIZE = 100;

const $ = id => document.getElementById(id);
let fb = null;          // { auth, db, A: auth module, F: firestore module }
let last = null;        // result of the game that just ended
let submitted = false;
let lastId = null;      // id of the entry this browser just submitted, highlighted in the list
let tab = 'weekly';

function readName() { try { return localStorage.getItem(NAME_KEY) || ''; } catch { return ''; } }
function writeName(v) { try { localStorage.setItem(NAME_KEY, v); } catch {} }

// Weeks run Monday 00:00 to Sunday 24:00 Japan time. The id is the Monday's date, e.g. "2026-10-05".
function weekStart(now = new Date()) {
  const jst = new Date(now.getTime() + 9 * 3600e3);
  const dow = (jst.getUTCDay() + 6) % 7;            // Monday = 0
  return new Date(Date.UTC(jst.getUTCFullYear(), jst.getUTCMonth(), jst.getUTCDate() - dow));
}
const weekId = d => d.toISOString().slice(0, 10);
function weekLabel(d) {
  const end = new Date(d.getTime() + 6 * 86400e3);
  const md = x => `${x.getUTCMonth() + 1}/${x.getUTCDate()}`;
  return `${md(d)}（月）〜 ${md(end)}（日）`;
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
// weeks/{monday}/plays/{id}  … weekly ranking (e.g. weeks/2026-10-05/plays/xxxx)
const allCol = () => fb.F.collection(fb.db, 'plays');
const weekCol = week => fb.F.collection(fb.db, 'weeks', week, 'plays');

function refresh() {
  const box = $('submitBox');
  box.hidden = true;
  if (!last || submitted) return;
  if (!firebaseConfig) { note('オンラインランキングは準備中です。'); return; }
  if (last.score <= 0) { note('スコアが 1 点以上でランキングに登録できます。'); return; }
  const input = $('nameInput');
  if (!input.value) input.value = readName();
  box.hidden = false;
  note('');
}

async function submit() {
  const name = $('nameInput').value.trim();
  if (!name) { note('名前を入れてください。', 'err'); return; }
  if (!last) return;
  const btn = $('submitBtn');
  btn.disabled = true;
  note('登録中…');
  try {
    const { db, F } = await load();
    const me = await uid();
    const week = weekId(weekStart());
    // The same id in both rankings, so the new entry can be highlighted in either tab.
    const allRef = F.doc(allCol());
    const weekRef = F.doc(weekCol(week), allRef.id);
    const row = { name, score: last.score, nines: last.nines, level: last.level, uid: me, createdAt: F.serverTimestamp() };
    const batch = F.writeBatch(db);
    batch.set(allRef, row);
    batch.set(weekRef, row);
    await batch.commit();
    writeName(name);
    lastId = allRef.id;

    const [hw, ha] = await Promise.all([
      F.getCountFromServer(F.query(weekCol(week), F.where('score', '>', last.score))),
      F.getCountFromServer(F.query(allCol(), F.where('score', '>', last.score)))
    ]);
    const rankWeek = hw.data().count + 1, rankAll = ha.data().count + 1;
    submitted = true;
    refresh();
    note(`登録しました！ 今回の ${last.score} 点は 今週 ${rankWeek} 位・総合 ${rankAll} 位です。`, 'ok');
  } catch (e) {
    note(errorText(e, '登録'), 'err');
    console.error(e);
  } finally {
    btn.disabled = false;
  }
}

async function renderRanking() {
  const list = $('rankList'), status = $('rankStatus'), period = $('rankPeriod');
  document.querySelectorAll('.rank-tab').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
  list.innerHTML = '';
  status.hidden = false;
  status.className = 'note';
  const start = weekStart();
  period.textContent = tab === 'weekly' ? `今週 ${weekLabel(start)}` : 'これまでの全期間';
  if (!firebaseConfig) { status.textContent = 'オンラインランキングは準備中です。'; return; }
  status.textContent = '読み込み中…';
  const want = tab;
  try {
    const { F, auth } = await load();
    const col = want === 'weekly' ? weekCol(weekId(start)) : allCol();
    const snap = await F.getDocs(F.query(col, F.orderBy('score', 'desc'), F.limit(RANK_SIZE)));
    if (want !== tab) return;                 // tab switched while loading
    if (snap.empty) {
      status.textContent = want === 'weekly' ? '今週はまだ誰も登録していません。最初の 1 人になろう！' : 'まだ誰も登録していません。最初の 1 人になろう！';
      return;
    }
    status.hidden = true;
    const me = auth.currentUser?.uid;
    let pos = 0, prevScore = null, shown = 0;
    snap.forEach(d => {
      const v = d.data();
      shown++;
      if (v.score !== prevScore) { pos = shown; prevScore = v.score; }   // ties share a rank
      const li = document.createElement('li');
      li.classList.toggle('top', pos <= 3);
      li.classList.toggle('me', d.id === lastId);
      li.classList.toggle('mine', d.id !== lastId && !!me && v.uid === me);
      const a = document.createElement('span'); a.className = 'pos'; a.textContent = pos;
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

function showRanking() {
  $('rankOverlay').hidden = false;
  renderRanking();
}

window.addEventListener('nine:gameover', e => {
  last = e.detail;
  submitted = false;
  refresh();
});

$('submitBtn').addEventListener('click', submit);
$('nameInput').addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
document.querySelectorAll('.rank-tab').forEach(b => b.addEventListener('click', () => {
  if (tab === b.dataset.tab) return;
  tab = b.dataset.tab;
  renderRanking();
}));
$('rankBtnStart').addEventListener('click', showRanking);
$('rankBtnEnd').addEventListener('click', showRanking);
$('rankCloseBtn').addEventListener('click', () => { $('rankOverlay').hidden = true; });

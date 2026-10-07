// Online ranking (weekly + all-time) on Firestore.
// Players type any name; no account needed. Firebase anonymous auth gives each
// browser a private id so a player can only raise their own score.
import { firebaseConfig } from './firebase-config.js';

const SDK = 'https://www.gstatic.com/firebasejs/12.19.0';
const NAME_KEY = 'nine-game-name';
const RANK_SIZE = 100;

const $ = id => document.getElementById(id);
let fb = null;          // { auth, db, A: auth module, F: firestore module }
let last = null;        // result of the game that just ended
let submitted = false;
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
  if (!auth.currentUser) await A.signInAnonymously(auth);
  return auth.currentUser.uid;
}

const refs = (id, week) => {
  const { db, F } = fb;
  return {
    all: F.doc(db, 'scores', id),
    week: F.doc(db, 'weeks', week, 'scores', id)
  };
};

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
    const id = await uid();
    const week = weekId(weekStart());
    const r = refs(id, week);
    const [pa, pw] = await Promise.all([F.getDoc(r.all), F.getDoc(r.week)]);
    const bestAll = pa.exists() ? pa.data().score : 0;
    const bestWeek = pw.exists() ? pw.data().score : 0;
    const row = { name, score: last.score, nines: last.nines, level: last.level, updatedAt: F.serverTimestamp() };
    const batch = F.writeBatch(db);
    let wrote = false;
    if (last.score > bestAll) { batch.set(r.all, row); wrote = true; }
    if (last.score > bestWeek) { batch.set(r.week, row); wrote = true; }
    if (wrote) await batch.commit();
    writeName(name);

    const myWeek = Math.max(bestWeek, last.score), myAll = Math.max(bestAll, last.score);
    const [hw, ha] = await Promise.all([
      F.getCountFromServer(F.query(F.collection(db, 'weeks', week, 'scores'), F.where('score', '>', myWeek))),
      F.getCountFromServer(F.query(F.collection(db, 'scores'), F.where('score', '>', myAll)))
    ]);
    const rankWeek = hw.data().count + 1, rankAll = ha.data().count + 1;
    submitted = true;
    refresh();
    note(wrote
      ? `登録しました！ 今週 ${rankWeek} 位・総合 ${rankAll} 位です。`
      : `今週の自己ベスト ${bestWeek} 点のほうが高いので、記録はそのままです（今週 ${rankWeek} 位・総合 ${rankAll} 位）。`, 'ok');
  } catch (e) {
    note('登録できませんでした。通信状況を確かめて、もう一度お試しください。', 'err');
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
    const { db, F, auth } = await load();
    const col = want === 'weekly' ? F.collection(db, 'weeks', weekId(start), 'scores') : F.collection(db, 'scores');
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
      li.classList.toggle('me', !!me && d.id === me);
      const a = document.createElement('span'); a.className = 'pos'; a.textContent = pos;
      const b = document.createElement('span'); b.className = 'who'; b.textContent = v.name;
      const c = document.createElement('span'); c.className = 'pts'; c.textContent = v.score;
      li.append(a, b, c);
      list.appendChild(li);
    });
  } catch (e) {
    if (want !== tab) return;
    status.textContent = 'ランキングを読み込めませんでした。通信状況を確かめてください。';
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

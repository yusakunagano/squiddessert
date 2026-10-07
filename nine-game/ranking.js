// Online ranking: Google sign-in + Firestore (one best-score document per player).
import { firebaseConfig } from './firebase-config.js';

const SDK = 'https://www.gstatic.com/firebasejs/12.19.0';
const NAME_KEY = 'nine-game-name';
const RANK_SIZE = 100;

const $ = id => document.getElementById(id);
let fb = null;          // { auth, db, A: auth module, F: firestore module }
let user = null;
let last = null;        // result of the game that just ended
let submitted = false;

function readName() { try { return localStorage.getItem(NAME_KEY) || ''; } catch { return ''; } }
function writeName(v) { try { localStorage.setItem(NAME_KEY, v); } catch {} }

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
  A.onAuthStateChanged(fb.auth, u => { user = u; refresh(); });
  A.getRedirectResult(fb.auth).catch(() => {});
  return fb;
}

function refresh() {
  const box = $('submitBox'), google = $('googleBtn');
  box.hidden = true;
  google.hidden = true;
  if (!last || submitted) return;
  if (!firebaseConfig) { note('オンラインランキングは準備中です。'); return; }
  if (last.score <= 0) { note('スコアが 1 点以上でランキングに登録できます。'); return; }
  if (!fb) return;
  if (user) {
    const input = $('nameInput');
    if (!input.value) input.value = (readName() || user.displayName || '').slice(0, 12);
    box.hidden = false;
    note('');
  } else {
    google.hidden = false;
    note('名前はあとで変えられます。ランキングには入力した名前だけが表示されます。');
  }
}

async function signIn() {
  try {
    const f = await load();
    const provider = new f.A.GoogleAuthProvider();
    try {
      await f.A.signInWithPopup(f.auth, provider);
    } catch (e) {
      if (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported-in-this-environment') {
        await f.A.signInWithRedirect(f.auth, provider);
      } else if (e.code !== 'auth/popup-closed-by-user' && e.code !== 'auth/cancelled-popup-request') {
        throw e;
      }
    }
  } catch (e) {
    note('ログインできませんでした。通信状況を確かめて、もう一度お試しください。', 'err');
    console.error(e);
  }
}

async function submit() {
  const name = $('nameInput').value.trim();
  if (!name) { note('名前を入れてください。', 'err'); return; }
  if (!user || !last) return;
  const btn = $('submitBtn');
  btn.disabled = true;
  try {
    const { db, F } = fb;
    const ref = F.doc(db, 'scores', user.uid);
    const prev = await F.getDoc(ref);
    const best = prev.exists() ? prev.data().score : 0;
    writeName(name);
    if (last.score > best) {
      await F.setDoc(ref, {
        name, score: last.score, nines: last.nines, level: last.level, updatedAt: F.serverTimestamp()
      });
    }
    const myBest = Math.max(best, last.score);
    const higher = await F.getCountFromServer(F.query(F.collection(db, 'scores'), F.where('score', '>', myBest)));
    const rank = higher.data().count + 1;
    submitted = true;
    refresh();
    note(last.score > best
      ? `登録しました！ あなたは ${rank} 位です。`
      : `自己ベスト ${best} 点（${rank} 位）のほうが高いので、ランキングはそのままです。`, 'ok');
  } catch (e) {
    note('登録できませんでした。通信状況を確かめて、もう一度お試しください。', 'err');
    console.error(e);
  } finally {
    btn.disabled = false;
  }
}

async function showRanking() {
  const list = $('rankList'), status = $('rankStatus');
  list.innerHTML = '';
  status.hidden = false;
  status.className = 'note';
  $('rankOverlay').hidden = false;
  if (!firebaseConfig) { status.textContent = 'オンラインランキングは準備中です。'; return; }
  status.textContent = '読み込み中…';
  try {
    const { db, F } = await load();
    const snap = await F.getDocs(F.query(F.collection(db, 'scores'), F.orderBy('score', 'desc'), F.limit(RANK_SIZE)));
    if (snap.empty) { status.textContent = 'まだ誰も登録していません。最初の 1 人になろう！'; return; }
    status.hidden = true;
    let pos = 0, prevScore = null, shown = 0;
    snap.forEach(d => {
      const v = d.data();
      shown++;
      if (v.score !== prevScore) { pos = shown; prevScore = v.score; }   // ties share a rank
      const li = document.createElement('li');
      li.classList.toggle('top', pos <= 3);
      li.classList.toggle('me', !!user && d.id === user.uid);
      const a = document.createElement('span'); a.className = 'pos'; a.textContent = pos;
      const b = document.createElement('span'); b.className = 'who'; b.textContent = v.name;
      const c = document.createElement('span'); c.className = 'pts'; c.textContent = v.score;
      li.append(a, b, c);
      list.appendChild(li);
    });
  } catch (e) {
    status.textContent = 'ランキングを読み込めませんでした。通信状況を確かめてください。';
    status.className = 'note err';
    console.error(e);
  }
}

window.addEventListener('nine:gameover', e => {
  last = e.detail;
  submitted = false;
  note('');
  refresh();
  load().then(refresh).catch(err => { console.error(err); note('ランキングに接続できませんでした。', 'err'); });
});

$('googleBtn').addEventListener('click', signIn);
$('submitBtn').addEventListener('click', submit);
$('nameInput').addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
$('logoutBtn').addEventListener('click', async () => {
  if (fb) await fb.A.signOut(fb.auth);
  $('nameInput').value = '';
});
$('rankBtnStart').addEventListener('click', showRanking);
$('rankBtnEnd').addEventListener('click', showRanking);
$('rankCloseBtn').addEventListener('click', () => { $('rankOverlay').hidden = true; });

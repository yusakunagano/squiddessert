// 銀行口座の登録（プロトタイプ）。段階：準備 → 口座 → 本人確認 → 認証 → 設定。
// 登録方法（Web連携／暗証番号）と本人確認書類によって、通る画面が変わる。
// 画面内の「デモ：」は動作確認用の値。実際のサービスとは接続しない。

const DEMO_NAME = 'ヤマダ タロウ';
const DEMO = { sms: '123456', bankPw: 'bank1234', otp: '654321', pin: '1234' };
const PHASES = ['準備', '口座', '本人確認', '認証', '設定'];

// n: 名前 / k: 検索用のよみ / t: 種別 / m: 使える登録方法（web=金融機関で承認, pin=暗証番号）/ maint: メンテナンス中
const BANKS = [
  { n: '三菱UFJ銀行', k: 'みつびしゆーえふじぇい', t: 'メガバンク', m: ['web', 'pin'] },
  { n: '三井住友銀行', k: 'みついすみとも', t: 'メガバンク', m: ['web', 'pin'] },
  { n: 'みずほ銀行', k: 'みずほ', t: 'メガバンク', m: ['web', 'pin'] },
  { n: 'りそな銀行', k: 'りそな', t: 'メガバンク', m: ['pin'] },
  { n: 'ゆうちょ銀行', k: 'ゆうちょ', t: 'ゆうちょ', m: ['web', 'pin'] },
  { n: '楽天銀行', k: 'らくてん', t: 'ネット銀行', m: ['web'] },
  { n: 'PayPay銀行', k: 'ぺいぺい', t: 'ネット銀行', m: ['web'] },
  { n: '住信SBIネット銀行', k: 'じゅうしんえすびーあい', t: 'ネット銀行', m: ['web'] },
  { n: 'ソニー銀行', k: 'そにー', t: 'ネット銀行', m: ['web'] },
  { n: 'auじぶん銀行', k: 'じぶん', t: 'ネット銀行', m: ['web'] },
  { n: 'GMOあおぞらネット銀行', k: 'じーえむおーあおぞら', t: 'ネット銀行', m: ['web'], maint: true },
  { n: '横浜銀行', k: 'よこはま', t: '地方銀行', m: ['web', 'pin'] },
  { n: '千葉銀行', k: 'ちば', t: '地方銀行', m: ['web', 'pin'] },
  { n: '静岡銀行', k: 'しずおか', t: '地方銀行', m: ['pin'] },
  { n: '京都銀行', k: 'きょうと', t: '地方銀行', m: ['pin'] },
  { n: '福岡銀行', k: 'ふくおか', t: '地方銀行', m: ['web', 'pin'] },
  { n: '広島銀行', k: 'ひろしま', t: '地方銀行', m: ['pin'] },
  { n: '七十七銀行', k: 'ななじゅうなな', t: '地方銀行', m: ['pin'] },
  { n: '北海道銀行', k: 'ほっかいどう', t: '地方銀行', m: ['web', 'pin'] },
];
const BANK_TYPES = ['すべて', 'メガバンク', 'ゆうちょ', 'ネット銀行', '地方銀行'];
const METHODS = {
  web: { title: '金融機関のサイトで承認する', note: 'ネットバンキングの契約が必要です。ログインして、ワンタイムパスワードで承認します。所要 約3分' },
  pin: { title: 'キャッシュカードの暗証番号で登録する', note: 'ネットバンキングの契約は不要です。口座情報とカードの暗証番号（4桁）で登録します。所要 約1分' },
};
const DOCS = {
  'マイナンバーカード': { note: 'ICチップの読み取りなら、撮影が少なく、いちばん早く終わります。', shots: ['front', 'thick'] },
  '運転免許証': { note: '表面・裏面・厚みを撮影します。', shots: ['front', 'back', 'thick'] },
  '在留カード': { note: '表面・裏面・厚みを撮影します。', shots: ['front', 'back', 'thick'] },
};
const SHOT_NAMES = { front: '書類の表面', back: '書類の裏面', thick: '書類の厚み（斜めから）' };
const SHOT_ERRORS = { front: '光が反射して文字が読み取れませんでした' }; // デモ：表面の1回目は失敗する
const LIMITS = [10000, 30000, 50000, 100000];
const TERMS = [
  ['terms', '利用規約', 'アプリの利用条件、禁止事項、免責についての規約です。（プロトタイプのため概要のみ）'],
  ['privacy', '個人情報の取り扱い', '本人確認のために、氏名・生年月日・住所・書類の画像を取得し、目的の範囲でのみ利用します。'],
  ['charge', '口座からのチャージ（引き落とし）に関する規定', 'ご登録の口座から、ご指定の金額を引き落としてチャージします。上限は登録後に変更できます。'],
];

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const yen = (n) => n.toLocaleString('ja-JP') + '円';
const demo = (t) => `<div class="demo">デモ：${t}</div>`;
const hira = (s) => s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60)).toLowerCase();
const norm = (s) => s.replace(/[\s　]+/g, ' ').trim();
const bankObj = () => BANKS.find((b) => b.n === state.bank);

const fresh = () => ({
  cur: 'intro',
  agreed: {}, phoneOk: false, phone: { sent: false, resent: 0 },
  bank: '', bankq: '', bankType: 'すべて', method: '', notice: '',
  acctType: '普通預金', branch: '', number: '', kana: '', birth: { y: '', m: '', d: '' },
  kyc: { doc: '', how: 'shoot', shots: {}, tries: {}, icDone: false, icTries: 0, face: false, faceTries: 0, done: false },
  addr: '東京都千代田区丸の内1-2-3',
  bankOk: false, tries: { bank: 0, otp: 0, pin: 0 }, lock: { bank: false, pin: false }, pinOk: false,
  limit: 30000, auto: { on: false, below: 3000, amount: 10000 },
  returnTo: '', icpwTmp: '', errors: {}, topics: {}, failCount: 0, idleTimer: null, waitTimer: null, resume: null, kycErr: '',
});
const state = fresh();

// ---------- 途中保存（このタブの間だけ。暗証番号・パスワード・認証コードは保存しない） ----------
const DRAFT_KEY = 'payRegDraft';
const SAVE_KEYS = ['cur', 'agreed', 'phoneOk', 'bank', 'method', 'acctType', 'branch', 'number', 'kana', 'birth', 'kyc', 'addr', 'bankOk', 'pinOk', 'limit', 'auto'];
function saveDraft() {
  try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify(Object.fromEntries(SAVE_KEYS.map((k) => [k, state[k]])))); } catch (e) {}
}
function loadDraft() {
  try { return JSON.parse(sessionStorage.getItem(DRAFT_KEY) || 'null'); } catch (e) { return null; }
}
function clearDraft() { try { sessionStorage.removeItem(DRAFT_KEY); } catch (e) {} }

// ---------- 流れ（登録方法と書類で変わる） ----------
function flow() {
  const f = ['intro', 'terms', 'phone', 'bank', 'method', 'account', 'person', 'kyc-doc'];
  f.push(state.kyc.doc === 'マイナンバーカード' && state.kyc.how === 'ic' ? 'kyc-ic' : 'kyc-shoot');
  f.push('kyc-face', 'kyc-info', 'kyc-wait');
  if (state.method === 'web') f.push('bank-login', 'bank-otp', 'bank-approve'); else f.push('pin');
  f.push('limit', 'confirm', 'done');
  return f;
}
const nextOf = (id) => { const f = flow(); return f[f.indexOf(id) + 1]; };
const prevOf = (id) => { const f = flow(); return f[f.indexOf(id) - 1]; };

function go(id) {
  clearTimeout(state.waitTimer);
  state.cur = id; state.errors = {}; state.topics = {}; state.failCount = 0;
  state.icpwTmp = '';
  if (id === 'done') clearDraft(); else saveDraft();
  render();
  window.scrollTo(0, 0);
}

function setErr(field, msg, topic = '') {
  state.errors[field] = msg; state.topics[field] = topic;
  const el = $('e-' + field); if (el) el.textContent = msg || '';
  const inp = $(field); if (inp) inp.classList.toggle('bad', !!msg);
}
const nav = (label = '次へ', disabled = false) =>
  `<button class="primary" id="next" ${disabled ? 'disabled' : ''}>${label}</button><button class="ghost" id="later">あとで続ける</button>`;
const later = '<button class="ghost" id="later">あとで続ける</button>';

// ---------- 各画面 ----------
const S = {};

S.intro = { p: 0, title: '登録の流れ', render(v) {
  const d = state.resume;
  v.innerHTML = `${d ? `<div class="resume"><b>前回の続きがあります</b>
      <div class="sub">「${esc(S[d.cur].title)}」まで進んでいます</div>
      <div class="btnrow"><button class="ghost" id="restart">最初から</button><button class="primary sm" id="resume">続きから再開</button></div></div>` : ''}
    <h2>銀行口座を登録しましょう</h2>
    <p class="lead">登録すると、アプリの残高へのチャージや、お支払い元として使えます。所要時間はおよそ <b>5〜10分</b> です。</p>
    <div class="flow-chips">${PHASES.map((n, i) => `<span>${i + 1} ${n}</span>`).join('<em>›</em>')}</div>
    <h3>準備するもの</h3>
    <ul class="check-list">
      <li>キャッシュカード または 通帳</li>
      <li>本人確認書類（マイナンバーカード・運転免許証・在留カードのいずれか）</li>
      <li>SMSを受け取れるスマートフォン</li>
      <li>ネットバンキングのログイン情報（金融機関のサイトで承認する場合のみ）</li>
    </ul>
    <div class="note">入力内容は自動で保存されます。途中で「あとで続ける」を押しても、このタブなら続きから再開できます。</div>
    ${nav('はじめる')}`;
  if ($('resume')) $('resume').onclick = () => { const dr = state.resume; Object.assign(state, dr, { resume: null }); go(dr.cur); };
  if ($('restart')) $('restart').onclick = () => { clearDraft(); state.resume = null; render(); };
} };

S.terms = { p: 0, title: '規約への同意', render(v) {
  const all = () => TERMS.every(([id]) => state.agreed[id]);
  v.innerHTML = `<h2>規約への同意</h2><p class="lead">内容をご確認のうえ、すべてに同意してください。</p>
    <label class="chk all"><input type="checkbox" id="agree-all" ${all() ? 'checked' : ''}> すべてに同意する</label>
    ${TERMS.map(([id, t, body]) => `<details class="term"><summary>${t}</summary><p>${body}</p></details>
      <label class="chk"><input type="checkbox" data-agree="${id}" ${state.agreed[id] ? 'checked' : ''}> 「${t}」に同意する</label>`).join('')}
    ${nav('同意して次へ', !all())}`;
  const sync = () => {
    $('agree-all').checked = all(); $('next').disabled = !all();
    v.querySelectorAll('[data-agree]').forEach((c) => { c.checked = !!state.agreed[c.dataset.agree]; });
    saveDraft();
  };
  $('agree-all').onchange = (e) => { TERMS.forEach(([id]) => { state.agreed[id] = e.target.checked; }); sync(); };
  v.querySelectorAll('[data-agree]').forEach((c) => { c.onchange = () => { state.agreed[c.dataset.agree] = c.checked; sync(); }; });
} };

S.phone = { p: 0, title: '電話番号の確認', render(v) {
  const ph = state.phone;
  if (state.phoneOk) {
    v.innerHTML = `<h2>電話番号の確認</h2><div class="okline">✓ 電話番号の確認が済んでいます</div>${nav()}`;
  } else if (!ph.sent) {
    v.innerHTML = `<h2>電話番号の確認</h2>
      <p class="lead">アカウントに登録されている電話番号 <b>090-****-1234</b> に、SMSで認証コード（6桁）を送ります。</p>
      <button class="primary" id="sendsms">認証コードを送信</button>${later}`;
    $('sendsms').onclick = () => { ph.sent = true; render(); };
  } else {
    v.innerHTML = `<h2>電話番号の確認</h2>
      <p class="lead"><b>090-****-1234</b> に認証コードを送りました。届いた6桁のコードを入力してください。</p>
      ${ph.resent ? `<div class="note">認証コードを再送しました（${ph.resent}回目）</div>` : ''}
      <label>認証コード（6桁）</label>
      <input id="smscode" inputmode="numeric" maxlength="6" autocomplete="one-time-code">
      <div class="err" id="e-smscode"></div>${demo(`認証コードは ${DEMO.sms}`)}
      <button class="link" id="resend">コードが届かない・再送する</button>
      ${nav('認証する')}`;
    $('resend').onclick = () => { ph.resent++; render(); };
  }
}, check() {
  if (state.phoneOk) return true;
  if ($('smscode').value.trim() !== DEMO.sms) { setErr('smscode', '認証コードが違います。もう一度確認してください', '認証コードが違う'); return false; }
  state.phoneOk = true;
} };

function bankRows() {
  const q = hira(state.bankq.trim());
  const list = BANKS.filter((b) => (state.bankType === 'すべて' || b.t === state.bankType) && (!q || hira(b.n).includes(q) || b.k.includes(q)));
  return list.length
    ? list.map((b) => `<button class="bank-row ${state.bank === b.n ? 'sel' : ''}" data-bank="${esc(b.n)}"><span>${esc(b.n)}</span>${b.maint ? '<span class="tag warn">メンテナンス中</span>' : `<span class="tag">${b.t}</span>`}</button>`).join('')
    : `<div class="note">「${esc(state.bankq)}」に一致する金融機関が見つかりません。信用金庫・信用組合・農協などは、このプロトタイプでは未対応です。</div>`;
}
S.bank = { p: 1, title: '金融機関を選択', render(v) {
  v.innerHTML = `<h2>登録する金融機関を選んでください</h2>
    <p class="lead">アプリの残高へのチャージに使う口座を登録します。</p>
    <input id="bankq" placeholder="金融機関名で検索（例：みずほ、ゆうちょ）" value="${esc(state.bankq)}" autocomplete="off">
    <div class="fchips">${BANK_TYPES.map((t) => `<button data-type="${t}" class="${state.bankType === t ? 'sel' : ''}">${t}</button>`).join('')}</div>
    <div id="banklist"></div><div class="err" id="e-bank"></div>
    ${nav('次へ', !state.bank || !!bankObj()?.maint)}`;
  const refresh = () => {
    $('banklist').innerHTML = bankRows();
    $('banklist').querySelectorAll('[data-bank]').forEach((b) => { b.onclick = () => {
      if (state.bank !== b.dataset.bank) { state.bank = b.dataset.bank; state.method = ''; state.bankOk = false; state.pinOk = false; }
      const o = bankObj();
      setErr('bank', o.maint ? `${o.n}はただいまメンテナンス中のため、登録できません。時間をおいて、もう一度お試しください（目安：翌朝6:00まで）。` : '', 'メンテナンス');
      refresh(); $('next').disabled = !!o.maint; saveDraft();
    }; });
  };
  v.querySelectorAll('[data-type]').forEach((b) => { b.onclick = () => { state.bankType = b.dataset.type; v.querySelectorAll('[data-type]').forEach((x) => x.classList.toggle('sel', x === b)); refresh(); }; });
  $('bankq').oninput = (e) => { state.bankq = e.target.value; refresh(); };
  refresh();
  if (bankObj()?.maint) setErr('bank', `${state.bank}はただいまメンテナンス中のため、登録できません。`, 'メンテナンス');
} };

S.method = { p: 1, title: '登録方法を選択', render(v) {
  const o = bankObj();
  if (!o.m.includes(state.method)) state.method = o.m[0];
  const notice = state.notice; state.notice = '';
  v.innerHTML = `<h2>${esc(o.n)}の登録方法</h2>
    ${notice ? `<div class="warnline">${esc(notice)}</div>` : ''}
    <p class="lead">${o.m.length > 1 ? 'この金融機関では、次の方法で登録できます。' : `この金融機関は、次の方法のみ対応しています。`}</p>
    ${o.m.map((m) => `<button class="opt ${state.method === m ? 'sel' : ''}" data-m="${m}"><b>${METHODS[m].title}</b><small>${METHODS[m].note}</small></button>`).join('')}
    ${nav()}`;
  v.querySelectorAll('[data-m]').forEach((b) => { b.onclick = () => { state.method = b.dataset.m; state.bankOk = false; state.pinOk = false; render(); saveDraft(); }; });
} };

S.account = { p: 1, title: '口座情報を入力', render(v) {
  const yucho = state.bank === 'ゆうちょ銀行';
  v.innerHTML = `<h2>${esc(state.bank)}の口座情報</h2>
    <label>預金種別</label>
    <select id="acctType">${['普通預金', '貯蓄預金', '当座預金'].map((t) => `<option ${state.acctType === t ? 'selected' : ''}>${t}</option>`).join('')}</select>
    <div class="err" id="e-acctType"></div>
    <label>${yucho ? '記号（5桁）' : '支店番号（3桁）'}</label>
    <input id="branch" inputmode="numeric" value="${esc(state.branch)}" maxlength="${yucho ? 5 : 3}">
    <div class="err" id="e-branch"></div>
    <label>${yucho ? '番号（最大8桁）' : '口座番号（7桁）'}</label>
    <input id="number" inputmode="numeric" value="${esc(state.number)}" maxlength="8">
    <div class="err" id="e-number"></div>
    <button class="link" data-ask="支店番号がわからない">支店番号・口座番号の調べ方</button>
    <div class="note">キャッシュカードや通帳の表紙・見開きに記載されています。</div>
    ${nav()}`;
}, check() {
  let ok = true;
  const yucho = state.bank === 'ゆうちょ銀行';
  state.acctType = $('acctType').value; state.branch = $('branch').value.trim(); state.number = $('number').value.trim();
  if (state.acctType === '当座預金') { setErr('acctType', '当座預金は、チャージ用の口座として登録できません。普通預金または貯蓄預金を選んでください', '当座'); ok = false; }
  if (!/^\d+$/.test(state.branch) || state.branch.length !== (yucho ? 5 : 3)) { setErr('branch', yucho ? '記号は5桁の数字で入力してください' : '支店番号は3桁の数字で入力してください', '支店'); ok = false; }
  if (!/^\d+$/.test(state.number) || (yucho ? state.number.length > 8 : state.number.length !== 7)) { setErr('number', yucho ? '番号は8桁以内の数字で入力してください' : '口座番号は7桁の数字で入力してください', '口座番号'); ok = false; }
  return ok;
} };

S.person = { p: 1, title: '口座名義と生年月日', render(v) {
  const b = state.birth, yr = new Date().getFullYear();
  const opts = (from, to, sel, unit) => `<option value="">${unit}</option>` + Array.from({ length: to - from + 1 }, (_, i) => { const n = from + i; return `<option value="${n}" ${String(sel) === String(n) ? 'selected' : ''}>${n}</option>`; }).join('');
  v.innerHTML = `<h2>口座名義と生年月日</h2>
    <p class="lead">アカウントのご本人名義の口座のみ登録できます。</p>
    <label>口座名義（全角カタカナ）</label>
    <input id="kana" value="${esc(state.kana)}" placeholder="ヤマダ タロウ">
    <div class="err" id="e-kana"></div>${demo(`アカウントの氏名は「${DEMO_NAME}」です`)}
    <label>生年月日</label>
    <div class="btnrow" style="margin-top:0"><select id="by">${opts(yr - 100, yr - 10, b.y, '年')}</select><select id="bm">${opts(1, 12, b.m, '月')}</select><select id="bd">${opts(1, 31, b.d, '日')}</select></div>
    <div class="err" id="e-birth"></div>
    ${nav()}`;
}, check() {
  let ok = true;
  state.kana = $('kana').value.trim();
  if (!/^[ァ-ヶー　 ]+$/.test(state.kana)) { setErr('kana', '全角カタカナで入力してください', 'カナ'); ok = false; }
  else if (norm(state.kana) !== DEMO_NAME) { setErr('kana', `アカウントの氏名（${DEMO_NAME}）と、口座名義が一致しません。ご本人名義の口座のみ登録できます`, '名義が一致しない'); ok = false; }
  state.birth = { y: $('by').value, m: $('bm').value, d: $('bd').value };
  const { y, m, d } = state.birth, dt = new Date(+y, +m - 1, +d);
  if (!y || !m || !d || dt.getMonth() !== +m - 1) { setErr('birth', '生年月日を正しく選んでください', '生年月日'); ok = false; }
  else {
    const t = new Date(); let age = t.getFullYear() - +y;
    if (t.getMonth() + 1 < +m || (t.getMonth() + 1 === +m && t.getDate() < +d)) age--;
    if (age < 18) { setErr('birth', '18歳未満の方は、このアプリでは登録できません（保護者の同意が必要なため）', '18歳未満'); ok = false; }
  }
  return ok;
} };

S['kyc-doc'] = { p: 2, title: '本人確認書類を選択', render(v) {
  const k = state.kyc;
  v.innerHTML = `<h2>本人確認書類を選んでください</h2>
    <p class="lead">犯罪収益移転防止法に基づき、本人確認を行います（デモのため実際には撮影・読み取りしません）。</p>
    ${Object.entries(DOCS).map(([d, o]) => `<button class="opt ${k.doc === d ? 'sel' : ''}" data-doc="${d}"><b>${d}</b><small>${o.note}</small></button>`).join('')}
    ${k.doc === 'マイナンバーカード' ? `<h3>確認の方法</h3>
      <button class="opt sub-opt ${k.how === 'ic' ? 'sel' : ''}" data-how="ic"><b>ICチップを読み取る（おすすめ）</b><small>署名用電子証明書のパスワード（英数字6〜16文字）が必要です。スマホにカードをかざします。</small></button>
      <button class="opt sub-opt ${k.how === 'shoot' ? 'sel' : ''}" data-how="shoot"><b>書類を撮影する</b><small>表面と厚みを撮影します。裏面（個人番号）は撮影しません。</small></button>` : ''}
    <div class="note">お手元にない場合は「あとで続ける」で中断できます。入力内容は保存されます。</div>
    ${nav('次へ', !k.doc)}`;
  v.querySelectorAll('[data-doc]').forEach((b) => { b.onclick = () => { if (k.doc !== b.dataset.doc) { k.doc = b.dataset.doc; k.how = k.doc === 'マイナンバーカード' ? 'ic' : 'shoot'; k.shots = {}; k.tries = {}; k.icDone = false; k.icTries = 0; } render(); saveDraft(); }; });
  v.querySelectorAll('[data-how]').forEach((b) => { b.onclick = () => { k.how = b.dataset.how; k.shots = {}; k.icDone = false; render(); saveDraft(); }; });
} };

S['kyc-ic'] = { p: 2, title: 'マイナンバーカードの読み取り', render(v) {
  const k = state.kyc;
  v.innerHTML = `<h2>マイナンバーカードを読み取ります</h2>
    <p class="lead">「署名用電子証明書のパスワード」を入力し、スマートフォンの上部にカードをかざします。</p>
    <label>署名用電子証明書のパスワード（英数字6〜16文字）</label>
    <input id="icpw" type="password" maxlength="16" autocomplete="off" value="${esc(state.icpwTmp)}">
    <div class="err" id="e-icpw"></div>${demo('英数字6〜16文字なら何でもOK。1回目はわざと読み取りに失敗します')}
    <div class="oval-card ${k.icDone ? 'ok' : ''}">${k.icDone ? '✓' : '📱 ＋ 💳'}</div>
    <div class="err" id="e-ic">${esc(state.errors.ic || '')}</div>
    ${k.icDone ? `<div class="okline">✓ 読み取りが完了しました</div>${nav()}` : `<button class="primary" id="scan">読み取りを開始</button>${later}`}`;
  if ($('scan')) $('scan').onclick = () => {
    state.errors = {}; state.icpwTmp = $('icpw').value; // 失敗後も入れ直さずに済むよう、この画面の間だけ覚える（保存はしない）
    if (!/^[A-Za-z0-9]{6,16}$/.test($('icpw').value)) { setErr('icpw', 'パスワードは英数字6〜16文字です', '署名用'); return fail(); }
    k.icTries++;
    if (k.icTries === 1) { state.errors.ic = 'カードを読み取れませんでした。カードを動かさず、スマートフォンの位置を変えてもう一度かざしてください'; state.topics.ic = 'かざす'; fail(); }
    else { k.icDone = true; }
    render(); saveDraft();
  };
} };

S['kyc-shoot'] = { p: 2, title: '書類の撮影', render(v) {
  const k = state.kyc, shots = DOCS[k.doc].shots;
  v.innerHTML = `<h2>${esc(k.doc)}を撮影します</h2>
    <p class="lead">${k.doc === 'マイナンバーカード' ? '表面と厚みを撮影します。<b>裏面（個人番号）は撮影しないでください。</b>' : '枠に収まるように、順番に撮影してください。'}</p>
    ${shots.map((id) => `<label>${SHOT_NAMES[id]}</label><button class="shot ${k.shots[id] ? 'ok' : ''}" data-shot="${id}">${k.shots[id] ? '✓ 撮影済み' : '📷 撮影する'}</button>`).join('')}
    <div class="err" id="e-kyc">${esc(state.errors.kyc || '')}</div>${demo('表面の1回目は、わざと失敗します')}
    ${nav('次へ', !shots.every((id) => k.shots[id]))}`;
  v.querySelectorAll('[data-shot]').forEach((b) => { b.onclick = () => {
    const id = b.dataset.shot; k.tries[id] = (k.tries[id] || 0) + 1;
    if (SHOT_ERRORS[id] && k.tries[id] === 1) { state.errors = { kyc: SHOT_ERRORS[id] }; state.topics = { kyc: '反射' }; fail(); }
    else { k.shots[id] = true; state.errors = {}; $('hint').style.display = 'none'; }
    render(); saveDraft();
  }; });
} };

S['kyc-face'] = { p: 2, title: '顔の撮影', render(v) {
  const k = state.kyc;
  v.innerHTML = `<h2>顔を撮影します</h2>
    <p class="lead">画面の枠に顔を合わせ、案内に従って、ゆっくり首を左右に振ってください。明るい場所で、帽子・マスク・サングラスは外します。</p>
    <div class="oval ${k.face ? 'ok' : ''}">${k.face ? '✓' : '🙂'}</div>
    <div class="err center" id="e-face">${esc(state.errors.face || '')}</div>${demo('1回目は、わざと失敗します')}
    ${k.face ? `<div class="okline">✓ 撮影が完了しました</div>${nav()}` : `<button class="primary" id="faceBtn">撮影を開始</button>${later}`}`;
  if ($('faceBtn')) $('faceBtn').onclick = () => {
    k.faceTries++;
    if (k.faceTries === 1) { state.errors = { face: '顔が枠に収まっていないか、暗すぎます。明るい場所でもう一度お試しください' }; state.topics = { face: '顔' }; fail(); }
    else { k.face = true; state.errors = {}; $('hint').style.display = 'none'; }
    render(); saveDraft();
  };
} };

S['kyc-info'] = { p: 2, title: '読み取り内容の確認', render(v) {
  v.innerHTML = `<h2>読み取った内容を確認してください</h2>
    <p class="lead">書類から読み取った内容です。記載と異なる場合は、住所を修正してください。</p>
    <div class="sum"><div><span>氏名</span><b>山田 太郎</b></div><div><span>生年月日</span><b>${esc(state.birth.y)}年${esc(state.birth.m)}月${esc(state.birth.d)}日</b></div></div>
    <label>住所</label><input id="addr" value="${esc(state.addr)}">
    <div class="err" id="e-addr"></div>
    <div class="note">住所は、本人確認書類の記載と一致している必要があります。引っ越し後に書類を更新していない場合は、書類の住所変更を先に行ってください。</div>
    ${nav('この内容で送信')}`;
}, check() {
  state.addr = $('addr').value.trim();
  if (state.addr.length < 6) { setErr('addr', '住所を入力してください（都道府県から）', '住所'); return false; }
} };

S['kyc-wait'] = { p: 2, title: '本人確認の審査', render(v) {
  if (state.kyc.done) {
    v.innerHTML = `<div class="center"><div class="big" style="font-size:56px;color:var(--ok)">✓</div><h2>本人確認が完了しました</h2><p class="lead">次は、${esc(state.bank)}での認証です。</p></div>${nav()}`;
  } else {
    v.innerHTML = `<div class="center"><div class="spin"></div><h2>本人確認の審査中です</h2>
      <p class="lead">通常は数分で終わります。混み合っているときは、最大で1営業日かかることがあります。この画面のままお待ちください。</p></div>${later}`;
    state.waitTimer = setTimeout(() => { state.kyc.done = true; saveDraft(); if (state.cur === 'kyc-wait') render(); }, 2500);
  }
} };

const bankFrame = (inner, title) => `<div class="leave">🔒 ここから先は <b>${esc(state.bank)}</b> のサイト（画面）です。アプリを離れて、${esc(state.bank)}の画面で認証します。</div>
  <div class="bankframe"><div class="bar">🏦 ${esc(state.bank)} ｜ ${title}</div><div class="inner">${inner}</div></div>`;

S['bank-login'] = { p: 3, title: `金融機関のサイトにログイン`, render(v) {
  if (state.lock.bank) {
    v.innerHTML = bankFrame(`<div class="warnline">ログインに連続して失敗したため、一時的にロックしました。${esc(state.bank)}にお問い合わせください。</div>${demo('下のボタンでロックを解除できます')}<button class="primary" id="unlock">ロックを解除（デモ）</button>`, 'ログイン');
    $('unlock').onclick = () => { state.lock.bank = false; state.tries.bank = 0; render(); };
    return;
  }
  v.innerHTML = bankFrame(`<label>ログインID（またはお客様番号）</label><input id="blid" autocomplete="off">
    <label>ログインパスワード</label><input id="blpw" type="password" autocomplete="off">
    <div class="err" id="e-blpw"></div>${demo(`パスワードは ${DEMO.bankPw}（IDは何でもOK）`)}`, 'ネットバンキング ログイン') + nav('ログイン');
}, check() {
  if (state.lock.bank) return false;
  if (!$('blid').value.trim() || $('blpw').value !== DEMO.bankPw) {
    state.tries.bank++;
    if (state.tries.bank >= 3) { state.lock.bank = true; render(); return false; }
    setErr('blpw', `IDまたはパスワードが違います（あと${3 - state.tries.bank}回でロックされます）`, 'ロック'); return false;
  }
  state.tries.bank = 0;
} };

S['bank-otp'] = { p: 3, title: 'ワンタイムパスワード', render(v) {
  const net = bankObj().t === 'ネット銀行';
  v.innerHTML = bankFrame(`<p class="lead" style="margin-top:12px">${net ? `${esc(state.bank)}のアプリに表示される「認証コード」（6桁）を入力してください。` : '登録されているメールアドレス・電話番号に送られた、ワンタイムパスワード（6桁）を入力してください。'}</p>
    <label>${net ? '認証コード' : 'ワンタイムパスワード'}（6桁）</label><input id="otp" inputmode="numeric" maxlength="6" autocomplete="one-time-code">
    <div class="err" id="e-otp"></div>${demo(`${DEMO.otp}`)}`, '本人認証') + nav('認証する');
}, check() {
  if ($('otp').value.trim() !== DEMO.otp) { state.tries.otp++; setErr('otp', 'ワンタイムパスワードが違うか、有効期限が切れています。もう一度確認してください', 'ワンタイムパスワード'); return false; }
  state.tries.otp = 0;
} };

S['bank-approve'] = { p: 3, title: '口座情報の提供を承認', render(v) {
  v.innerHTML = bankFrame(`<p class="lead" style="margin-top:12px">次の情報を、アプリに提供し、チャージのための引き落としを許可しますか？</p>
    <div class="sum"><div><span>提供する情報</span><b>口座名義・口座番号</b></div><div><span>許可する内容</span><b>ご指定額の引き落とし</b></div><div><span>提供しない情報</span><b>残高・取引履歴</b></div></div>
    <div class="btnrow"><button class="ghost" id="deny">許可しない</button><button class="primary sm" id="allow">許可して戻る</button></div>`, '連携の承認');
  $('allow').onclick = () => { state.bankOk = true; go(nextOf('bank-approve')); };
  $('deny').onclick = () => { state.notice = '口座情報の提供が許可されなかったため、登録を中断しました。もう一度、登録方法を選んでください。'; go('method'); };
} };

S.pin = { p: 3, title: 'キャッシュカードの暗証番号', render(v) {
  if (state.lock.pin) {
    v.innerHTML = `<h2>暗証番号がロックされました</h2><div class="warnline">暗証番号を連続して間違えたため、一時的にロックしました。キャッシュカードのロックは、${esc(state.bank)}の窓口またはお電話で解除してください。</div>${demo('下のボタンでロックを解除できます')}<button class="primary" id="unlock">ロックを解除（デモ）</button>${later}`;
    $('unlock').onclick = () => { state.lock.pin = false; state.tries.pin = 0; render(); };
    return;
  }
  v.innerHTML = `<h2>${esc(state.bank)}のキャッシュカードの暗証番号</h2>
    <p class="lead">キャッシュカードの暗証番号（4桁）を入力してください。入力した暗証番号は、このアプリには保存されません。</p>
    <label>暗証番号（4桁）</label><input id="pin" type="password" inputmode="numeric" maxlength="4" autocomplete="off">
    <div class="err" id="e-pin"></div>${demo(`暗証番号は ${DEMO.pin}`)}
    ${nav('認証する')}`;
}, check() {
  if (state.lock.pin) return false;
  if ($('pin').value !== DEMO.pin) {
    state.tries.pin++;
    if (state.tries.pin >= 3) { state.lock.pin = true; render(); return false; }
    setErr('pin', `暗証番号が違います（あと${3 - state.tries.pin}回でロックされます）`, '暗証番号を間違えた'); return false;
  }
  state.tries.pin = 0; state.pinOk = true;
} };

S.limit = { p: 4, title: 'チャージの設定', render(v) {
  const a = state.auto;
  const sel = (id, list, val) => `<select id="${id}">${list.map((n) => `<option value="${n}" ${n === val ? 'selected' : ''}>${yen(n)}</option>`).join('')}</select>`;
  v.innerHTML = `<h2>チャージの設定</h2>
    <p class="lead">あとから「口座の管理」でいつでも変更できます。</p>
    <label>1回あたりのチャージ上限</label>${sel('limit', LIMITS, state.limit)}
    <label class="switch"><span>オートチャージ（残高が少なくなったら自動でチャージ）</span><input type="checkbox" id="autoOn" ${a.on ? 'checked' : ''}></label>
    <div id="autoBox" ${a.on ? '' : 'hidden'}>
      <label>残高が次の金額を下回ったら</label>${sel('autoBelow', [1000, 3000, 5000], a.below)}
      <label>この金額をチャージする</label>${sel('autoAmount', [5000, 10000, 20000, 50000], a.amount)}
      <div class="err" id="e-auto"></div>
    </div>
    ${nav('内容の確認へ')}`;
  $('autoOn').onchange = (e) => { a.on = e.target.checked; $('autoBox').hidden = !a.on; };
}, check() {
  state.limit = +$('limit').value; const a = state.auto;
  a.on = $('autoOn').checked; a.below = +$('autoBelow').value; a.amount = +$('autoAmount').value;
  if (a.on && a.amount > state.limit) { setErr('auto', 'オートチャージの金額は、1回あたりのチャージ上限以下にしてください', 'オートチャージ'); return false; }
} };

S.confirm = { p: 4, title: '登録内容の確認', render(v) {
  const a = state.auto, yucho = state.bank === 'ゆうちょ銀行';
  const row = (name, val, to) => `<div><span>${name}</span><b>${esc(val)}${to ? `<button data-goto="${to}">修正</button>` : ''}</b></div>`;
  v.innerHTML = `<h2>登録内容をご確認ください</h2>
    <div class="sum">
      ${row('金融機関', state.bank, 'bank')}
      ${row('登録方法', METHODS[state.method].title, 'method')}
      ${row('預金種別', state.acctType, 'account')}
      ${row(yucho ? '記号' : '支店番号', state.branch, 'account')}
      ${row(yucho ? '番号' : '口座番号', '***' + state.number.slice(-4), 'account')}
      ${row('口座名義', norm(state.kana), 'person')}
      ${row('チャージ上限', yen(state.limit), 'limit')}
      ${row('オートチャージ', a.on ? `${yen(a.below)}未満で${yen(a.amount)}` : 'しない', 'limit')}
    </div>
    <div class="note">「この内容で登録する」を押すと、口座の登録が完了します。登録の通知はSMSでお知らせします。</div>
    ${nav('この内容で登録する')}`;
  v.querySelectorAll('[data-goto]').forEach((b) => { b.onclick = () => {
    const to = b.dataset.goto;
    // 口座情報・名義・チャージ設定の修正は、直したらここへ戻る。銀行・登録方法を変えたら、認証からやり直す。
    state.returnTo = ['account', 'person', 'limit'].includes(to) ? 'confirm' : '';
    if (!state.returnTo) { state.bankOk = false; state.pinOk = false; }
    go(to);
  }; });
} };

S.done = { p: 4, title: '登録完了', render(v) {
  const yucho = state.bank === 'ゆうちょ銀行';
  v.innerHTML = `<div class="center"><div class="big" style="font-size:56px;color:var(--ok)">✓</div><h2>口座の登録が完了しました</h2>
    <p class="lead">${esc(state.bank)}（***${esc(state.number.slice(-4))}）からチャージできます。<br>登録のお知らせを、SMSで送りました。</p></div>
    <div class="sum"><div><span>チャージ上限</span><b>${yen(state.limit)}／回</b></div><div><span>オートチャージ</span><b>${state.auto.on ? 'あり' : 'なし'}</b></div></div>
    <a class="primary" href="index.html" style="text-decoration:none;text-align:center">ホームに戻る</a>
    <button class="ghost" id="another">もう1つ口座を登録する</button>`;
  $('another').onclick = () => { Object.assign(state, fresh()); clearDraft(); render(); window.scrollTo(0, 0); };
} };

// 失敗が続いたら、AIサポートを案内する
function fail() {
  state.failCount++;
  if (state.failCount >= 2) nudge('お困りですか？AIがお手伝いします');
}

// ---------- 画面の描画と進む・戻る ----------
function render() {
  clearTimeout(state.waitTimer);
  const f = flow(), idx = f.indexOf(state.cur), def = S[state.cur];
  $('phases').innerHTML = PHASES.map((name, p) => {
    const ids = f.filter((id) => S[id].p === p);
    const done = ids.filter((id) => f.indexOf(id) < idx).length;
    return `<div class="phase ${def.p === p ? 'on' : ''}"><i><b style="width:${Math.round((done / ids.length) * 100)}%"></b></i><span>${name}</span></div>`;
  }).join('');
  $('stepLabel').textContent = `STEP ${idx + 1} / ${f.length}：${def.title}`;
  const v = $('view');
  def.render(v);
  if ($('next')) $('next').onclick = submit;
  if ($('later')) $('later').onclick = () => { saveDraft(); location.href = 'index.html'; };
  v.querySelectorAll('[data-ask]').forEach((b) => { b.onclick = () => { openSheet(); ask(b.dataset.ask); }; });
  v.querySelectorAll('input, select').forEach((i) => i.addEventListener('input', resetIdle));
  resetIdle();
}

function submit() {
  const def = S[state.cur];
  state.errors = {}; state.topics = {};
  if (def.check && def.check() === false) { fail(); return; }
  state.failCount = 0;
  if (state.cur === 'confirm') return go('done');
  if (state.returnTo && state.returnTo !== state.cur) { const to = state.returnTo; state.returnTo = ''; return go(to); }
  go(nextOf(state.cur));
}

$('back').onclick = () => {
  const p = prevOf(state.cur);
  if (state.cur === 'done' || !p) { location.href = 'index.html'; return; }
  state.returnTo = '';
  go(p);
};

// ---------- AIサポート（いまの画面とエラーに合わせて答える） ----------
// s を付けた項目は、その画面にいるときに優先する
const KB = [
  { s: ['phone'], k: ['違う', '間違'], a: () => '認証コードは6桁の数字です。最新のSMSのコードを入力してください（再送すると、前のコードは使えなくなります）。' },
  { s: ['phone'], k: ['届かない', 'SMS', 'コード', '再送', '来ない'], a: () => 'SMSが届かないときは、次を試してください。\n・電波の良い場所で、少し待つ（最大1〜2分）\n・迷惑SMSフィルターや、ドメイン指定受信の設定を確認する\n・「コードが届かない・再送する」を押す\n番号が古い場合は、アカウントの電話番号を変更してから、もう一度お試しください。' },
  { s: ['terms'], k: ['同意', '規約', '個人情報', '必要'], a: () => 'すべてに同意しないと、次に進めません。内容は各項目の「▼」で確認できます。同意しない場合は、口座の登録はできません。' },
  { s: ['bank'], k: ['メンテナンス', '登録できない', '選べない'], a: () => 'メンテナンス中の金融機関は、登録できません。終了後にもう一度お試しください（目安：翌朝6:00まで）。ほかの金融機関の口座をお持ちなら、そちらも選べます。' },
  { s: ['bank'], k: ['銀行がない', '見つから', '対応', '使える銀行', '信用金庫', '農協'], a: () => '検索で見つからない金融機関は、このプロトタイプでは選べません。実際のサービスでは、信用金庫・信用組合・農協なども探せる想定です。' },
  { s: ['method'], k: ['違い', 'どっち', '方法', 'ネットバンキング', '暗証番号で', 'Web'], a: () => '登録方法は2つあります。\n・金融機関のサイトで承認：ネットバンキングの契約が必要。ログイン→ワンタイムパスワード→承認で、約3分。\n・キャッシュカードの暗証番号：契約は不要。口座情報＋暗証番号で、約1分。\n金融機関によって、選べる方法が決まっています。' },
  { s: ['account'], k: ['当座', '貯蓄', '預金種別', '種別'], a: () => '登録できるのは、普通預金と貯蓄預金です。当座預金は、チャージ用の口座として使えません。通帳の「種別」で確認できます。' },
  { s: ['person'], k: ['一致', '名義', '違う'], a: () => 'アカウントの氏名と、口座の名義が一致しないと登録できません。ご家族名義の口座は使えません。\n口座名義は、通帳やキャッシュカードの表記（全角カタカナ）のとおりに入力します。姓と名の間にスペースを入れてください。' },
  { s: ['person'], k: ['18', '未成年', '生年月日', '年齢'], a: () => '18歳未満の方は、保護者の同意が必要なため、このアプリでは口座を登録できません。生年月日が合っているか、確認してください。' },
  { s: ['kyc-doc'], k: ['どれ', '書類', '何が', 'IC', 'おすすめ'], a: () => '使える書類は、マイナンバーカード・運転免許証・在留カードです。\nマイナンバーカードなら、ICチップの読み取りが早くておすすめです（署名用電子証明書のパスワードが必要）。\n通知カード、健康保険証、パスポートは使えません。' },
  { s: ['kyc-ic'], k: ['読み取れ', 'かざ', 'NFC', 'IC', 'うまく'], a: () => 'ICチップの読み取りのコツです。\n・スマートフォンのケースやカードケースを外す\n・スマートフォンの背面上部（機種により位置が違います）に、カードをぴったり当てる\n・読み取り中は、カードも端末も動かさない\n・NFC（おサイフケータイ）の設定がオンか確認する' },
  { k: ['署名用', '6〜16', 'パスワードを忘れ', 'ロック', '市区町村'], a: () => 'マイナンバーカードには、用途ごとに別のパスワードがあります。\n・署名用電子証明書：英数字6〜16文字（今回使うもの）\n・利用者証明用：数字4桁\nパスワードを連続して間違えるとロックされます（署名用は5回、数字4桁のものは3回が目安）。忘れたとき・ロックされたときは、お住まいの市区町村の窓口で再設定します。' },
  { k: ['裏面', '個人番号', 'マイナンバーの裏'], a: () => 'マイナンバーカードを撮影するときは、裏面（個人番号が書かれている面）は撮影しないでください。表面と厚みだけで確認できます。' },
  { k: ['厚み', '斜め'], a: () => '厚みの撮影は、書類を斜めに傾け、書類の側面の厚みがわかるように撮ります。コピーや画像ではなく、実物であることを確認するためです。' },
  { k: ['反射', '撮影', '読み取れ', '表面', 'ピント', 'ぼや', 'ブレ'], a: () => '書類撮影のコツです。\n・照明の真下を避け、少し斜めから光が当たる場所で撮る\n・無地で暗めの机の上に置く\n・書類の四隅が枠に収まるようにし、ピントが合うまで1〜2秒待つ\n・ホログラムやICチップ部分の反射が出たら、スマホを少し傾ける' },
  { k: ['顔', '自撮り', 'セルフィー', '暗すぎ', '枠'], a: () => '顔写真のコツです。\n・明るい場所で、正面から光が当たるようにする（逆光はNG）\n・帽子・マスク・サングラスは外す\n・画面の枠に顔全体が収まる距離で、指示に合わせてゆっくり首を動かす' },
  { s: ['kyc-info'], k: ['住所', '引っ越', '変わっ', '違う'], a: () => '住所は、本人確認書類に書かれている住所と一致している必要があります。引っ越しをしている場合は、先に書類の住所変更（市区町村の窓口など）を行ってください。裏面に新しい住所の記載がある書類は、裏面も撮影してください。' },
  { k: ['住所', '引っ越', '変わっ'], a: () => '書類の住所が現在の住所と違う場合、裏面に新しい住所の記載があれば裏面も撮影してください。記載がない場合は、先に書類の住所変更を行ってください。' },
  { s: ['kyc-wait'], k: ['審査', '時間', '待', '終わらない', '通知'], a: () => '本人確認の審査は、通常は数分で終わります。混み合っているときは、最大で1営業日かかります。画面を閉じても、結果はSMSでお知らせします。「あとで続ける」から中断することもできます。' },
  { k: ['なぜ', '安全', '法律'], a: () => '本人確認は法律（犯罪収益移転防止法）で、口座からのチャージ前に必要と定められています。撮影した画像は本人確認の目的にのみ使用されます。' },
  { s: ['bank-login'], k: ['ログイン', 'ID', 'パスワード', '忘れ', 'ロック'], a: () => `${state.bank || '金融機関'}のネットバンキングのログインIDとパスワードが必要です。忘れた場合は、${state.bank || '金融機関'}のサイトで再設定してください。何度も間違えるとロックされるので、分からないときは無理に試さないでください。\nネットバンキングを使っていない場合は、前の画面で「キャッシュカードの暗証番号」の方法に変えられることがあります。` },
  { s: ['bank-otp'], k: ['ワンタイム', '認証コード', '届かない', '期限', 'アプリ'], a: () => 'ワンタイムパスワード（認証コード）は、有効期限が短いものです。期限が切れたときは、もう一度発行してください。ネット銀行では、銀行のアプリに表示されるコードを入力します。届かないときは、登録している電話番号・メールアドレスを確認してください。' },
  { s: ['bank-approve'], k: ['許可', '承認', '提供', '安全', '残高'], a: () => '提供するのは、口座名義と口座番号だけです。残高や取引履歴は、アプリには提供されません。「許可しない」を選ぶと登録は中断され、登録方法の選択に戻ります。' },
  { s: ['pin'], k: ['暗証', 'ロック', '忘れ', '間違'], a: () => `キャッシュカードの暗証番号（4桁）が必要です。入力した暗証番号は、アプリには保存されません。\n3回続けて間違えると、キャッシュカードが一時的にロックされます。ロックの解除と、暗証番号を忘れたときの再設定は、${state.bank || '金融機関'}の窓口またはお電話で行います。` },
  { k: ['暗証', 'パスワード', '認証', 'ワンタイム', 'ロック'], a: () => `${state.bank || '金融機関'}の認証では、キャッシュカードの暗証番号（4桁）やワンタイムパスワードが必要です。\n何度も間違えるとロックされる場合があるので、分からないときは無理に試さず金融機関にお問い合わせください。` },
  { s: ['limit'], k: ['上限', 'オートチャージ', '自動', '下回', '変更'], a: () => '「1回あたりのチャージ上限」は、一度にチャージできる金額です。オートチャージは、残高が設定額を下回ったときに自動でチャージする機能で、1回の金額は上限以下にする必要があります。どちらも、登録後に変更できます。' },
  { s: ['confirm', 'done'], k: ['変更', '解除', '削除', '消'], a: () => '登録した口座の変更・解除は、登録後に「口座の管理」から行えます（このプロトタイプでは未実装です）。登録内容は、この画面の「修正」から直せます。' },
  { k: ['時間', 'どのくらい', '所要', '何分'], a: () => '全体で、およそ5〜10分です。登録方法や書類によって前後します（暗証番号で登録する場合は、短めです）。本人確認の審査は、通常は数分、最大で1営業日です。' },
  { k: ['中断', '途中', 'あとで', '再開', '保存', '続き'], a: () => '入力内容は自動で保存されます。「あとで続ける」を押すとホームに戻り、このタブのままホームの「銀行口座登録」から開くと、「続きから再開」を選べます。暗証番号・パスワード・認証コードは保存されません。' },
  { k: ['準備', '用意', '必要なもの', '何が必要'], a: () => '準備するものは、キャッシュカードまたは通帳、本人確認書類（マイナンバーカード・運転免許証・在留カード）、SMSを受け取れるスマートフォンです。金融機関のサイトで承認する場合は、ネットバンキングのログイン情報も必要です。' },
  { k: ['支店', '店番', '記号'], a: () => state.bank === 'ゆうちょ銀行'
      ? 'ゆうちょ銀行は「記号（5桁）」と「番号（最大8桁）」を入力します。通帳の表紙や見開きに「記号 1XXX0 番号 XXXXXXX1」の形で書かれています。'
      : '支店番号（店番）は3桁の数字です。キャッシュカードの表面、または通帳の表紙裏に記載されています。支店名しか分からない場合は、銀行の公式サイトの「支店検索」で調べられます。' },
  { k: ['口座番号', '番号', '桁'], a: () => state.bank === 'ゆうちょ銀行'
      ? 'ゆうちょ銀行の番号は最大8桁です。末尾の「1」も含めて入力してください。'
      : '口座番号は7桁です。6桁以下の場合は先頭に「0」を付けて7桁にしてください（例：123456 → 0123456）。' },
  { k: ['カナ', 'カタカナ', '半角'], a: () => '口座名義は全角カタカナで入力します。姓と名の間はスペースを入れてください。\n小さい文字（ャュョッ）も通帳の表記に合わせると確実です。半角カナは使えません。' },
  { k: ['家族', '本人', '他人', '名義が違'], a: () => '登録できるのは アカウントのご本人名義の口座のみです。ご家族名義の口座は登録できません。' },
  { k: ['手数料', 'お金', '費用'], a: () => '口座の登録自体に手数料はかかりません。' },
  { k: ['人', 'オペレーター', '電話', '問い合わせ'], a: () => 'AIで解決しない場合はカスタマーセンターへおつなぎします（プロトタイプのため実際には発信しません）。' },
];

const STEP_CHIPS = {
  intro: ['何が必要？', 'どのくらい時間がかかる？', '途中でやめてもいい？'],
  terms: ['同意しないとどうなる？', '個人情報はどう使われる？'],
  phone: ['SMSが届かない', '認証コードが違う'],
  bank: ['銀行が見つからない', 'メンテナンス中と出る', '使える銀行は？'],
  method: ['2つの方法の違いは？', 'ネットバンキングを使っていない'],
  account: ['支店番号がわからない', '当座預金は使える？', 'ゆうちょの記号・番号は？'],
  person: ['名義が一致しないと出る', 'カナの入力方法は？', '18歳未満は？'],
  'kyc-doc': ['どの書類がおすすめ？', '使える書類は？', 'なぜ本人確認が必要？'],
  'kyc-ic': ['読み取れない', '署名用パスワードを忘れた', 'パスワードがロックされた'],
  'kyc-shoot': ['うまく撮影できない', '厚みの撮り方は？', 'マイナンバーの裏面は？'],
  'kyc-face': ['顔写真のコツは？', 'うまく撮れない'],
  'kyc-info': ['住所が違う', '引っ越した'],
  'kyc-wait': ['どのくらい待つ？', '通知は来る？'],
  'bank-login': ['ログインできない', 'ネットバンキングを使っていない'],
  'bank-otp': ['認証コードが届かない', '期限が切れた'],
  'bank-approve': ['何が提供される？', '許可しないとどうなる？'],
  pin: ['暗証番号を忘れた', 'ロックされた', 'オペレーターと話したい'],
  limit: ['上限って何？', 'オートチャージとは？'],
  confirm: ['あとから変更できる？', '手数料はかかる？'],
  done: ['手数料はかかる？', 'あとから変更できる？'],
};

function answer(q) {
  const m = (e) => e.k.some((k) => q.includes(k));
  const hit = KB.find((e) => e.s && e.s.includes(state.cur) && m(e)) || KB.find((e) => !e.s && m(e)) || KB.find((e) => e.s && m(e));
  if (hit) return hit.a();
  return 'すみません、うまく理解できませんでした。下の候補から選ぶか、「支店番号」「名義」「暗証番号」「本人確認」などの言葉で聞いてみてください。';
}

function greeting() {
  const def = S[state.cur];
  const errs = Object.keys(state.errors).filter((k) => state.errors[k]);
  if (errs.length) {
    // 画面に出ているエラーの説明を先に出す（いちばん困っている可能性が高い）
    const topic = state.topics[errs[0]] || state.errors[errs[0]];
    return `「${def.title}」でエラーが出ているようですね。\n\n${answer(topic)}`;
  }
  return `「${def.title}」の画面ですね。何にお困りですか？\nよくある質問から選ぶか、自由に入力してください。`;
}

function addMsg(text, who) {
  const d = document.createElement('div'); d.className = 'msg ' + who; d.textContent = text;
  $('msgs').appendChild(d); $('msgs').scrollTop = 1e9;
}
function ask(q) {
  addMsg(q, 'me');
  setTimeout(() => addMsg(answer(q), 'ai'), 400);
}
function openSheet() {
  $('fab').classList.remove('nudge'); $('hint').style.display = 'none';
  $('msgs').innerHTML = '';
  addMsg(greeting(), 'ai');
  $('chips').innerHTML = '';
  (STEP_CHIPS[state.cur] || []).forEach((c) => {
    const b = document.createElement('button'); b.textContent = c; b.onclick = () => ask(c); $('chips').appendChild(b);
  });
  $('sheetRoot').classList.add('open');
}
function closeSheet() { $('sheetRoot').classList.remove('open'); }

function nudge(text) {
  $('fab').classList.add('nudge');
  $('hint').textContent = text; $('hint').style.display = 'block';
}
// 入力画面で手が止まったら、声をかける
function resetIdle() {
  clearTimeout(state.idleTimer);
  if (state.cur === 'done' || state.cur === 'kyc-wait') return;
  state.idleTimer = setTimeout(() => nudge('お困りですか？タップでAIがサポートします'), 20000);
}

$('fab').onclick = openSheet;
$('close').onclick = closeSheet; $('sheetBg').onclick = closeSheet;
$('composer').onsubmit = (e) => { e.preventDefault(); const q = $('q').value.trim(); if (q) { ask(q); $('q').value = ''; } };

// 前回の続きがあれば、最初の画面で再開できる
{
  const d = loadDraft();
  if (d && d.cur && !['intro', 'done'].includes(d.cur) && S[d.cur]) state.resume = d;
}
render();

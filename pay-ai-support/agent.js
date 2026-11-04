// 「AIエージェントを使う」（デモ）：許可された利用データから、利用の傾向（プロファイル）をまとめ、おすすめを提案する。
// デモなので、AI は呼ばず、サンプルの利用データ（chat.js の USER）に、決まったルールを当てて作る。
// プロファイリングは個人情報の扱いが重い処理なので、デモでも「使う目的・推定しないこと・保存」を見せ、実行の確認を取る。
// chat.js のあとに読み込む。

const PROFILE_KEY = 'payProfile';
const SCOPE_LABEL = { history: '利用明細', balance: '残高・ポイント', card: 'カード請求' };
const SHOP_KIND = [[/コンビニ/, 'コンビニ'], [/スーパー/, 'スーパー'], [/カフェ|喫茶/, 'カフェ'], [/レストラン|飲食|居酒屋/, '外食'], [/ネット|通販/, 'ネット通販'], [/ドラッグ/, 'ドラッグストア']];
const agentEsc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const sum = (rows) => rows.reduce((a, r) => a + r.amount, 0);

// ---------- プロファイルの作成（許可された項目だけを使う） ----------
// granted: 許可された項目（history / balance / card）。history がなければ、作らない。
function buildProfile(user, granted, now = new Date()) {
  const has = (k) => granted.includes(k);
  const profile = {
    ok: has('history'), type: '', confidence: '', stats: [], tags: [], evidence: [], recs: [],
    sources: Object.keys(SCOPE_LABEL).filter(has).map((k) => SCOPE_LABEL[k]),
    unused: Object.keys(SCOPE_LABEL).filter((k) => !has(k)).map((k) => SCOPE_LABEL[k]),
  };
  if (!profile.ok) return profile;

  const rows = user.recent.map(([date, shop, method, amount]) => ({ date, shop, method, amount }));
  const n = rows.length, total = sum(rows);
  const cardRows = rows.filter((r) => r.method === 'カード');
  const appRows = rows.filter((r) => r.method !== 'カード');
  const cardShare = total ? sum(cardRows) / total : 0;
  const small = rows.filter((r) => r.amount < 1000);
  const big = rows.filter((r) => r.amount >= 10000);
  const thisTotal = user.usage.app.thisMonth + user.usage.card.thisMonth;
  const lastTotal = user.usage.app.lastMonth + user.usage.card.lastMonth;
  const weekend = rows.filter((r) => { const [m, d] = r.date.split('/').map(Number); const w = new Date(now.getFullYear(), m - 1, d).getDay(); return w === 0 || w === 6; });
  const kinds = {};
  for (const r of rows) { const k = (SHOP_KIND.find(([re]) => re.test(r.shop)) ?? [null, 'その他'])[1]; kinds[k] = (kinds[k] ?? 0) + 1; }
  const topKinds = Object.entries(kinds).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([k]) => k);
  const yen = (v) => v.toLocaleString('ja-JP') + '円';

  profile.type = cardShare >= 0.6 ? 'カード中心の計画派' : appRows.length >= n * 0.6 ? 'アプリ払い中心のこまめ派' : '併用バランス派';
  profile.confidence = n < 10 ? `低（直近${n}件の利用から推定したため、目安です）` : n < 30 ? `中（直近${n}件から推定）` : `高（直近${n}件から推定）`;
  profile.stats = [
    ['今月の利用', yen(thisTotal)],
    ['先月との比較', `${thisTotal >= lastTotal ? '+' : ''}${Math.round(((thisTotal - lastTotal) / lastTotal) * 100)}%`],
    ['カード払いの割合', `${Math.round(cardShare * 100)}%`],
    ['1回あたりの平均', yen(Math.round(total / n))],
  ];
  if (cardShare >= 0.6) { profile.tags.push('カード払い中心'); profile.evidence.push(`直近${n}件のうち${cardRows.length}件がカード払い（金額の${Math.round(cardShare * 100)}%）`); }
  if (small.length >= 2) { profile.tags.push('少額の支払いが多い'); profile.evidence.push(`1,000円未満の支払いが${small.length}件`); }
  if (big.length) { profile.tags.push('高額の買い物あり'); profile.evidence.push(`10,000円以上の支払いが${big.length}件（${big.map((r) => r.shop).join('・')}）`); }
  profile.tags.push(weekend.length >= n / 2 ? '週末に使うことが多い' : weekend.length === 0 ? '平日中心' : '平日と週末の両方');
  profile.evidence.push(`直近${n}件のうち、週末の利用は${weekend.length}件`);
  profile.tags.push(`よく使う場所：${topKinds.join('・')}`);
  profile.evidence.push(`場所の種類は、${Object.entries(kinds).map(([k, v]) => `${k}${v}件`).join('、')}`);
  if (thisTotal !== lastTotal) { profile.tags.push(thisTotal < lastTotal ? '先月より利用が少なめ' : '先月より利用が多め'); profile.evidence.push(`今月 ${yen(thisTotal)}、先月 ${yen(lastTotal)}`); }

  // おすすめ：許可された項目に関わるものだけ。緊急度の高い順に、最大3件
  const recs = [];
  if (has('balance') && user.points.limited > 0) recs.push(`期間・用途限定ポイント ${user.points.limited}pt の期限が ${user.points.limitedExpire} です。期限前に使いましょう`);
  if (has('card')) recs.push(`次回のカード請求は ${yen(user.bill.amount)}（${user.bill.date}・${user.bill.bank}）です。引き落とし口座の残高を確認しましょう`);
  if (thisTotal >= 20000) recs.push('ランク特典は月200ptが上限（月2万円で到達）です。月2万円を超える分は、ほかの特典（提携銀行の引き落とし口座にすると +2% など）で増やせます');
  if (appRows.length && cardRows.length) recs.push('アプリ払いの支払い元を Pay カードに設定すると、アプリ払い分にもカードの還元が付きます（+0.5%）');
  profile.recs = recs.slice(0, 3);
  return profile;
}

// ---------- 画面の流れ ----------
const profileHtml = (p) => `
  <div class="profile">
    <div class="head"><span class="demo-note">デモ：サンプルの利用データから作成</span><b>${agentEsc(p.type)}</b>あなたの利用の傾向（推定）</div>
    <div class="body">
      <div class="tagrow">${p.tags.map((t) => `<span>${agentEsc(t)}</span>`).join('')}</div>
      <div class="data">${p.stats.map(([k, v]) => `<div><span>${agentEsc(k)}</span><b>${agentEsc(v)}</b></div>`).join('')}</div>
      <p><b>推定の確からしさ：</b>${agentEsc(p.confidence)}</p>
      <p class="demo-note">使った情報：${agentEsc(p.sources.join('・'))}${p.unused.length ? `／使っていない情報：${agentEsc(p.unused.join('・'))}` : ''}</p>
    </div>
  </div>`;

function storeProfile(p) { try { sessionStorage.setItem(PROFILE_KEY, JSON.stringify({ at: new Date().toISOString(), profile: p })); } catch (e) {} }
function hasProfile() { try { return !!sessionStorage.getItem(PROFILE_KEY); } catch (e) { return false; } }
function deleteProfile() { try { sessionStorage.removeItem(PROFILE_KEY); } catch (e) {} }

function agentAfter(chat, p, home) {
  const pick = (t) => {
    chat.me(t, false);
    if (t === '根拠を見る') {
      chat.card(`<div class="profile"><div class="body"><b>この傾向の根拠</b><ul>${p.evidence.map((e) => `<li>${agentEsc(e)}</li>`).join('')}</ul>
        <p class="demo-note">支払いの方法・金額・日付・場所の種類だけから決めています。健康・信条・家族構成などは推定していません。</p></div></div>`);
      return agentAfter(chat, p, home);
    }
    if (t === 'おすすめを見る') {
      chat.ai(p.recs.length ? `あなたへのおすすめです。\n\n${p.recs.map((r, i) => `${i + 1}. ${r}`).join('\n\n')}` : 'いまは、おすすめはありません。');
      return chat.chips(['利用サービスを開く', '根拠を見る', 'プロファイルを削除', 'ほかのことを聞く'], pick);
    }
    if (t === '利用サービスを開く') return chat.launch('open_services');
    if (t === 'プロファイルを削除') {
      deleteProfile();
      chat.ai('プロファイルを削除しました。作り直すときは、もう一度「AIエージェントを使う」を選んでください。\n\nデータの提供そのものをやめたいときは、「連携も解除する」を選んでください。');
      return chat.chips(['連携も解除する', 'ほかのことを聞く'], pick);
    }
    if (t === '連携も解除する') { Link.revoke(); chat.ai('アカウント連携を解除しました。'); }
    else chat.ai('ほかのことも聞いてください。');
    chat.chips(home);
  };
  chat.chips(['おすすめを見る', '根拠を見る', 'プロファイルを削除', 'ほかのことを聞く'], pick);
}

function agentRun(chat, p, home) {
  const steps = ['利用履歴を読み込む', '支払い方法・金額の傾向を分析する', '利用シーン（曜日・場所の種類）を推定する', 'プロファイルをまとめる', 'おすすめを選ぶ'];
  const box = chat.card('<div class="agent-steps"></div>').firstChild;
  steps.forEach((s) => { const d = document.createElement('div'); d.textContent = s; box.appendChild(d); });
  let i = 0;
  (function tick() {
    if (i > 0) box.children[i - 1].className = 'done';
    if (i === steps.length) {
      storeProfile(p);
      chat.card(profileHtml(p));
      chat.ai(`プロファイルができました。「${p.type}」タイプです。\n下のボタンで、おすすめや、そう判断した根拠を確認できます。`);
      return agentAfter(chat, p, home);
    }
    box.children[i].className = 'run'; i++;
    setTimeout(tick, 600);
  })();
}

// 入口。home: 最初の質問候補（終わったあとに戻す）
function runAgentDemo(chat, { home }) {
  chat.ai('AIエージェントは、あなたの許可した利用データを分析して、「プロファイル」（利用の傾向のまとめ）を作り、おすすめを提案します。\n\nこれはデモです。サンプルの利用データで動きます。', false);
  withConsent(chat, ['history'], () => {
    const el = chat.card(`
      <div class="consent">
        <b>プロファイリングの実行（確認）</b>
        <ul style="margin:6px 0;padding-left:1.2em;font-size:12px;line-height:1.7">
          <li><b>使うデータ：</b>許可した項目だけ（利用明細ほか）</li>
          <li><b>わかること：</b>よく使う支払い方法、利用の頻度・金額、よく使う場所の種類</li>
          <li><b>推定しないこと：</b>健康・信条・家族構成など、センシティブな情報</li>
          <li><b>使い道：</b>おすすめの提案だけ。広告や、第三者への提供には使いません</li>
          <li><b>保存：</b>この画面を閉じるまで。いつでも削除できます</li>
        </ul>
        <p class="demo-note">※ 実際のサービスでは、利用目的・保存期間・拒否の方法を、プライバシーポリシーに明記し、同意を得る必要があります。</p>
        <div class="row"><button type="button" class="no">やめる</button><button type="button" class="yes">プロファイリングを実行</button></div>
      </div>`);
    const lock = () => el.querySelectorAll('button').forEach((b) => (b.disabled = true));
    el.querySelector('.no').onclick = () => { lock(); chat.me('やめる', false); chat.later(() => { chat.ai('実行しませんでした。データは使っていません。'); chat.chips(home); }); };
    el.querySelector('.yes').onclick = () => {
      lock(); chat.me('プロファイリングを実行', false);
      const granted = Object.keys(SCOPE_LABEL).filter((k) => Link.granted(k));
      chat.later(() => agentRun(chat, buildProfile(USER, granted), home), 300);
    };
  }, { intro: 'プロファイリングには、利用データが必要です。\nアカウントを連携し、使う情報を選んでください（利用明細は必須です。残高・ポイントやカード請求は、選ぶとおすすめが増えます）。' });
}

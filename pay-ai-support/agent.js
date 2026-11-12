// 「AIエージェントを使う」（デモ）：許可された利用データから、利用の傾向（プロファイル）を詳しくまとめ、おすすめを提案する。
// デモなので、AI は呼ばず、サンプルの利用データ（直近約6週間・28件）に、決まったルールを当てて作る。
// プロファイリングは個人情報の扱いが重い処理なので、デモでも「使う目的・推定しないこと・保存」を見せ、実行の確認を取る。
// chat.js のあとに読み込む。

const PROFILE_KEY = 'payProfile';
const SCOPE_LABEL = { history: '利用明細', balance: '残高・ポイント', card: 'カード請求' };
const SHOP_KIND = [[/コンビニ/, 'コンビニ'], [/スーパー/, 'スーパー'], [/カフェ|喫茶/, 'カフェ'], [/レストラン|飲食|居酒屋/, '外食'], [/ネット|通販/, 'ネット通販'], [/ドラッグ/, 'ドラッグストア'], [/交通|電車|バス/, '交通'], [/家電/, '家電量販店'], [/衣料|ファッション/, '衣料品']];
const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];
const TIMES = [['朝（5〜10時）', 5, 10], ['昼（11〜15時）', 11, 15], ['夕方（16〜19時）', 16, 19], ['夜（20〜4時）', 20, 28]];
const BANDS = [['1,000円未満', 0, 999], ['1,000〜4,999円', 1000, 4999], ['5,000〜9,999円', 5000, 9999], ['10,000円以上', 10000, Infinity]];

// デモ用のサンプル履歴（新しい順）：[日付, 店舗, 支払い方法, 金額, 時刻]
// 10月・9月の合計は、chat.js の USER.usage（今月・先月）と一致させてある。
const AGENT_HISTORY = [
  ['10/12', 'コンビニ', 'アプリ払い', 648, '08:12'], ['10/11', 'レストラン', 'カード', 3280, '20:05'], ['10/09', 'ネット通販', 'カード', 12800, '22:40'],
  ['10/08', 'カフェ', 'アプリ払い', 520, '10:15'], ['10/05', 'スーパー', 'アプリ払い', 4210, '18:30'], ['10/04', 'コンビニ', 'アプリ払い', 540, '12:20'],
  ['10/04', 'カフェ', 'アプリ払い', 580, '15:10'], ['10/03', '家電量販店', 'カード', 11000, '13:45'], ['10/02', 'スーパー', 'アプリ払い', 6402, '18:50'],
  ['10/02', 'コンビニ', 'アプリ払い', 450, '08:05'], ['10/01', 'レストラン', 'カード', 2920, '19:30'], ['10/01', '交通', 'アプリ払い', 4850, '08:40'],
  ['09/29', 'スーパー', 'アプリ払い', 5100, '17:55'], ['09/27', 'ネット通販', 'カード', 14800, '21:50'], ['09/26', 'コンビニ', 'アプリ払い', 620, '07:50'],
  ['09/24', 'カフェ', 'アプリ払い', 540, '09:40'], ['09/22', 'スーパー', 'アプリ払い', 4380, '18:10'], ['09/20', 'レストラン', 'カード', 6200, '19:45'],
  ['09/18', 'コンビニ', 'アプリ払い', 710, '12:30'], ['09/16', '交通', 'アプリ払い', 4000, '08:35'], ['09/14', '衣料品', 'カード', 9800, '14:20'],
  ['09/12', 'カフェ', 'アプリ払い', 480, '10:05'], ['09/10', 'スーパー', 'アプリ払い', 4900, '18:40'], ['09/09', 'ネット通販', 'カード', 6900, '22:15'],
  ['09/06', 'コンビニ', 'アプリ払い', 520, '08:20'], ['09/05', 'カフェ', 'アプリ払い', 590, '15:30'], ['09/03', 'レストラン', 'カード', 4100, '20:20'],
  ['09/01', 'コンビニ', 'アプリ払い', 610, '12:10'],
];
const agentUser = () => ({ ...USER, history: AGENT_HISTORY, usage: { ...USER.usage, twoMonthsAgo: { app: 19800, card: 35200 } } });

const agentEsc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const sum = (rows) => rows.reduce((a, r) => a + r.amount, 0);
const money = (v) => Math.round(v).toLocaleString('ja-JP') + '円';
const man = (v) => `${(v / 10000).toFixed(1)}万円`;
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
const kindOf = (shop) => (SHOP_KIND.find(([re]) => re.test(shop)) ?? [null, 'その他'])[1];
// 件数や金額が多い順に並べて、上位だけ返す
const topN = (map, by, n) => Object.entries(map).sort((a, b) => b[1][by] - a[1][by]).slice(0, n);
const joinJa = (a) => (a.length > 1 ? `${a.slice(0, -1).join('・')}・${a.at(-1)}` : a.join(''));

// ---------- プロファイルの作成（許可された項目だけを使う） ----------
// granted: 許可された項目（history / balance / card）。history がなければ、作らない。
function buildProfile(user, granted, now = new Date()) {
  const has = (k) => granted.includes(k);
  const profile = {
    ok: has('history'), type: '', catchphrase: '', summary: '', confidence: '', period: '', n: 0,
    stats: [], methods: [], bands: [], kinds: [], weekdays: [], times: [], months: [], forecast: null,
    strengths: [], cautions: [], benefits: [], recs: [], tags: [], evidence: [],
    sources: Object.keys(SCOPE_LABEL).filter(has).map((k) => SCOPE_LABEL[k]),
    unused: Object.keys(SCOPE_LABEL).filter((k) => !has(k)).map((k) => SCOPE_LABEL[k]),
  };
  if (!profile.ok) return profile;

  // 日付は「月/日」。今の月より先の月は、前の年のものとして扱う
  const dateOf = (md) => { const [m, d] = md.split('/').map(Number); return new Date(m > now.getMonth() + 1 ? now.getFullYear() - 1 : now.getFullYear(), m - 1, d); };
  const rows = (user.history ?? user.recent).map(([date, shop, method, amount, time]) => ({ date, shop, method, amount, time: time ?? '', kind: kindOf(shop), day: dateOf(date) }));
  if (!rows.length) return { ...profile, ok: false };
  const n = rows.length, total = sum(rows);
  const cardRows = rows.filter((r) => r.method === 'カード');
  const appRows = rows.filter((r) => r.method !== 'カード');
  const cardShare = total ? sum(cardRows) / total : 0;
  const small = rows.filter((r) => r.amount < 1000);
  const big = rows.filter((r) => r.amount >= 10000);
  const biggest = rows.reduce((a, r) => (r.amount > a.amount ? r : a), rows[0]);
  profile.n = n;
  profile.period = `${rows.at(-1).date}〜${rows[0].date}`;

  // 月ごとの合計（今月・先月・2か月前）と、来月の見通し
  const u = user.usage;
  const thisTotal = u.app.thisMonth + u.card.thisMonth;
  const lastTotal = u.app.lastMonth + u.card.lastMonth;
  const twoTotal = u.twoMonthsAgo ? u.twoMonthsAgo.app + u.twoMonthsAgo.card : null;
  const m0 = Number(rows[0].date.split('/')[0]);
  const monthLabel = (back) => `${((m0 - back + 11) % 12) + 1}月`;
  profile.months = [...(twoTotal != null ? [{ label: monthLabel(2), total: twoTotal }] : []), { label: monthLabel(1), total: lastTotal }, { label: monthLabel(0), total: thisTotal }];
  const avgMonth = profile.months.reduce((a, m) => a + m.total, 0) / profile.months.length;
  const round1000 = (v) => Math.round(v / 1000) * 1000;
  profile.forecast = { avg: avgMonth, low: round1000(avgMonth * 0.9), high: round1000(avgMonth * 1.1) };
  const change = lastTotal ? Math.round(((thisTotal - lastTotal) / lastTotal) * 100) : 0;

  // 支払い方法・金額帯・場所の種類・曜日・時間帯
  profile.methods = [['アプリ払い', appRows], ['カード', cardRows]].map(([label, r]) => ({ label, count: r.length, amount: sum(r), share: pct(sum(r), total) }));
  profile.bands = BANDS.map(([label, lo, hi]) => { const c = rows.filter((r) => r.amount >= lo && r.amount <= hi).length; return { label, count: c, share: pct(c, n) }; });
  const kindMap = {};
  for (const r of rows) { const k = (kindMap[r.kind] ??= { count: 0, amount: 0 }); k.count++; k.amount += r.amount; }
  profile.kinds = topN(kindMap, 'amount', 6).map(([label, v]) => ({ label, count: v.count, amount: v.amount, share: pct(v.amount, total) }));
  const wd = WEEKDAYS.map((label, i) => ({ label, count: rows.filter((r) => r.day.getDay() === i).length }));
  profile.weekdays = [...wd.slice(1), wd[0]];
  const weekend = rows.filter((r) => [0, 6].includes(r.day.getDay()));
  const hour = (r) => { const h = Number(r.time.split(':')[0]); return h < 5 ? h + 24 : h; };
  const timed = rows.filter((r) => r.time);
  profile.times = TIMES.map(([label, lo, hi]) => ({ label, count: timed.filter((r) => hour(r) >= lo && hour(r) <= hi).length }));
  const maxWeekday = Math.max(...wd.map((d) => d.count));
  const topWeekdays = profile.weekdays.filter((d) => d.count === maxWeekday); // 同数のときは、すべて挙げる
  const topTime = [...profile.times].sort((a, b) => b.count - a.count)[0];

  // タイプとひとこと
  profile.type = cardShare >= 0.6 ? 'カード中心の計画派' : appRows.length >= n * 0.6 ? 'アプリ払い中心のこまめ派' : '併用バランス派';
  profile.catchphrase = { 'カード中心の計画派': '大きな買い物はカードにまとめる、堅実なタイプ', 'アプリ払い中心のこまめ派': '日々の支払いをアプリで済ませる、こまめなタイプ', '併用バランス派': 'アプリとカードを場面で使い分ける、バランス型のタイプ' }[profile.type];
  profile.confidence = n < 10 ? `低（直近${n}件の利用から推定したため、目安です）` : n < 30 ? `中（${profile.period}の${n}件から推定）` : `高（${profile.period}の${n}件から推定）`;
  const appKinds = topN(rows.filter((r) => r.method !== 'カード').reduce((m, r) => ((m[r.kind] ??= { count: 0 }).count++, m), {}), 'count', 3).map(([k]) => k);
  const cardKinds = topN(cardRows.reduce((m, r) => ((m[r.kind] ??= { amount: 0 }).amount += r.amount, m), {}), 'amount', 3).map(([k]) => k);
  const avgCard = cardRows.length ? sum(cardRows) / cardRows.length : 0;
  const avgApp = appRows.length ? sum(appRows) / appRows.length : 0;
  profile.summary = [
    `あなたは、月におよそ${man(avgMonth)}をキャッシュレスで使い、金額の約${Math.round(cardShare * 100)}%をカード払いにしている「${profile.type}」です。`,
    appRows.length && cardRows.length && avgCard > avgApp
      ? `日々の少額の支払い（${joinJa(appKinds)}）はアプリ払い、金額の大きい買い物（${joinJa(cardKinds)}）はカード払い、と使い分けています。`
      : `支払いは、アプリ払いとカード払いを場面によって使っています。`,
    `利用は${topWeekdays.map((d) => d.label + '曜日').join('・')}に多く、時間帯は${topTime.label.split('（')[0]}が中心です。週末の利用は${n}件中${weekend.length}件（${pct(weekend.length, n)}%）です。`,
    thisTotal === lastTotal ? '今月の利用は、先月と同じくらいです。' : `今月の利用は先月より${Math.abs(change)}%${thisTotal < lastTotal ? '少なく、支出は落ち着いています' : '多く、やや使い込んでいます'}。`,
  ].join('');

  profile.stats = [
    ['今月の利用', money(thisTotal)],
    ['先月との比較', `${change >= 0 ? '+' : ''}${change}%`],
    [`直近${profile.months.length}か月の平均`, money(avgMonth)],
    ['1回あたりの平均', money(total / n)],
    ['いちばん大きい1回', `${money(biggest.amount)}（${biggest.shop}）`],
    [`利用回数（${profile.period}）`, `${n}回`],
    ['カード払いの割合（金額）', `${Math.round(cardShare * 100)}%`],
    ['1,000円未満の割合（件数）', `${pct(small.length, n)}%`],
  ];

  // 傾向のタグと、その根拠
  const T = profile.tags, E = profile.evidence;
  if (cardShare >= 0.6) { T.push('カード払い中心'); E.push(`${n}件のうち${cardRows.length}件がカード払い。金額では${Math.round(cardShare * 100)}%`); }
  if (small.length >= 2) { T.push('少額の支払いが多い'); E.push(`1,000円未満の支払いが${small.length}件（合計${money(sum(small))}）`); }
  if (big.length) { T.push('高額の買い物あり'); E.push(`10,000円以上の支払いが${big.length}件（${joinJa([...new Set(big.map((r) => r.kind))])}）。すべて${big.every((r) => r.method === 'カード') ? 'カード払い' : '支払い方法はまちまち'}`); }
  T.push(weekend.length >= n / 2 ? '週末に使うことが多い' : weekend.length === 0 ? '平日中心' : '平日と週末の両方');
  E.push(`曜日は、${profile.weekdays.filter((d) => d.count).map((d) => `${d.label}${d.count}件`).join('、')}`);
  if (timed.length) { T.push(`${topTime.label.split('（')[0]}の利用が中心`); E.push(`時間帯は、${profile.times.map((t) => `${t.label.split('（')[0]}${t.count}件`).join('、')}`); }
  T.push(`よく使う場所：${joinJa(profile.kinds.slice(0, 2).map((k) => k.label))}`);
  E.push(`場所の種類は、金額の多い順に${profile.kinds.map((k) => `${k.label}${money(k.amount)}`).join('、')}`);
  if (thisTotal !== lastTotal) { T.push(thisTotal < lastTotal ? '先月より利用が少なめ' : '先月より利用が多め'); E.push(`今月 ${money(thisTotal)}、先月 ${money(lastTotal)}${twoTotal != null ? `、${monthLabel(2)} ${money(twoTotal)}` : ''}`); }

  // 強みと、気をつけたい点
  const S = profile.strengths, C = profile.cautions;
  if (big.length && big.every((r) => r.method === 'カード')) S.push('金額の大きい買い物をカードにまとめていて、ポイントを取りこぼしにくい使い方です');
  if (thisTotal < lastTotal) S.push(`今月は先月より支出が${Math.abs(change)}%少なく、使いすぎを抑えられています`);
  if (appRows.length >= n / 2) S.push('日々の支払いをアプリ払いで済ませていて、アプリの特典の対象になりやすい使い方です');
  if (!S.length) S.push('アプリ払いとカード払いを、場面によって使い分けられています');
  const spanDays = Math.max(1, Math.round((rows[0].day - rows.at(-1).day) / 86400000) + 1);
  if (small.length >= 8) C.push(`1,000円未満の支払いが${small.length}件（合計${money(sum(small))}）あります。1回は少額でも、1か月にすると約${money((sum(small) / spanDays) * 30)}になります`);
  if (big.length) C.push(`10,000円以上の買い物が${big.length}件（${joinJa([...new Set(big.map((r) => r.kind))])}）あります。返品・キャンセルになると、ポイント特典が対象外になることがあります`);
  const lateShare = pct(sum(rows.filter((r) => r.day.getDate() >= 25)), total);
  if (lateShare >= 25) C.push(`月末（25日以降）に支払いが集中しています（金額の${lateShare}%）。カード請求と重なるので、残高に余裕を持たせましょう`);
  if (!C.length) C.push('いまのところ、特に気をつけたい点は見つかりませんでした');

  // 特典の活用度（目安）。ランク特典は月200ptが上限、提携銀行の引き落とし口座の特典は +2%（月3,000ptまで）
  const rank = Math.round(u.app.thisMonth * 0.01);
  profile.benefits.push({ label: 'ランク特典（+1%）の上限', detail: `アプリ払い ${money(u.app.thisMonth)} で約${rank}pt（上限は月200pt）。${rank >= 200 ? '上限に届いています' : `上限まで、あと約${200 - rank}pt（アプリ払いあと約${money(20000 - u.app.thisMonth)}）`}` });
  const bankGain = Math.min(Math.round(thisTotal * 0.02), 3000);
  profile.benefits.push({ label: '提携銀行を引き落とし口座にすると（未適用）', detail: `いまの使い方なら、月に約${bankGain}pt（1年で約${(bankGain * 12).toLocaleString('ja-JP')}pt）増える見込みです（最初の12か月・月3,000ptまで）` });
  if (appRows.length && cardRows.length) profile.benefits.push({ label: 'アプリ払いの支払い元をカードにすると', detail: `アプリ払い分に、カードの還元が付きます。月に約${Math.round(u.app.thisMonth * 0.005)}pt増える見込みです（+0.5%）` });

  // おすすめ：許可された項目に関わるものだけ。優先度の高い順に、最大5件
  const R = profile.recs;
  if (has('balance') && user.points.limited > 0) R.push({ priority: 'high', title: `期間・用途限定ポイント ${user.points.limited}pt を使い切る`, why: `期限は ${user.points.limitedExpire} です。支払いで「ポイントを使う」をオンにすると、期限の近いものから使われます` });
  if (has('card')) R.push({ priority: 'high', title: `次回のカード請求 ${money(user.bill.amount)} に備える`, why: `${user.bill.date}に${user.bill.bank}から引き落とされます。引き落とし口座の残高を確認しましょう` });
  if (thisTotal >= 20000) R.push({ priority: 'mid', title: '提携銀行を引き落とし口座にする', why: `月約${bankGain}pt増える見込みです。利用サービスの「Payカード×提携銀行」から手順を確認できます` });
  if (appRows.length && cardRows.length) R.push({ priority: 'mid', title: 'アプリ払いの支払い元をカードに設定する', why: `アプリ払い分に、カードの還元（+0.5%）が付きます。月約${Math.round(u.app.thisMonth * 0.005)}pt増える見込みです` });
  if (rank < 200) R.push({ priority: 'low', title: 'ランク特典の上限まで使い切る', why: `上限（月200pt）まで、あと約${200 - rank}ptです。アプリ払いは月2万円まで、特典が付きます` });
  if (small.length >= 8) R.push({ priority: 'low', title: '少額の支払いをまとめる', why: `1,000円未満の支払いが${small.length}件あります。還元が高くなる日や対象のお店に、まとめると効率的です` });
  profile.recs = R.slice(0, 5);
  return profile;
}

// ---------- 表示 ----------
const barRows = (items) => `<div class="bars">${items.map((i) => `<div class="r"><span>${agentEsc(i.label)}</span><div class="bar"><i style="width:${Math.max(2, Math.min(100, i.pct))}%"></i></div><span>${agentEsc(i.text)}</span></div>`).join('')}</div>`;
const sec = (title, html, open = true) => `<details class="sec" ${open ? 'open' : ''}><summary>${agentEsc(title)}</summary>${html}</details>`;
const PRI = { high: ['高', 'high'], mid: ['中', 'mid'], low: ['低', 'low'] };
const recHtml = (r) => `<div class="rec"><span class="pri ${PRI[r.priority][1]}">優先度${PRI[r.priority][0]}</span><b>${agentEsc(r.title)}</b><small>${agentEsc(r.why)}</small></div>`;

function profileHtml(p) {
  const maxMonth = Math.max(...p.months.map((m) => m.total));
  const maxWd = Math.max(1, ...p.weekdays.map((d) => d.count)), maxTime = Math.max(1, ...p.times.map((t) => t.count));
  return `
  <div class="profile">
    <div class="head"><span class="demo-note">デモ：サンプルの利用データから作成</span><b>${agentEsc(p.type)}</b>${agentEsc(p.catchphrase)}</div>
    <div class="body">
      <p class="lead-sum">${agentEsc(p.summary)}</p>
      <div class="tagrow">${p.tags.map((t) => `<span>${agentEsc(t)}</span>`).join('')}</div>
      ${sec('数字で見る利用', `<div class="data">${p.stats.map(([k, v]) => `<div><span>${agentEsc(k)}</span><b>${agentEsc(v)}</b></div>`).join('')}</div>`)}
      ${sec('支払い方法と金額の大きさ', `<b style="font-size:12px">支払い方法（金額）</b>${barRows(p.methods.map((m) => ({ label: m.label, pct: m.share, text: `${m.share}%・${m.count}件` })))}
        <b style="font-size:12px">1回の金額（件数）</b>${barRows(p.bands.map((b) => ({ label: b.label, pct: b.share, text: `${b.share}%・${b.count}件` })))}`)}
      ${sec('どこで使っている？（金額の多い順）', barRows(p.kinds.map((k) => ({ label: k.label, pct: k.share, text: `${money(k.amount)}` }))))}
      ${sec('いつ使っている？', `<b style="font-size:12px">曜日</b>${barRows(p.weekdays.map((d) => ({ label: `${d.label}曜日`, pct: (d.count / maxWd) * 100, text: `${d.count}件` })))}
        ${p.times.some((t) => t.count) ? `<b style="font-size:12px">時間帯</b>${barRows(p.times.map((t) => ({ label: t.label.split('（')[0], pct: (t.count / maxTime) * 100, text: `${t.count}件` })))}` : ''}`)}
      ${sec('月ごとの推移と、来月の見通し', `${barRows(p.months.map((m) => ({ label: m.label, pct: (m.total / maxMonth) * 100, text: money(m.total) })))}
        <p>来月の利用は、<b>${man(p.forecast.low)}〜${man(p.forecast.high)}</b>くらいが目安です（直近${p.months.length}か月の平均 ${man(p.forecast.avg)} をもとにした、おおまかな見通しです）。</p>`)}
      ${sec('あなたの強みと、気をつけたい点', `<div class="two"><div><h5>👍 強み</h5><ul>${p.strengths.map((s) => `<li>${agentEsc(s)}</li>`).join('')}</ul></div><div><h5>⚠️ 気をつけたい点</h5><ul>${p.cautions.map((s) => `<li>${agentEsc(s)}</li>`).join('')}</ul></div></div>`)}
      ${sec('特典の活用度（目安）', `<ul>${p.benefits.map((b) => `<li><b>${agentEsc(b.label)}</b><br>${agentEsc(b.detail)}</li>`).join('')}</ul>`)}
      ${sec('おすすめのアクション', p.recs.length ? p.recs.map(recHtml).join('') : '<p>いまは、おすすめはありません。</p>')}
      ${sec('このプロファイルについて', `<p><b>推定の確からしさ：</b>${agentEsc(p.confidence)}</p>
        <p>使った情報：${agentEsc(p.sources.join('・'))}${p.unused.length ? `<br>使っていない情報：${agentEsc(p.unused.join('・'))}` : ''}</p>
        <p class="demo-note">支払いの方法・金額・日付・時刻・場所の種類だけから決めています。健康・信条・家族構成などは推定していません。デモのため、サンプルの利用データを使っています。結果は、この画面を閉じるまで保存され、「プロファイルを削除」でいつでも消せます。</p>`, false)}
    </div>
  </div>`;
}

function storeProfile(p) { try { sessionStorage.setItem(PROFILE_KEY, JSON.stringify({ at: new Date().toISOString(), profile: p })); } catch (e) {} }
function deleteProfile() { try { sessionStorage.removeItem(PROFILE_KEY); } catch (e) {} }

function agentAfter(chat, p, home) {
  const pick = (t) => {
    chat.me(t, false);
    if (t === '根拠を見る') {
      chat.card(`<div class="profile"><div class="body"><b>この傾向の根拠</b><ul>${p.evidence.map((e) => `<li>${agentEsc(e)}</li>`).join('')}</ul>
        <p class="demo-note">支払いの方法・金額・日付・時刻・場所の種類だけから決めています。健康・信条・家族構成などは推定していません。</p></div></div>`);
      return agentAfter(chat, p, home);
    }
    if (t === 'おすすめを見る') {
      chat.card(`<div class="profile"><div class="body"><b>あなたへのおすすめ（${p.recs.length}件）</b>${p.recs.map(recHtml).join('')}</div></div>`);
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
  const steps = [
    'アカウント情報を読み込む（' + p.sources.join('・') + '）', `利用履歴を整理する（${p.period}・${p.n}件）`, '支払い方法と、金額の大きさの傾向を分析する',
    '場所の種類・曜日・時間帯のパターンを探す', '月ごとの推移から、来月の見通しを出す', '特典の使い方を点検する（取りこぼしがないか）',
    '強みと、気をつけたい点をまとめる', 'あなたに合うおすすめを、優先度つきで選ぶ',
  ];
  const box = chat.card('<div class="agent-steps"></div>').firstChild;
  steps.forEach((s) => { const d = document.createElement('div'); d.textContent = s; box.appendChild(d); });
  let i = 0;
  (function tick() {
    if (i > 0) box.children[i - 1].className = 'done';
    if (i === steps.length) {
      storeProfile(p);
      chat.card(profileHtml(p));
      chat.ai(`プロファイルができました。「${p.type}」タイプです。\n各項目は、タップで開け閉めできます。下のボタンで、おすすめや、そう判断した根拠を確認できます。`);
      return agentAfter(chat, p, home);
    }
    box.children[i].className = 'run'; i++;
    setTimeout(tick, 550);
  })();
}

// 入口。home: 最初の質問候補（終わったあとに戻す）
function runAgentDemo(chat, { home }) {
  chat.ai('AIエージェントは、許可された利用データから傾向（プロファイル）をまとめ、おすすめを提案します。デモのため、サンプルデータで動きます。利用には「アカウント情報」の連携が必要です。', false);
  // 連携する項目は「アカウント情報」の1つ（許可すると、利用明細・残高とポイント・カード請求を、まとめて連携する）
  withConsent(chat, Object.keys(SCOPE_LABEL), () => {
    Link.agentOn(); // 「AIエージェントを使う」を始めたので、AIアイコンにバッジを付ける
    const el = chat.card(`
      <div class="consent">
        <b>プロファイリングの実行（確認）</b>
        <ul style="margin:6px 0;padding-left:1.2em;font-size:12px;line-height:1.7">
          <li><b>使うデータ：</b>連携した「アカウント情報」（利用明細・残高とポイント・カード請求）</li>
          <li><b>わかること：</b>よく使う支払い方法、利用の頻度・金額、よく使う場所の種類、曜日・時間帯、月ごとの推移、特典の使い方</li>
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
      chat.later(() => agentRun(chat, buildProfile(agentUser(), granted), home), 300);
    };
  }, {
    intro: null, // 案内は、上の 1 つのメッセージにまとめた
    single: { title: 'AIエージェントとの連携', label: 'アカウント情報', desc: '利用明細（直近3か月）・残高とポイント・カード請求情報', note: 'AIエージェントに連携する項目は、次の1つです。連携はホームの「AI連携を解除」からいつでも解除できます。' },
  });
}

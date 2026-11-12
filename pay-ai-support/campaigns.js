// 特集一覧（プロトタイプ）。
// 保存データ（data/campaigns.json。毎日の事前読み取りで作られる）があればそれを、なければ、サンプルの一覧を表示する。
// 外部から読み込んだ文字は、すべてエスケープして表示し、リンクは、同じサイト内の https のものだけを使う。

const CAMPAIGN_TOP = 'https://service.smt.docomo.ne.jp/keitai_payment/campaign/';
const LINK_PREFIX = 'https://service.smt.docomo.ne.jp/';

// サンプル（公開情報をもとにした例）。保存データがないときだけ使う。
const SAMPLE = [
  { title: 'エリアキャンペーン（地域ごとの抽選）', kind: 'd払い', entry: '不要', period: '地域ごとに異なります（例：長野市 10/23〜11/23）', url: '',
    detail: { reward: '1等100%・2等50%・3等10%・4等1%を、抽選でポイント進呈', limit: '1回30,000pt・期間中30,000pt', target: '全国8地域の対象店舗での、アプリ払い', entry_how: 'エントリー不要', notes: '予算に達すると、期間内でも終了します' } },
  { title: 'ネットショッピング 抽選で最大20%還元', kind: 'd払い', entry: '不明', period: '期間は、公式ページで確認してください', url: 'https://service.smt.docomo.ne.jp/keitai_payment/campaign/app_netshopping/',
    detail: { reward: '抽選で最大20%還元', limit: '1回の決済で2,000pt', target: '対象のネットショップでの、アプリ払い', entry_how: 'エントリーが必要な場合があります', notes: '一部のショップ（ふるさと納税サイトの一部など）は、2026年10月から対象外です' } },
  { title: '自治体キャンペーン', kind: 'd払い', entry: '不明', period: 'キャンペーンごとに異なります（10月と11月で、上限が別枠の地域もあります）', url: '',
    detail: { reward: '最大30%還元など（自治体ごと）', limit: '例：1回10,000pt・期間40,000pt', target: '自治体ごとの対象店舗', entry_how: '自治体ごとに異なります', notes: '11月開始の地域も追加されています' } },
];

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const safeUrl = (u) => (typeof u === 'string' && u.startsWith(LINK_PREFIX) && !/\s/.test(u) ? u : '');
const KIND_CLASS = { 'd払い': 'pay', 'dポイント': 'pt' };
const DETAIL_LABEL = [['reward', '還元・特典'], ['limit', '上限'], ['target', '対象'], ['entry_how', 'エントリー'], ['notes', '注意']];

const state = { list: [], sample: true, kind: 'すべて', needOnly: false, q: '' };

async function load() {
  try {
    const res = await fetch('data/campaigns.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(String(res.status));
    const data = await res.json();
    if (!Array.isArray(data.campaigns) || !data.campaigns.length) throw new Error('empty');
    return { list: data.campaigns, sample: false, updatedAt: String(data.updatedAt ?? '').slice(0, 10) };
  } catch (e) {
    return { list: SAMPLE, sample: true, updatedAt: '' };
  }
}

function itemHtml(c) {
  const kind = ['d払い', 'dポイント'].includes(c.kind) ? c.kind : 'その他';
  const entry = c.entry === '必要' ? '<span class="tag need">' + ic('warn') + ' エントリー必要</span>' : c.entry === '不要' ? '<span class="tag free">エントリー不要</span>' : '<span class="tag">エントリー：不明</span>';
  const d = c.detail && typeof c.detail === 'object' ? c.detail : null;
  const rows = d ? DETAIL_LABEL.filter(([k]) => d[k] && d[k] !== '不明').map(([k, label]) => `<dt>${label}</dt><dd>${esc(d[k])}</dd>`).join('') : '';
  const href = safeUrl(c.url);
  return `<article class="item">
    <div class="tags"><span class="tag ${KIND_CLASS[kind] ?? ''}">${esc(kind)}</span>${entry}</div>
    <h2>${esc(c.title)}</h2>
    <p class="period">期間：${esc(c.period || '不明')}</p>
    ${rows ? `<details class="cond"><summary>くわしい条件を見る</summary><dl>${rows}</dl></details>` : ''}
    <a class="go" href="${esc(href || CAMPAIGN_TOP)}" target="_blank" rel="noopener noreferrer">${href ? '公式ページでくわしく見る' : '公式のキャンペーンページを見る'}</a>
  </article>`;
}

const haystack = (c) => [c.title, c.kind, c.period, ...(c.detail && typeof c.detail === 'object' ? Object.values(c.detail) : [])].join(' ').toLowerCase();

function render() {
  const q = state.q.trim().toLowerCase();
  const shown = state.list.filter((c) =>
    (state.kind === 'すべて' || (state.kind === 'その他' ? !['d払い', 'dポイント'].includes(c.kind) : c.kind === state.kind)) &&
    (!state.needOnly || c.entry === '必要') && (!q || haystack(c).includes(q)));
  $('count').textContent = `${shown.length}件${shown.length !== state.list.length ? `（全${state.list.length}件中）` : ''}`;
  $('list').innerHTML = shown.length ? shown.map(itemHtml).join('')
    : '<div class="empty">条件に合う特集は見つかりませんでした。<br>絞り込みを変えてみてください。</div>';
}

function renderKinds() {
  const hasOther = state.list.some((c) => !['d払い', 'dポイント'].includes(c.kind));
  const kinds = ['すべて', 'd払い', 'dポイント', ...(hasOther ? ['その他'] : [])];
  $('kinds').innerHTML = kinds.map((k) => `<button type="button" data-kind="${esc(k)}" class="${state.kind === k ? 'sel' : ''}" aria-pressed="${state.kind === k}">${esc(k)}</button>`).join('');
  $('kinds').querySelectorAll('button').forEach((b) => { b.onclick = () => { state.kind = b.dataset.kind; renderKinds(); render(); }; });
}

(async function init() {
  $('top').href = CAMPAIGN_TOP;
  const data = await load();
  Object.assign(state, data);
  const banner = $('banner');
  banner.hidden = false;
  banner.classList.toggle('real', !data.sample);
  banner.textContent = data.sample
    ? 'いまは、サンプルの一覧です。公開情報をもとにした例で、キャンペーンページから読み取ったデータではありません。'
    : `${data.updatedAt || '最近'}に、キャンペーンページから読み取った一覧です。`;
  $('needOnly').onchange = (e) => { state.needOnly = e.target.checked; render(); };
  $('q').oninput = (e) => { state.q = e.target.value; render(); };
  renderKinds();
  render();
})();

// Shared AI chat widget + mock account linking for the home and services pages.

// ---------- Mock account data (only handed to the AI after the user consents) ----------
const USER = {
  name: 'ヤマダ タロウ',
  balance: 12345,
  points: { total: 3210, limited: 800, limitedExpire: '10/31' },
  usage: {
    app:  { thisMonth: 18200, lastMonth: 22450 },
    card: { thisMonth: 30000, lastMonth: 41800 },
  },
  bill: { amount: 52300, date: '11/10', bank: '三井住友銀行' },
  recent: [
    ['10/12', 'コンビニ', 'アプリ払い', 648],
    ['10/11', 'ドラッグストア', 'カード', 3280],
    ['10/09', 'ネット通販', 'カード', 12800],
    ['10/08', 'カフェ', 'アプリ払い', 520],
    ['10/05', 'スーパー', 'アプリ払い', 4210],
  ],
  // Monthly spend by category, used by the benefits AI to estimate rewards.
  spend: { convenience: 6000, drugstore: 5000, online: 15000, gas: 0, other: 22000 },
};

const SCOPES = {
  balance: { label: '残高・ポイント', desc: 'アプリ残高、保有ポイントと有効期限' },
  history: { label: '利用明細（直近3か月）', desc: 'アプリ払い・カードの利用日、店舗、金額' },
  card:    { label: 'カード請求情報', desc: '次回の請求額、引き落とし日、引き落とし口座' },
};

const yen = n => n.toLocaleString('ja-JP') + '円';

const Link = {
  get() { try { return JSON.parse(sessionStorage.getItem('payLink') || 'null'); } catch (e) { return null; } },
  set(v) { try { sessionStorage.setItem('payLink', JSON.stringify(v)); } catch (e) {} this._mem = v; },
  granted(scope) { const v = this.get() || this._mem; return !!(v && v.scopes.includes(scope)); },
  revoke() { try { sessionStorage.removeItem('payLink'); } catch (e) {} this._mem = null; },
};

// ---------- Chat widget ----------
function createChat({ title, greet, handle }) {
  const root = document.createElement('div');
  root.innerHTML = `
    <button class="ai-fab" aria-label="${title}を開く">AI</button>
    <div class="sheet-bg"></div>
    <div class="sheet" role="dialog" aria-label="${title}">
      <div class="sheet-head"><span>🤖</span><b>${title}</b><button class="close" aria-label="閉じる">×</button></div>
      <div class="msgs"></div>
      <div class="chips"></div>
      <form class="composer"><input placeholder="質問を入力" autocomplete="off"><button>送信</button></form>
    </div>`;
  document.body.appendChild(root);
  const $ = s => root.querySelector(s);
  const msgs = $('.msgs');

  const chat = {
    ai(text) { const d = document.createElement('div'); d.className = 'msg ai'; d.textContent = text; msgs.appendChild(d); msgs.scrollTop = 1e9; },
    me(text) { const d = document.createElement('div'); d.className = 'msg me'; d.textContent = text; msgs.appendChild(d); msgs.scrollTop = 1e9; },
    card(html) { const d = document.createElement('div'); d.className = 'msg card'; d.innerHTML = html; msgs.appendChild(d); msgs.scrollTop = 1e9; return d; },
    chips(list, onPick = q => chat.ask(q)) {
      const c = $('.chips'); c.innerHTML = '';
      list.forEach(t => { const b = document.createElement('button'); b.type = 'button'; b.textContent = t; b.onclick = () => onPick(t); c.appendChild(b); });
    },
    // Show a reply after a short "typing" delay so the exchange reads naturally.
    later(fn, ms = 450) { setTimeout(fn, ms); },
    ask(q) { chat.me(q); chat.later(() => handle(q, chat)); },
    open() {
      root.classList.add('open');
      if (!msgs.children.length) { const g = greet(); chat.ai(g.text); chat.chips(g.chips); }
    },
    close() { root.classList.remove('open'); },
  };
  $('.ai-fab').onclick = chat.open;
  $('.close').onclick = chat.close;
  $('.sheet-bg').onclick = chat.close;
  $('.composer').onsubmit = e => { e.preventDefault(); const i = $('.composer input'); const q = i.value.trim(); if (q) { chat.ask(q); i.value = ''; } };
  return chat;
}

// ---------- Account linking + consent ----------
// Personal questions need account data. Ask the user to link the account and choose
// what the AI may see; only call onGranted once every needed scope is allowed.
function withConsent(chat, needed, onGranted) {
  if (needed.every(s => Link.granted(s))) return onGranted();
  chat.ai('このご質問にはお客さまのアカウント情報が必要です。\nアカウントを連携し、AIに渡す情報を選んでください。');
  const el = chat.card(`
    <div class="consent">
      <b>アカウント連携とAIへの情報提供</b>
      <p>選んだ情報だけをAIに渡します。情報は回答の作成にのみ使います。連携はホームの「AI連携を解除」からいつでも解除できます。</p>
      ${Object.entries(SCOPES).map(([k, s]) => `
        <label><input type="checkbox" value="${k}" ${needed.includes(k) || Link.granted(k) ? 'checked' : ''}>
          <span><b>${s.label}</b>${needed.includes(k) ? '<em>この質問に必要</em>' : ''}<small>${s.desc}</small></span></label>`).join('')}
      <div class="row"><button type="button" class="no">許可しない</button><button type="button" class="yes">連携して許可</button></div>
    </div>`);
  const done = () => el.querySelectorAll('button, input').forEach(b => b.disabled = true);
  el.querySelector('.no').onclick = () => {
    done(); chat.me('許可しない');
    chat.later(() => chat.ai('承知しました。アカウント情報は使わずにお答えします。\n残高や明細はホームの「利用履歴」からもご確認いただけます。'));
  };
  el.querySelector('.yes').onclick = () => {
    const scopes = [...el.querySelectorAll('input:checked')].map(i => i.value);
    done(); chat.me(`連携して許可（${scopes.map(s => SCOPES[s].label).join('・') || 'なし'}）`);
    // Mock of the account-linking step (biometric / password confirmation in the real app).
    const auth = chat.card('<div class="authing">🔐 本人確認中…（デモ）</div>');
    setTimeout(() => {
      auth.innerHTML = '<div class="authing ok">✓ アカウントを連携しました</div>';
      // Add to what was granted earlier rather than replacing it.
      const prev = (Link.get() || Link._mem || { scopes: [] }).scopes;
      Link.set({ scopes: [...new Set([...prev, ...scopes])], at: Date.now() });
      if (!needed.every(s => scopes.includes(s))) {
        chat.ai(`「${needed.filter(s => !scopes.includes(s)).map(s => SCOPES[s].label).join('・')}」が許可されていないため、このご質問にはお答えできません。必要になったら、もう一度聞いてください。`);
        return;
      }
      chat.later(onGranted, 300);
    }, 1100);
  };
}

// Ask the user a follow-up question (the AI "hearing"), then continue with their choice.
function hear(chat, question, options, onAnswer) {
  chat.ai(question);
  chat.chips(options, a => { chat.me(a); chat.later(() => onAnswer(a)); });
}

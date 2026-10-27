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
    ['10/11', 'レストラン', 'カード', 3280],
    ['10/09', 'ネット通販', 'カード', 12800],
    ['10/08', 'カフェ', 'アプリ払い', 520],
    ['10/05', 'スーパー', 'アプリ払い', 4210],
  ],
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
// Relay server holding the Gemini key (same Vercel project as AI職業サポート).
const AI_URL = 'https://squiddessert.vercel.app/api/pay-assistant';
const LINK_ORIGIN = 'https://service.smt.docomo.ne.jp/';

// Only the scopes the user allowed are ever put in the request.
function consentedAccount() {
  const a = {};
  if (Link.granted('balance')) Object.assign(a, { balance: USER.balance, points: USER.points });
  if (Link.granted('history')) Object.assign(a, { usage: USER.usage, recent: USER.recent });
  if (Link.granted('card')) Object.assign(a, { bill: USER.bill });
  return Object.keys(a).length ? a : null;
}

const ACTION_URL = {
  open_send: p => { const q = new URLSearchParams(); if (p?.to) q.set('to', p.to); if (p?.amount) q.set('amount', String(p.amount).replace(/[^0-9]/g, '')); return 'send.html' + (q.toString() ? '?' + q : ''); },
  open_history: () => 'services.html#hist',
  open_register: () => 'register.html',
  open_services: () => 'services.html',
};
const ACTION_NAME = { open_send: '送金', open_history: '利用履歴', open_register: '銀行口座登録', open_services: '利用サービス' };

function createChat({ title, greet, handle, ai }) {
  const root = document.createElement('div');
  root.innerHTML = `
    <button class="ai-fab" aria-label="${title}を開く">AI</button>
    <div class="sheet-bg"></div>
    <div class="sheet" role="dialog" aria-label="${title}">
      <div class="sheet-head"><span>🤖</span><b>${title}</b><button class="close" aria-label="閉じる">×</button></div>
      <div class="msgs"></div>
      <div class="chips"></div>
      <form class="composer"><button type="button" class="mic" aria-label="音声で入力" hidden>🎤</button><input placeholder="質問を入力" autocomplete="off"><button>送信</button></form>
    </div>`;
  document.body.appendChild(root);
  const $ = s => root.querySelector(s);
  const msgs = $('.msgs');

  const chat = {
    history: [],
    ai(text) { const d = document.createElement('div'); d.className = 'msg ai'; d.textContent = text; msgs.appendChild(d); msgs.scrollTop = 1e9; chat.history.push({ role: 'assistant', text }); },
    me(text) { const d = document.createElement('div'); d.className = 'msg me'; d.textContent = text; msgs.appendChild(d); msgs.scrollTop = 1e9; chat.history.push({ role: 'user', text }); },
    card(html) { const d = document.createElement('div'); d.className = 'msg card'; d.innerHTML = html; msgs.appendChild(d); msgs.scrollTop = 1e9; return d; },
    chips(list, onPick = q => chat.ask(q)) {
      const c = $('.chips'); c.innerHTML = '';
      list.forEach(t => { const b = document.createElement('button'); b.type = 'button'; b.textContent = t; b.onclick = () => onPick(t); c.appendChild(b); });
    },
    // Show a reply after a short "typing" delay so the exchange reads naturally.
    later(fn, ms = 450) { setTimeout(fn, ms); },
    aiMode: false,
    ask(q) {
      chat.me(q);
      if (chat.aiMode && q === ai.exitChip) return chat.stopAI();
      chat.aiMode ? askAI(q) : chat.later(() => handle(q, chat));
    },
    stopAI() { chat.aiMode = false; chat.ai('ほかのことも聞いてください。'); chat.chips(greet().chips); },
    // Link buttons under a reply. Titles are set as text, and only https links to the campaign site are accepted.
    links(list) {
      const ok = (Array.isArray(list) ? list : []).filter(l => l && typeof l.url === 'string' && l.url.startsWith(LINK_ORIGIN)).slice(0, 3);
      if (!ok.length) return;
      const el = chat.card('<div class="links"></div>');
      ok.forEach(l => {
        const a = document.createElement('a');
        a.href = l.url; a.target = '_blank'; a.rel = 'noopener noreferrer';
        a.textContent = `🔗 ${l.title || 'くわしく見る'}`;
        el.firstChild.appendChild(a);
      });
    },
    launch(action, params) {
      chat.card(`<div class="launch">🚀 「${ACTION_NAME[action]}」を開きます…</div>`);
      setTimeout(() => location.href = ACTION_URL[action](params), 900);
    },
    open() {
      root.classList.add('open');
      // Let the server start reading the campaign list now, so the first answer isn't slow.
      if (ai && !chat.warmed) {
        chat.warmed = true;
        fetch(AI_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ page: ai.page, warm: true }) }).catch(() => {});
      }
      if (!msgs.children.length) { const g = greet(); chat.ai(g.text); chat.chips(g.chips); }
    },
    close() { root.classList.remove('open'); },
  };
  // Ask the AI; if the relay can't be reached, answer with the built-in rules instead.
  let offlineNoted = false;
  async function askAI(q) {
    const typing = chat.card('<div class="typing">考え中…</div>');
    let r;
    try {
      const res = await fetch(AI_URL, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ page: ai.page, facts: ai.facts(), account: consentedAccount(), granted: Object.keys(SCOPES).filter(s => Link.granted(s)), messages: chat.history.slice(-12) }),
      });
      r = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(`${res.status} ${r.error || ''}`.trim());
    } catch (e) {
      typing.remove();
      console.error('pay-assistant', e);
      // Show why, so a broken deploy or missing key is visible on the phone.
      if (!offlineNoted) { offlineNoted = true; chat.card(`<div class="authing">AIに接続できないため、簡易モードで答えます<br><small>理由：${String(e.message || e).replace(/[<>&]/g, '')}</small></div>`); }
      chat.aiMode = false;
      return ai.offline(chat);
    }
    typing.remove();
    // The consent card explains itself, so the AI's own "need permission" line isn't shown.
    if (r.action === 'need_consent') return withConsent(chat, r.scopes, () => askAI(q));
    chat.ai(r.reply);
    chat.links(r.links);
    if (r.debug) {
      console.info('pay-assistant', r.debug);
      chat.card(`<div class="typing" style="font-size:11px">⏱ ${(r.debug.ms / 1000).toFixed(1)}秒（${r.debug.model} / 思考:${r.debug.used}${r.debug.rejected.length ? ' / 不可:' + r.debug.rejected.join(',') : ''}）／特集:${r.debug.source}${r.debug.campaignStatus ? '(' + r.debug.campaignStatus + ')' : ''}</div>`);
    }
    if (ACTION_URL[r.action]) return chat.launch(r.action, r.params);
    chat.chips([...(r.chips || []).slice(0, 3), ai.exitChip]);
  }

  chat.askAI = askAI;
  $('.ai-fab').onclick = chat.open;
  $('.close').onclick = chat.close;
  $('.sheet-bg').onclick = chat.close;
  $('.composer').onsubmit = e => { e.preventDefault(); const i = $('.composer input'); const q = i.value.trim(); if (q) { chat.ask(q); i.value = ''; } };
  setupVoice($('.mic'), $('.composer input'), q => chat.ask(q));
  return chat;
}

// Voice input via the browser's speech recognition (Chrome, Edge, Safari). Hidden where unsupported.
function setupVoice(btn, input, onDone) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return;
  btn.hidden = false;
  let rec = null;
  btn.onclick = () => {
    if (rec) { rec.stop(); return; }
    rec = new SR();
    rec.lang = 'ja-JP';
    rec.interimResults = true;
    btn.classList.add('on'); input.placeholder = '話してください…';
    rec.onresult = e => {
      const r = e.results[e.results.length - 1];
      input.value = [...e.results].map(x => x[0].transcript).join('');
      if (r.isFinal) { const q = input.value.trim(); input.value = ''; if (q) onDone(q); }
    };
    rec.onend = rec.onerror = () => { rec = null; btn.classList.remove('on'); input.placeholder = '質問を入力'; };
    rec.start();
  };
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

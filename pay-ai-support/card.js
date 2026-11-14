// カードの券面にスワイプしたときの、問い合わせ項目（コールリーズンをもとにした一覧）
const CARD_REASONS = [
  { id: 'cancel', q: '手元にあるカードを解約したい', a: 'カードの解約は、アプリの「カード」→「カードの解約」から手続きできます。\n解約すると、ポイントの引き継ぎや、カードに紐づくお支払い設定（公共料金など）が使えなくなります。先にご確認ください。\n手元のカードは、解約の手続きのあと、ハサミで切って処分してください（ICチップと磁気帯に切り込みを入れます）。' },
  { id: 'unusable', q: 'カードを利用できない原因を確認したい', a: '次のような原因が考えられます。\n・利用限度額に達している\n・お支払いの遅れや、引き落とし口座の残高不足\n・暗証番号を連続して間違えて、ロックされている\n・不正利用の疑いで、一時的に止められている\n・カードの有効期限が切れている\n心当たりのあるものを選んでください。分からないときは、アプリの「カード」→「ご利用状況」で、止まっている理由を確認できます。' },
  { id: 'fraud', q: '身に覚えのないカード請求への対応を確認したい', a: '身に覚えのない請求を見つけたときは、次の順で対応してください。\n① すぐに、アプリの「カード」→「カードの一時停止」で、カードを止めます。\n② 利用明細で、日付・店舗・金額を確認します。家族の利用や、定期払いの引き落としではないかも、確認してください。\n③ 心当たりがなければ、カード会社に連絡して、調査を依頼します。\n不正利用だと確認できた場合は、補償の対象になることがあります（届け出の期限があります）。' },
  { id: 'switch', q: '郵送で上位カードから下位カードへの切替手続きをしたい', a: '上位のカード（例：ゴールド）から、下位のカード（例：一般）への切り替えは、郵送の書類でも手続きできます。\n① 「カード」→「カードの切り替え」で、切り替えの申込書を請求します（数日で届きます）。\n② 申込書に記入して、返信用封筒で返送します。\n③ 手続き完了後、新しいカードが届きます。\n切り替えると、特典の内容や年会費が変わります。ポイントは引き継がれます。' },
  { id: 'reship', q: '預かり中のカードの発送を依頼したい', a: '不在などで、カード会社が預かっているカードは、発送を依頼できます。\n「カード」→「預かり中のカード」から、受け取りたい日時と、送り先の住所を選んでください。\n送り先は、ご本人の住所のみです。依頼から数日でお届けします（本人限定の受け取りです）。' },
  { id: 'applepay', q: 'Apple Payでカードを利用するため電話認証を完了したい', a: 'Apple Payにカードを登録したあと、ご本人確認として、電話での認証が必要です。\n① Apple Payのカードの画面に出ている、認証の電話番号に発信してください。\n② 音声ガイダンスに沿って、カードの暗証番号や、生年月日を入力します。\n③ 認証が完了すると、Apple Payで使えるようになります。\nなお、認証の電話は、ご登録の電話番号からおかけください。' },
  { id: 'unknown', menu: false, q: '用件不明のため問い合わせ内容を確認したい', a: '問い合わせの内容が、はっきりしないときは、次のうち近いものを選んでください。\n・カードが使えない\n・請求の内容が分からない\n・手続き（解約・住所変更など）をしたい\n・紛失・盗難にあった\n・ポイントについて知りたい\n入力で、困っていることを書いていただいても大丈夫です。' },
  { id: 'renew', menu: false, q: '更新カードの発送', a: '有効期限が近いカードは、期限の前に、新しい更新カードが自動で届きます（期限の1〜2か月前に発送）。\n届いていないときは、「カード」→「更新カードの発送状況」で、発送の状況を確認できます。住所に不備があると、届かずに戻ってしまうため、ご住所もご確認ください。\n新しいカードが届いたら、古いカードは、ハサミで切って処分してください。' },
  { id: 'apply', menu: false, q: 'カードの申込', a: 'カードの新規のお申し込みは、アプリの「カード」→「カードを申し込む」から、最短5分ほどで手続きできます。\n必要なもの：本人確認書類（マイナンバーカードや運転免許証）、引き落とし口座（銀行口座）。\n審査のあと、カードは、約1週間で届きます。一部のお店では、届く前でもアプリで使えます。' },
  { id: 'poikatsu', q: 'ポイ活 MAXが現在の料金プランより得か比較したい', a: '「ポイ活 MAX」が、いまのプランより得かどうかは、毎月のご利用額で変わります。\n目安：毎月のカードのご利用額が多いほど、ポイントで得になりやすいです。\n正確な比較は、「利用サービス」の画面で、いまの倍率と、ポイ活 MAXにしたときの倍率を並べて確認できます。開いて、比べてみましょう。' },
  { id: 'address', q: '住所不備', a: 'ご登録の住所に不備があると、カードや書類が届かず、戻ってきてしまうことがあります。\n「カード」→「登録情報の変更」→「住所」から、都道府県・番地・建物名・部屋番号まで、正しく入力し直してください。\n変更後、戻ってきているカードや書類は、あらためて発送されます（発送の依頼が必要な場合があります）。' },
  { id: 'unlock', q: 'カードの暗証番号ロックを解除したい', a: '暗証番号を連続して間違えると、カードがロックされます。\n解除の方法：「カード」→「暗証番号のロックの解除」で、本人確認（認証）をしてください。解除後に、新しい暗証番号を設定できます。\nお急ぎのときや、アプリで解除できないときは、カード会社のサポートへお問い合わせください。' },
  { id: 'stop', q: '不正利用のおそれがあるカードを停止したい', a: '不正利用のおそれがあるときは、すぐにカードを止めてください。\n「カード」→「カードの一時停止」で、今すぐ止められます（24時間いつでも）。止めても、再開は、いつでもできます。\n紛失・盗難や、不正利用が確認できたときは、カードの再発行も手続きしてください。身に覚えのない請求がある場合は、調査も依頼してください。' },
  { id: 'lost', q: 'カードをなくした', a: 'カードを紛失したときは、悪用を防ぐため、すぐにカードを一時停止してください。\n「カード」→「カードの一時停止」で、24時間いつでも止められます（見つかったときは、再開もできます）。\n見つからないときは、カードの再発行を手続きしてください。不正利用があった場合の補償もあるので、あわせてカスタマーセンターへご連絡ください。' },
];

// ---------- 会話の流れ ----------
// 問い合わせ項目を選ぶと、いくつか質問して状況をしぼり、最後は「QA（よくある質問）」か「手続き・設定」に進む。
// hear / withConsent は chat.js、setCardRank / setCardStopped / PERSONAL / DEFAULT_CHIPS はホーム（index.html）にある。
const reasonOf = (id) => CARD_REASONS.find((r) => r.id === id);

// 最後：QA（答えと、QAのページへのリンク）
function toQA(chat, id, lead) {
  if (lead) chat.ai(lead);
  chat.ai(reasonOf(id).a);
  chat.launchLink('よくある質問（QA）を見る', 'qa.html#' + id);
  chat.chips(DEFAULT_CHIPS);
}

// 入力フォーム：手続きに必要な項目を入力してもらう（必須・形式のチェックつき）
let cardFormSeq = 0;
function askForm(chat, { title, fields, submit = '入力内容の確認へ' }, onSubmit) {
  chat.chips([]);
  chat.history.push({ role: 'assistant', text: title });
  const el = chat.card('<div class="qform"><b class="q"></b><div class="flds"></div><div class="ferr" role="alert"></div><button type="button" class="go"></button></div>');
  el.querySelector('.q').textContent = title;
  el.querySelector('.go').textContent = submit;
  const box = el.querySelector('.flds'), ctl = [];
  fields.forEach((f) => {
    const w = document.createElement('div'); w.className = 'fld';
    const id = 'cf' + (++cardFormSeq);
    let input;
    if (f.type === 'check') {
      w.className = 'fld chk';
      const lb = document.createElement('label'); lb.htmlFor = id;
      input = document.createElement('input'); input.type = 'checkbox'; input.id = id;
      const sp = document.createElement('span'); sp.textContent = f.label;
      lb.append(input, sp); w.append(lb);
    } else {
      const lb = document.createElement('label'); lb.className = 'lb'; lb.htmlFor = id; lb.textContent = f.label + (f.required === false ? '（任意）' : '');
      w.append(lb);
      if (f.type === 'select') {
        input = document.createElement('select'); input.id = id;
        f.options.forEach((o) => { const op = document.createElement('option'); op.value = o; op.textContent = o; input.append(op); });
        if (f.value) input.value = f.value;
      } else {
        input = document.createElement('input'); input.id = id; input.type = f.type === 'password' ? 'password' : 'text';
        if (f.cls) input.className = f.cls;
        input.autocomplete = 'off'; if (f.type === 'tel' || f.type === 'password') input.inputMode = 'numeric';
        if (f.placeholder) input.placeholder = f.placeholder; if (f.max) input.maxLength = f.max;
      }
      w.append(input);
      if (f.hint) { const h = document.createElement('small'); h.textContent = f.hint; w.append(h); }
    }
    box.append(w); ctl.push([f, input]);
  });
  el.querySelector('.go').onclick = () => {
    const err = el.querySelector('.ferr'); err.textContent = '';
    const vals = {}, lines = [];
    for (const [f, input] of ctl) {
      const v = f.type === 'check' ? input.checked : input.value.trim();
      if (f.type === 'check') { if (!v) { err.textContent = '「' + f.label.slice(0, 18) + '…」にチェックしてください。'; input.focus(); return; } continue; }
      if (!v && f.required !== false) { err.textContent = f.label + 'を入力してください。'; input.focus(); return; }
      if (v && f.pattern && !f.pattern.test(v)) { err.textContent = f.label + 'を、' + (f.msg || '正しい形式') + 'で入力してください。'; input.focus(); return; }
      vals[f.key] = v;
      lines.push('・' + f.label + '：' + (f.type === 'password' ? '••••' : v || '（なし）'));
    }
    ctl.forEach(([, i]) => { i.disabled = true; });
    el.querySelector('.go').hidden = true; el.classList.add('done');
    chat.me('入力しました'); chat.later(() => onSubmit(vals, lines));
  };
}
const PIN_FIELD = { key: 'pin', cls: 'pin', label: 'カードの暗証番号（4桁）', type: 'password', max: 4, pattern: /^\d{4}$/, msg: '数字4桁', hint: '本人確認に使います。保存はされません（デモ）。' };
const TEL_FIELD = { key: 'tel', label: 'ご連絡先の電話番号', type: 'tel', max: 11, pattern: /^0\d{9,10}$/, msg: 'ハイフンなしの10〜11桁の数字', placeholder: '09012345678' };

// 最後：手続き・設定（入力 → 確認 → 実行（デモ）→ 完了のお知らせ）
// fields があるときは、先に入力フォームを出す。done は、文字、または、入力内容を受け取る関数
function doAct(chat, { ask, yes = 'はい', run, done, fields, formTitle }) {
  if (fields) {
    return askForm(chat, { title: formTitle, fields }, (vals, lines) => doAct(chat, { ask: ask + '\n\n【入力内容】\n' + lines.join('\n'), yes, run: () => run && run(vals), done: typeof done === 'function' ? done(vals) : done }));
  }
  hear(chat, ask, [yes, 'やめる'], (a) => {
    if (a !== yes) { chat.ai('手続きは行いませんでした。ほかにお困りのことがあれば、選んでください。'); return chat.chips(DEFAULT_CHIPS); }
    // 手続きの実行の前に、生体認証（顔・指紋）でご本人確認
    biometric(chat, () => {
      const el = chat.card('<div class="authing">' + ic('lock') + ' 手続き中…（デモ）</div>');
      setTimeout(() => {
        el.innerHTML = '<div class="authing ok">✓ 受け付けました</div>';
        if (run) run();
        chat.ai(done);
        chat.chips(DEFAULT_CHIPS);
      }, 900);
    }, { purpose: 'お手続きを行う前に、ご本人確認をします。顔または指紋で認証してください。', cancelMsg: '認証をやめたので、手続きは行いませんでした。' });
  });
}

const CARD_FLOWS = {
  cancel: (chat) => hear(chat, '解約をお考えなのですね。差し支えなければ、理由を教えてください。', ['年会費が高い', 'あまり使わなくなった', '別のカードにしたい', '不正利用が心配'], (a) => {
    const cancelAct = () => doAct(chat, {
      formTitle: 'カードの解約のお手続き（入力）',
      fields: [
        { key: 'reason', label: '解約の理由', type: 'select', options: ['年会費が高い', 'あまり使わなくなった', '別のカードにする', 'そのほか'], value: a === '別のカードにしたい' ? '別のカードにする' : a === '年会費が高い' ? '年会費が高い' : a === 'あまり使わなくなった' ? 'あまり使わなくなった' : 'そのほか' },
        { key: 'point', label: 'ポイントの扱い', type: 'select', options: ['解約の前に使い切る', '別のカードに引き継ぐ', 'そのまま失効してよい'] },
        TEL_FIELD, PIN_FIELD,
        { type: 'check', label: '解約すると、カードに紐づく支払い設定（公共料金など）が使えなくなることを理解しました' },
      ],
      ask: 'カードの解約を申し込みます。よろしいですか？', yes: '解約を申し込む',
      done: (v) => `解約の申込を受け付けました（デモ）。\n手続き完了のお知らせは、${v.tel} にSMSでお送りします。\nポイントは「${v.point}」で承りました。`,
    });
    if (a === '年会費が高い') {
      return hear(chat, '一般のカードに切り替えると、年会費を抑えられます（ポイントは引き継がれます）。どうしますか？', ['一般に切り替える', 'それでも解約したい', 'QAを見る'], (b) => {
        if (b === '一般に切り替える') return doAct(chat, { ask: 'カードを、一般に切り替えます。よろしいですか？', run: () => setCardRank('normal'), done: 'カードを一般に切り替えました（デモ）。ホームのカードの券面も、一般に戻っています。' });
        if (b === 'QAを見る') return toQA(chat, 'cancel');
        cancelAct();
      });
    }
    if (a === 'あまり使わなくなった') {
      return hear(chat, '解約すると、ポイントの引き継ぎや、カードに紐づく支払い設定（公共料金など）が使えなくなります。解約しますか？', ['解約する', 'QAを見る'], (b) => (b === '解約する' ? cancelAct() : toQA(chat, 'cancel')));
    }
    if (a === '別のカードにしたい') { chat.ai('別のカードのお申し込みをご案内します。'); return CARD_FLOWS.apply(chat); }
    chat.ai('不正利用が心配なときは、解約の前に、カードを一時停止できます。'); CARD_FLOWS.stop(chat);
  }),

  unusable: (chat) => hear(chat, '利用できない原因として、近いものを選んでください。', ['利用限度額に達した', '引き落としの残高不足', '暗証番号のロック', '一時停止中', '有効期限切れ', '心当たりがない'], (a) => {
    if (a === '暗証番号のロック') return CARD_FLOWS.unlock(chat);
    if (a === '一時停止中') return doAct(chat, { ask: 'カードの一時停止を、解除します。よろしいですか？', yes: '一時停止を解除する', run: () => setCardStopped(false), done: '一時停止を解除しました（デモ）。すぐにお使いいただけます。' });
    if (a === '有効期限切れ') return CARD_FLOWS.renew(chat);
    if (a === '利用限度額に達した') return toQA(chat, 'unusable', '利用限度額に達していると、翌月の引き落としのあと、また使えるようになります。限度額の増額は、審査のうえでご案内します。');
    if (a === '引き落としの残高不足') return toQA(chat, 'unusable', '引き落とし口座にご入金いただくと、数日で、また使えるようになります。');
    toQA(chat, 'unusable');
  }),

  fraud: (chat) => hear(chat, '身に覚えのない請求がありますか？', ['ある', 'ない、念のため止めたい'], (a) => {
    if (a === 'ある') return doAct(chat, {
      formTitle: '請求の調査と、カードの一時停止（入力）',
      fields: [
        { key: 'what', label: '身に覚えのない請求（日付・金額・お店）', type: 'text', placeholder: '例：11/5 12,800円 ○○ネットショップ' },
        TEL_FIELD, PIN_FIELD,
      ],
      ask: '次の2つを行います。\n① カードを一時停止する\n② 請求の調査を依頼する\nよろしいですか？', yes: '一時停止して、調査を依頼する', run: () => setCardStopped(true),
      done: (v) => `カードを一時停止し、調査の依頼を受け付けました（デモ）。\n対象：${v.what}\n結果は、${v.tel} にSMSでお知らせします。ホームのカードは「一時停止中」の表示になっています。`,
    });
    CARD_FLOWS.stop(chat);
  }),

  stop: (chat, reason) => doAct(chat, {
    formTitle: 'カードの一時停止のお手続き（入力）',
    fields: [
      { key: 'reason', label: '停止の理由', type: 'select', options: ['紛失した', '盗まれた', '不正利用の疑いがある', 'しばらく使わない'], value: reason },
      { key: 'last', label: '最後に使った日・お店', type: 'text', required: false, placeholder: '例：11/8 コンビニ' },
      PIN_FIELD,
    ],
    ask: 'カードを、今すぐ一時停止します。よろしいですか？（再開は、いつでもできます）', yes: '一時停止する', run: () => setCardStopped(true),
    done: (v) => `カードを一時停止しました（デモ）。理由：${v.reason}\nホームのカードは「一時停止中」の表示になっています。\n再開するときは、もう一度、カードのメニューから「カードを利用できない原因を確認したい」を選んでください。${/紛失|盗/.test(v.reason) ? '\n紛失・盗難の場合は、カードの再発行も手続きしてください。' : ''}`,
  }),

  switch: (chat) => hear(chat, '上位のカードから、下位（一般）のカードへの切り替えですね。どちらの方法にしますか？', ['アプリで今すぐ切り替える', '郵送の書類で手続きする'], (a) => (a.startsWith('アプリ')
    ? doAct(chat, { ask: 'カードを、一般に切り替えます。特典や年会費が変わります。よろしいですか？', run: () => setCardRank('normal'), done: 'カードを一般に切り替えました（デモ）。ホームのカードの券面も、一般に戻っています。' })
    : doAct(chat, { ask: '切り替えの申込書を、郵送で請求します。よろしいですか？', done: '申込書を請求しました（デモ）。数日でお届けします。記入して、返信用封筒で返送してください。' }))),

  reship: (chat) => hear(chat, '預かり中のカードの発送ですね。受け取りの希望を選んでください。', ['明日の午前', '明日の午後', '今週末'], (a) => doAct(chat, { ask: `${a}に、ご本人の住所へ発送します（本人限定の受け取りです）。よろしいですか？`, done: `発送を依頼しました（デモ）。${a}に、お届けします。` })),

  applepay: (chat) => hear(chat, 'Apple Payには、すでにカードを登録しましたか？', ['登録した', 'これから登録する'], (a) => {
    if (a !== '登録した') return toQA(chat, 'applepay', 'まず、Apple Payのウォレットで、カードを登録してください。そのあと、電話での認証が必要です。');
    hear(chat, '認証の電話（ご登録の電話番号から）は、もう、かけましたか？', ['かけた', 'まだ'], (b) => (b === 'かけた'
      ? doAct(chat, { ask: '認証の状況を、確認します。よろしいですか？', yes: '確認する', done: '電話認証が完了していることを確認しました（デモ）。Apple Payで、お使いいただけます。' })
      : toQA(chat, 'applepay')));
  }),

  unknown: (chat) => hear(chat, 'お問い合わせの内容に、近いものを選んでください。', ['カードが使えない', '請求の内容が分からない', '手続きをしたい', '紛失・盗難にあった'], (a) => {
    if (a === 'カードが使えない') return CARD_FLOWS.unusable(chat);
    if (a === '紛失・盗難にあった') return CARD_FLOWS.fraud(chat);
    if (a === '請求の内容が分からない') { const p = PERSONAL.find((e) => e.k.includes('請求')); return withConsent(chat, p.scopes, () => p.run(chat)); }
    hear(chat, 'どの手続きですか？', ['解約', '住所の変更', 'カードの申込', '暗証番号のロック解除'], (b) => ({ 解約: CARD_FLOWS.cancel, 住所の変更: CARD_FLOWS.address, カードの申込: CARD_FLOWS.apply, 暗証番号のロック解除: CARD_FLOWS.unlock })[b](chat));
  }),

  renew: (chat) => hear(chat, '更新カードは、もう届いていますか？', ['届いていない', '届いた'], (a) => {
    if (a === '届いた') return toQA(chat, 'renew', '新しいカードが届いたら、古いカードは、ハサミで切って処分してください。');
    hear(chat, 'ご登録の住所は、正しいですか？', ['正しい', '変わった・自信がない'], (b) => (b === '正しい'
      ? doAct(chat, { ask: '更新カードの再発送を、依頼します。よろしいですか？', yes: '再発送を依頼する', done: '更新カードの再発送を依頼しました（デモ）。数日でお届けします。' })
      : CARD_FLOWS.address(chat)));
  }),

  apply: (chat) => hear(chat, 'カードのお申し込みですね。カードの種類を選んでください。', ['一般', 'ゴールド'], (kind) => hear(chat, '本人確認の書類は、どちらを使いますか？', ['マイナンバーカード', '運転免許証'], (doc) => doAct(chat, { ask: `${kind}カードを、${doc}で申し込みます。引き落とし口座は、ご登録の口座です。よろしいですか？`, yes: '申し込む', done: `${kind}カードのお申し込みを受け付けました（デモ）。審査のあと、約1週間でお届けします。` }))),

  poikatsu: (chat) => hear(chat, '毎月のカードのご利用は、どのくらいですか？', ['毎月たくさん使う', 'あまり使わない'], (a) => {
    if (a === 'あまり使わない') return toQA(chat, 'poikatsu');
    chat.ai('たくさんお使いの場合は、ポイ活 MAXの方が、得になりやすいです。「利用サービス」の画面で、倍率を並べて、比べてみましょう。');
    chat.launch('open_services_ai');
  }),

  address: (chat) => hear(chat, 'ご住所について、近いものを選んでください。', ['引っ越した', '番地・部屋番号が抜けている'], (a) => doAct(chat, {
    formTitle: 'ご登録の住所の変更（入力）',
    fields: [
      { key: 'zip', label: '郵便番号', type: 'tel', max: 7, pattern: /^\d{7}$/, msg: 'ハイフンなしの7桁の数字', placeholder: '1000001' },
      { key: 'addr', label: '都道府県・市区町村・番地', type: 'text', placeholder: '例：東京都千代田区千代田1-1' },
      { key: 'bld', label: '建物名・部屋番号', type: 'text', required: false, placeholder: '例：○○マンション 101' },
    ],
    ask: `ご登録の住所の変更（${a}）を、手続きします。よろしいですか？`, yes: '手続きする',
    done: (v) => `住所の変更を受け付けました（デモ）。\n新しいご住所：〒${v.zip} ${v.addr} ${v.bld}\n戻ってきているカードや書類は、あらためて発送します。`,
  })),

  lost: (chat) => { chat.ai('カードをなくされたのですね。悪用を防ぐため、すぐにカードを一時停止しましょう。'); CARD_FLOWS.stop(chat, '紛失した'); },

  unlock: (chat) => doAct(chat, {
    formTitle: '暗証番号のロック解除（本人確認）',
    fields: [
      { key: 'birth', label: '生年月日（8桁）', type: 'tel', max: 8, pattern: /^\d{8}$/, msg: '西暦8桁の数字', placeholder: '19900101' },
      { key: 'pin', cls: 'pin', label: '新しい暗証番号（4桁）', type: 'password', max: 4, pattern: /^\d{4}$/, msg: '数字4桁', hint: '推測されやすい番号（1234など）は避けてください。' },
    ],
    ask: '本人確認のうえ、暗証番号のロックを解除します。よろしいですか？', yes: '解除する',
    done: 'ロックを解除し、新しい暗証番号を設定しました（デモ）。',
  }),
};
// 項目 → 会話の流れ（「不正利用のおそれがあるカードを停止したい」は、一時停止の手続きへ）
const flowOf = (id) => CARD_FLOWS[id];

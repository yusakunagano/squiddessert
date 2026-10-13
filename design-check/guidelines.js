// デザインチェッカーが参照するガイドライン集。
// 各ガイドラインの「チェック観点」をAIへのプロンプトに埋め込む。
// 観点を追加・修正したいときはこのファイルを編集する。

export const GUIDELINES = {
  apple: {
    name: 'Apple Human Interface Guidelines',
    url: 'https://developer.apple.com/design/human-interface-guidelines/',
    checks: [
      'タップ領域は最低 44×44pt 確保されているか',
      '本文は 17pt 前後（Dynamic Type に対応できる構成）か、最小 11pt を下回っていないか',
      'セーフエリア（ノッチ・ホームインジケータ）に要素が食い込んでいないか',
      'ナビゲーションバー／タブバー（タブは 3〜5 個）など標準パターンに沿っているか',
      'Clarity（明瞭さ）・Deference（コンテンツ優先）・Depth（階層）が保たれているか',
      'SF Symbols などシステムアイコンと意味の一致、ラベルの有無',
      'ダークモード・システムカラーへの対応が想定されているか',
      '破壊的操作は赤系＋確認（アラート／アクションシート）になっているか',
    ],
  },
  material: {
    name: 'Google Material Design 3',
    url: 'https://m3.material.io/',
    checks: [
      'タッチターゲットは最低 48×48dp か',
      '8dp グリッド（4dp の細分）に沿った余白・配置か',
      'タイポグラフィスケール（Display/Headline/Title/Body/Label）が一貫しているか',
      'カラーロール（Primary/Secondary/Tertiary/Surface/Error）の使い分けが明確か',
      'FAB は 1 画面 1 つ・最重要アクションのみに使われているか',
      'エレベーション（トーンや影）で階層が表現されているか',
      '状態（hover / focus / pressed / disabled）が視覚的に区別できるか',
      'ナビゲーション（Navigation bar / rail / drawer）が画面幅に適切か',
    ],
  },
  paypay: {
    name: 'PayPay 系 国内決済・金融アプリのUXパターン',
    url: 'https://about.paypay.ne.jp/',
    note: 'PayPay社は網羅的なデザインガイドラインを一般公開していないため、公開されているアプリの設計傾向や国内決済アプリの定石を観点化したもの',
    checks: [
      '主要アクション（支払う・スキャン・送る）がファーストビューで親指の届く位置にあるか',
      '金額は最も大きく、桁区切り・通貨記号付きで誤読しないか',
      '支払い・送金など不可逆操作の前に確認画面や内容の再表示があるか',
      '完了時のフィードバック（アニメーション・音・明確な完了表示）があるか',
      'ブランドカラー（赤）を CTA やアクセントに限定し、エラーの赤と混同しないか',
      'キャンペーン・バナーが主要導線を邪魔していないか',
      '高齢者や初心者でも分かる平易な日本語・アイコン＋ラベルになっているか',
      '残高・ポイントなどの重要情報がひと目で把握できるか',
    ],
  },
  nielsen: {
    name: 'ニールセンの10のユーザビリティヒューリスティクス',
    url: 'https://www.nngroup.com/articles/ten-usability-heuristics/',
    checks: [
      'システム状態の可視化', '実世界との一致（ユーザーの言葉）', 'ユーザーの主導権と自由（取り消し・戻る）',
      '一貫性と標準', 'エラーの予防', '記憶より認識', '柔軟性と効率性',
      '美的で最小限のデザイン', 'エラーの認識・診断・回復の支援', 'ヘルプとドキュメント',
    ],
  },
  wcag: {
    name: 'WCAG 2.2（アクセシビリティ）',
    url: 'https://www.w3.org/TR/WCAG22/',
    checks: [
      'テキストのコントラスト比 4.5:1 以上（大きい文字は 3:1）',
      'UI 部品・アイコンのコントラスト比 3:1 以上',
      '色だけで情報を伝えていないか（エラーを色＋テキスト／アイコンで示す）',
      'ターゲットサイズ最低 24×24 CSS px（2.5.8）',
      'フォーカスが見えるか・隠れていないか',
      '画像に代替テキストが想定されているか、フォームにラベルがあるか',
      '200% 拡大やリフロー（幅 320px）で崩れないか',
    ],
  },
  digital_agency: {
    name: 'デジタル庁デザインシステム',
    url: 'https://design.digital.go.jp/',
    checks: [
      '日本語本文の行間（1.7 前後）・字間・1行の文字数（35〜40字程度）が読みやすいか',
      'フォームの必須／任意表示、入力例、エラーメッセージが具体的か',
      'ボタンの種類（塗り・枠線・テキスト）で優先度が明確か',
      '見出しレベルが論理的な階層になっているか',
    ],
  },
  laws_of_ux: {
    name: 'Laws of UX（UXの法則）',
    url: 'https://lawsofux.com/',
    checks: [
      'フィッツの法則：重要ボタンは大きく近いか',
      'ヒックの法則：選択肢が多すぎないか',
      'ミラーの法則／チャンキング：情報がまとまりで区切られているか',
      'ヤコブの法則：一般的なサービスの慣習に沿っているか',
      'ゲシュタルトの近接・類同：関連要素がグルーピングされているか',
      'ピーク・エンドの法則：完了体験が良いか',
    ],
  },
};

export const DEFAULT_GUIDELINES = ['apple', 'material', 'nielsen', 'wcag'];

export function buildGuidelineText(keys) {
  return keys
    .filter((k) => GUIDELINES[k])
    .map((k) => {
      const g = GUIDELINES[k];
      const note = g.note ? `（注: ${g.note}）` : '';
      return `### ${g.name} [id: ${k}]${note}\n${g.checks.map((c) => `- ${c}`).join('\n')}`;
    })
    .join('\n\n');
}

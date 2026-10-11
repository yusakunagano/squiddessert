# squiddessert

## AI 職業診断

20 の質問に答えると、Google Gemini（`gemini-flash-lite-latest`）があなたの性格と向いている職業を診断します。
診断には 30 秒〜1 分ほどかかり、待っている間はミニゲーム「ハンコ連打」で遊べます。
結果には、あなたの性格、いちばん向いている職業（名刺風のカード）、仕事タイプ、傾向（創造力・協調性・分析力・行動力）、ほかに向いている職業 2 つ、向いていないかもしれない職業 2 つ、一緒に働くと相性の良い職業の人・ぶつかりやすい職業の人（うまく付き合うコツ付き）、強み、生活する上で気を付けること、最初の一歩のアドバイスが表示されます。

- `job/index.html` … 診断ページ（静的 HTML）
- `api/diagnose.js` … Gemini API を呼び出すサーバーレス関数（Vercel 形式）

### API キーの発行

1. [Google AI Studio](https://aistudio.google.com/apikey) に Google アカウントでログインし、API キーを作成
2. キーは GitHub に書き込まず、下の手順で Vercel の環境変数に設定

Gemini API には無料枠があります（回数の上限あり）。無料枠では送信内容が Google のサービス改善に使われる場合があるため、公開前に最新の料金と利用規約を確認してください。

### デプロイ（Vercel）

1. このリポジトリを Vercel にインポート
2. 環境変数 `GEMINI_API_KEY` を設定
3. デプロイ後 `https://<your-app>.vercel.app/job/` を開く

API キーはサーバー側だけで使われ、ブラウザには公開されません。
GitHub Pages など静的ホスティングにページを置く場合は、`job/index.html` の `API_URL` を Vercel 側の URL に変更してください（その場合は CORS の設定が必要です）。

### ローカルで動かす

```bash
npm install
GEMINI_API_KEY=... npx vercel dev
# → http://localhost:3000/job/
```

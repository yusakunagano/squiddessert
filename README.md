# squiddessert

## AI職業サポート

10 問または 20 問の質問に答えると、Google Gemini（`gemini-flash-lite-latest`）があなたの性格と向いている職業を診断します。
10 問答えたところで「ここで結果を見る」か「あと 10 問答えて詳しく診断する」かを選べます。10 問で見た結果からも、残りの 10 問に答えて診断し直せます。
診断には 30 秒〜1 分ほどかかり、待っている間はミニゲーム「コバエたたき」で遊べます。
結果には、あなたの性格、いちばん向いている職業（名刺風のカード）とその職業の年収の目安、日本で就いている人の数、業界の楽しいこと・大変なこと、これから訪れる変化、代表的な会社 20 社、役立つ資格（最大 10 件）、仕事タイプ、傾向（創造力・協調性・分析力・行動力）、ほかに向いている職業 2 つ、向いていないかもしれない職業 2 つ、一緒に働くと相性の良い職業の人・ぶつかりやすい職業の人（うまく付き合うコツ付き）、結婚するなら相性の良い職業の人、強み、生活する上で気を付けること（ひとつながりの文章）、最初の一歩のアドバイスが表示されます。
結果には、向いている職業の求人をリクナビNEXT（転職）・リクナビ（新卒）で探すリンク（Google のサイト内検索）も表示します。
結果の最後には、診断された職業について AI に質問できるチャットがあります（1 回の診断につき 3 回まで）。「結果をすべてコピー」で結果・回答・チャットをまとめてコピーでき、ChatGPT・Gemini・Claude などに貼り付けて相談を続けられます。

- `job/index.html` … 診断ページ（静的 HTML）
- `api/diagnose.js` … 診断を行うサーバーレス関数（Vercel 形式、Gemini API を使用）
- `api/chat.js` … 職業についてのチャットに答えるサーバーレス関数
- `api/_shared.js` … 上の 2 つで共通の処理（Gemini の設定、CORS、エラー処理）

### API キーの発行

1. [Google AI Studio](https://aistudio.google.com/apikey) に Google アカウントでログインし、API キーを作成
2. キーは GitHub に書き込まず、下の手順で Vercel の環境変数に設定

Gemini API には無料枠があります（回数の上限あり）。無料枠では送信内容が Google のサービス改善に使われる場合があるため、公開前に最新の料金と利用規約を確認してください。

### デプロイ（Vercel）

1. このリポジトリを Vercel にインポート
2. 環境変数 `GEMINI_API_KEY` を設定
3. デプロイ後 `https://<your-app>.vercel.app/job/` を開く

API キーはサーバー側だけで使われ、ブラウザには公開されません。利用者が API キーを入力する必要はありません。

GitHub Pages の `job/` ページから使う場合は、`job/index.html` の `API_ORIGIN` に Vercel の URL（`https://squiddessert.vercel.app`）を設定済みです。
API は `https://yusakunagano.github.io` からの呼び出しを許可しています（`api/_shared.js` の `ALLOWED_ORIGINS`）。

### ローカルで動かす

```bash
npm install
GEMINI_API_KEY=... npx vercel dev
# → http://localhost:3000/job/
```

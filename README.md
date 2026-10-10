# squiddessert

## AI 職業診断

10 の質問に答えると、Claude（Haiku 4.5）があなたに向いている職業を診断します。
結果には、いちばん向いている職業（名刺風のカード）、仕事タイプ、傾向（創造力・協調性・分析力・行動力）、ほかに向いている職業 2 つ、強み、最初の一歩のアドバイスが表示されます。

- `job/index.html` … 診断ページ（静的 HTML）
- `api/diagnose.js` … Claude API を呼び出すサーバーレス関数（Vercel 形式）

### デプロイ（Vercel）

1. このリポジトリを Vercel にインポート
2. 環境変数 `ANTHROPIC_API_KEY` を設定
3. デプロイ後 `https://<your-app>.vercel.app/job/` を開く

API キーはサーバー側だけで使われ、ブラウザには公開されません。
GitHub Pages など静的ホスティングにページを置く場合は、`job/index.html` の `API_URL` を Vercel 側の URL に変更してください（その場合は CORS の設定が必要です）。

### ローカルで動かす

```bash
npm install
ANTHROPIC_API_KEY=sk-ant-... npx vercel dev
# → http://localhost:3000/job/
```

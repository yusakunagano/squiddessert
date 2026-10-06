# squiddessert

## 令和診断（AI 診断）

8 つの質問に答えると、Claude があなたの「令和度」を診断します。

- `reiwa/index.html` … 診断ページ（静的 HTML）
- `api/diagnose.js` … Claude API を呼び出すサーバーレス関数（Vercel 形式）

### デプロイ（Vercel）

1. このリポジトリを Vercel にインポート
2. 環境変数 `ANTHROPIC_API_KEY` を設定
3. デプロイ後 `https://<your-app>.vercel.app/reiwa/` を開く

API キーはサーバー側だけで使われ、ブラウザには公開されません。
GitHub Pages など静的ホスティングにページを置く場合は、`reiwa/index.html` の `API_URL` を Vercel 側の URL に変更してください（その場合は CORS の設定が必要です）。

### ローカルで動かす

```bash
npm install
ANTHROPIC_API_KEY=sk-ant-... npx vercel dev
# → http://localhost:3000/reiwa/
```

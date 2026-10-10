# マップコメント

Google マップ上にコメントを残せるサービスです。Firebase の無料プラン (Spark) だけで動きます。

- 地図をクリックすると、その場所にコメントを置けます（140文字まで）。
- 地図は約30m四方のマスに区切られていて、**同じマスに10個重なると、まとめて消えます**（10個目は残りません）。
  クリックするとマスが青く表示され、「あと何個で消えるか」がわかります。
- **自分のコメントは消せます**（吹き出しの「消す」ボタン）。他の人のコメントは消せません。
- 他の人の投稿や、まとめて消えた結果はリアルタイムに反映されます。
- 画面の右側（スマホでは「コメント一覧」ボタン）に、全員のコメントが新しい順に並びます。押すとその場所へ移動します。
- 地図を引いて見ると、画面を区切ったエリアごとに**最新のコメント1つ**だけを表示し、ほかの件数を「+3」のように添えます。押すと拡大します。
  一覧と引いた地図に使うのは新しい順に300件までです（`public/app.js` の `LATEST_MAX`）。

ログイン画面はありません。Firebase の匿名ログインでブラウザごとにアカウントを作り、それで「自分のコメント」を見分けます。
ブラウザのデータを消したり別の端末から開いたりすると、それまでのコメントは消せなくなります。

## 仕組み

サーバーのプログラムはありません。ブラウザが Firestore に直接書き込み、
不正な書き込みは `firestore.rules`（セキュリティルール）で防ぎます。

| 場所 | 内容 |
| --- | --- |
| `comments/{id}` | コメント本体 `{ uid, text, lat, lng, cell, createdAt }` |
| `cells/{cell}` | マスごとのコメント数 `{ count, last, vanished }` |

- 置くとき: コメントを作り、同時にマスの `count` を1増やす。ルールは「位置とマスが合っているか」「数が正しく1増えているか」「10個目ではないか」を確認します。
- 10個目を置くとき: マスのコメントを全部消して `count` を0に戻す。他人のコメントを消せるのは、このときだけです。
- 自分のを消すとき: コメントを消し、マスの `count` を1減らす。

## 公開するまで

1. [Firebase コンソール](https://console.firebase.google.com/) でプロジェクトを作る（プランは Spark のままで OK）。
2. **Authentication** → ログイン方法 → **匿名** を有効にする。
3. **Firestore Database** を作成する（本番モード、ロケーションは `asia-northeast1` など）。
4. プロジェクトの設定 → マイアプリ → ウェブアプリを追加し、表示された `firebaseConfig` を `public/config.js` に貼る。
5. [Google Cloud Console](https://console.cloud.google.com/) で **Firebase とは別のプロジェクト**を作り、そこで **Maps JavaScript API** を有効にして API キーを作り、`public/config.js` の `googleMapsApiKey` に入れる。
   Google Maps には課金アカウントの登録が必要です（毎月の無料枠あり）。Firebase のプロジェクトに課金アカウントをつなぐと
   Firebase が自動で Blaze プランになるので、Maps 用は別プロジェクトにしてください。
   キーは「HTTP リファラー」で公開先（`https://<プロジェクトID>.web.app/*` と `https://<プロジェクトID>.firebaseapp.com/*`）に、
   「API の制限」で Maps JavaScript API だけに制限してください。
6. デプロイ:

   ```sh
   cd map-comments
   npm install
   npx firebase login
   npx firebase use --add      # 作ったプロジェクトを選ぶ
   npm run deploy              # Hosting と Firestore ルールを公開
   ```

   `https://<プロジェクトID>.web.app` で公開されます。

## 手元で動かす

Firebase エミュレータを使います（Java が必要）。`localhost` で開くと自動的にエミュレータにつながるので、本物のデータには触りません。
地図の表示には `public/config.js` に Google Maps の API キーが必要です。

```sh
npm install
npm run dev        # → http://localhost:5000
```

## テスト

エミュレータ上で、投稿・削除・10個で消える・不正な書き込みが拒否されることを確認します。

```sh
npm test
```

## 調整

マスの大きさ (`CELL_DEG`) と消える個数 (`VANISH_LIMIT`) は `public/lib/grid.js` にあります。
`firestore.rules` にも同じ値が書いてあるので、変えるときは両方を変えてください。

# マップコメント

Google マップ上にコメントを残せるサービスです。Firebase の無料プラン (Spark) だけで動きます。

- 地図をクリックすると、その場所にコメントを置けます（140文字まで）。
- 地図は約30m四方のマスに区切られていて、**同じマスに10個重なると、まとめて消えます**（10個目は残りません）。
  クリックするとマスが青く表示され、「あと何個で消えるか」がわかります。
- **自分のコメントは消せます**（吹き出しの「消す」ボタン）。他の人のコメントは消せません。
- 他の人の投稿や、まとめて消えた結果はリアルタイムに反映されます。

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
5. [Google Cloud Console](https://console.cloud.google.com/) で同じプロジェクトの **Maps JavaScript API** を有効にし、API キーを作って `public/config.js` の `googleMapsApiKey` に入れる。
   キーは「HTTP リファラー」で公開先（`https://<プロジェクトID>.web.app/*` など）に制限してください。
   Google Maps は Firebase とは別に Google Maps Platform の課金設定が必要ですが、毎月の無料枠があります。
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

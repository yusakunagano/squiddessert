# マップコメント

Google マップ上にコメントを残せるサービスです。

- 地図をクリックすると、その場所にコメントを置けます（140文字まで）。
- 同じ場所（半径 30m 以内）にコメントが **10個重なると、まとめて消えます**。
- **自分のコメントは消せます**（吹き出しの「消す」ボタン）。他の人のコメントは消せません。

ログインはありません。最初に開いたときにブラウザごとの合言葉（ランダムな ID）を作って保存し、
それで「自分のコメント」を見分けます。サーバーには合言葉のハッシュだけを保存します。
ブラウザのデータを消すと、それまでのコメントは消せなくなります。

## 動かし方

Node.js 20 以上が必要です。追加のパッケージはありません。

```sh
cd map-comments
GOOGLE_MAPS_API_KEY=あなたのキー npm start
# → http://localhost:3000
```

API キーは Google Cloud Console で「Maps JavaScript API」を有効にして発行してください。

### 設定（環境変数）

| 変数 | 既定値 | 説明 |
| --- | --- | --- |
| `GOOGLE_MAPS_API_KEY` | なし | Google Maps の API キー（必須） |
| `GOOGLE_MAPS_MAP_ID` | `DEMO_MAP_ID` | マップ ID（吹き出しマーカーに必要。本番では自分で作成したものを推奨） |
| `OVERLAP_RADIUS_M` | `30` | この距離 (m) 以内を「重なっている」とみなす |
| `OVERLAP_LIMIT` | `10` | 重なりがこの数に達したら消える |
| `PORT` | `3000` | ポート番号 |
| `DATA_FILE` | `data/comments.json` | 保存先ファイル |

## テスト

```sh
npm test
```

## API

| メソッド | パス | 説明 |
| --- | --- | --- |
| GET | `/api/comments?south=&west=&north=&east=` | 範囲内のコメント一覧 |
| POST | `/api/comments` | `{ lat, lng, text }` を投稿。`{ comment, removed }` を返す（`removed` は重なりで消えたコメントの ID） |
| DELETE | `/api/comments/:id` | 自分のコメントを削除 |

リクエストには `X-Owner-Token` ヘッダーでブラウザの合言葉を付けます。

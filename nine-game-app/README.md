# ナインゲーム Android アプリ

`../nine-game/index.html`（Web版のゲーム）を Capacitor で Android アプリにしたプロジェクトです。

| フォルダ / ファイル | 中身 |
|---|---|
| `android/` | Android Studio で開くプロジェクト（アイコン・起動画面・縦画面固定は設定済み） |
| `assets/` | アイコンと起動画面の元画像 |
| `store/` | Google Play に載せる画像（アイコン512、フィーチャー画像、スクリーンショット） |
| `store/listing.md` | ストアに載せる説明文の下書き |
| `capacitor.config.json` | アプリ名・パッケージ名 |

---

## 1. パソコンの準備（最初の1回だけ）

1. **Node.js**（LTS版）をインストール: https://nodejs.org/
2. **Android Studio** をインストール: https://developer.android.com/studio
   最初の起動時のセットアップウィザードで、Android SDK も一緒に入れてください。
3. このリポジトリを取得:
   ```sh
   git clone https://github.com/yusakunagano/squiddessert.git
   cd squiddessert
   git checkout ccr-eb72127c-96pz3v   # main にマージ済みなら不要
   cd nine-game-app
   npm install
   ```

## 2. スマホで動かしてみる

```sh
npm run sync   # ゲームをアプリにコピー
npm run open   # Android Studio が開く
```

Android Studio が開いたら、Gradle の同期が終わるまで待ちます（初回は数分かかります）。

- **エミュレータで試す:** 上部の ▶（Run）を押します。
- **自分のスマホで試す:**
  1. スマホの「設定 → デバイス情報 → ビルド番号」を7回タップして、開発者向けオプションを出します。
  2. 開発者向けオプションで「USB デバッグ」をオンにします。
  3. USB でパソコンにつなぎ、▶ を押します。

## 3. ゲームを直したとき

`../nine-game/index.html` を編集してから、もう一度 `npm run sync` を実行します。

> フォントは、ゲームで使っている文字だけに絞ってファイルを小さくしています。新しい漢字などを画面に足して文字が別のフォントで表示されたら、Claude に「フォントを作り直して」と頼んでください。

## 4. リリース用のファイル（.aab）を作る

1. Android Studio のメニューで **Build → Generate Signed App Bundle or APK** を選びます。
2. **Android App Bundle** を選んで Next を押します。
3. Key store path の **Create new...** で署名用の鍵（キーストア）を作ります。
   - 保存場所は、**このリポジトリの外**（例: `書類/keys/ninegame.jks`）にしてください。
   - パスワードと鍵の別名（alias）をメモしておいてください。
   - ⚠️ **キーストアとパスワードは絶対になくさないでください。** なくすとアップデートが出せなくなります。USBメモリやクラウドにもバックアップしてください。
   - `.jks` / `.keystore` ファイルは Git に入らない設定にしてあります（公開リポジトリなので）。
4. **release** を選んで Create を押すと、`android/app/release/app-release.aab` ができます。

**アップデートを出すとき**は、`android/app/build.gradle` の `versionCode` を1増やし（1 → 2 → 3…）、`versionName` も変えてから（"1.0" → "1.1"）同じ手順で作ります。

## 5. Google Play に出す

1. **開発者登録:** https://play.google.com/console で登録します（登録料25ドル、1回だけ）。本人確認に数日かかることがあります。
2. **アプリを作成:** アプリ名「ナインゲーム」、言語は日本語、種類は「ゲーム」、無料を選びます。
3. **ストアの掲載情報:** `store/` の画像と `store/listing.md` の文章を使います。

   | 項目 | ファイル |
   |---|---|
   | アプリのアイコン | `store/icon-512.png` |
   | フィーチャーグラフィック | `store/feature-graphic-1024x500.png` |
   | スマートフォンのスクリーンショット | `store/screenshot-*.png` |

4. **アプリのコンテンツ**（Play Console の「ポリシー」欄にある質問票）:
   - **プライバシーポリシー:** GitHub Pages で公開している `index.html` の URL を入れます。
   - **データセーフティ:** 今のアプリは個人データを集めず、送信もしません。ベストスコアは端末の中にだけ保存されます。なので「データを収集しない」と答えられます。広告（AdMob）を入れた場合は答えが変わります。
   - **広告:** 「広告なし」と答えます（AdMob を入れたら「あり」）。
   - **コンテンツのレーティング:** 質問票に答えます。パズルゲームなので「全年齢」になるはずです。
   - **ターゲット年齢:** 13歳未満を含めると審査の要件が増えます。迷ったら「13歳以上」がおすすめです。
5. **クローズドテスト:** 2023年11月以降に作った個人アカウントは、**12人以上のテスターに14日間続けて試してもらわないと**製品版として公開できません。
   - 「テスト → クローズドテスト」でトラックを作って `.aab` をアップします。
   - テスターの Gmail アドレスを登録して、届いたリンクからインストールしてもらいます。
6. 14日たったら「製品版へのアクセスを申請」し、審査に通れば公開されます。

> **パッケージ名 `com.squiddessert.ninegame` は、最初にアップした後は変えられません。** 変えたい場合は、最初のアップロードの前に Claude に頼んでください。

import { useEffect, useState } from "react";

// iPhone / iPad の Safari では、7日間ひらかれなかったサイトのデータが自動で消えることがある。
// ホーム画面に追加して使うとこの対象外になるので、iPhone の人にだけ上部で案内する。
// （iPhone では Web ページからホーム画面にアイコンを直接追加することはできないため、
//   タップすると追加の手順を表示する）

const DISMISS_KEY = "eitango-install-banner-dismissed";

const isIOS = () =>
  /iPhone|iPad|iPod/.test(navigator.userAgent) ||
  // iPadOS の Safari は Mac と同じ表記になる
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

const isStandalone = () =>
  window.matchMedia("(display-mode: standalone)").matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

export function InstallBanner() {
  const [show, setShow] = useState(false);
  const [guide, setGuide] = useState(false);

  useEffect(() => {
    // データをできるだけ消さないようブラウザにお願いする（対応ブラウザのみ）
    navigator.storage?.persist?.().catch(() => {});
    let dismissed = false;
    try {
      dismissed = Number(localStorage.getItem(DISMISS_KEY) ?? 0) > Date.now();
    } catch {
      /* 無視 */
    }
    setShow(isIOS() && !isStandalone() && !dismissed);
  }, []);

  if (!show) return null;

  const close = () => {
    try {
      // 閉じたら3日間は出さない
      localStorage.setItem(DISMISS_KEY, String(Date.now() + 3 * 24 * 60 * 60 * 1000));
    } catch {
      /* 無視 */
    }
    setShow(false);
  };

  return (
    <>
      <div className="install-banner">
        <button className="install-main" onClick={() => setGuide(true)}>
          <span className="install-icon">📲</span>
          <span>
            <b>ホーム画面に追加してください</b>
            <br />
            <span className="small">追加しないと学習データが消えることがあります（タップで手順）</span>
          </span>
        </button>
        <button className="install-close" onClick={close} aria-label="閉じる">
          ✕
        </button>
      </div>

      {guide && (
        <div className="modal-backdrop" onClick={() => setGuide(false)}>
          <div className="modal install-guide" onClick={(e) => e.stopPropagation()}>
            <h2>ホーム画面に追加する方法</h2>
            <p className="muted small">
              iPhoneでは、ボタン1つでアイコンを置くことができないため、次の3ステップで追加してください。
            </p>
            <ol>
              <li>
                画面の下（iPadは上）にある <span className="share-glyph">共有</span>
                ボタン（□に↑のマーク）をタップ
              </li>
              <li>
                メニューを下にスクロールして <b>「ホーム画面に追加」</b> をタップ
              </li>
              <li>
                右上の <b>「追加」</b> をタップ
              </li>
            </ol>
            <p className="small">
              ホーム画面に「えいたんご」のアイコンができます。次からはそのアイコンから開いてください。
            </p>
            <p className="muted small">
              ※ Safari以外（LINEやChromeなど）で開いている場合は、いったんSafariで開いてから追加してください。
            </p>
            <div className="row end">
              <button className="btn primary" onClick={() => setGuide(false)}>
                わかった
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

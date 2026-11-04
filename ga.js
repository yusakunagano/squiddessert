// 共通のGoogle Analytics(GA4)タグ。全アプリがこのファイルを読み込む。
// 測定IDを変えるときはここだけ直す。ページのURLで「どのアプリか」を見分けられる。
(function () {
  var GA_ID = 'G-RH8SN9RQ8M';
  var s = document.createElement('script');
  s.async = true;
  s.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(GA_ID);
  document.head.appendChild(s);
  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
  gtag('js', new Date());
  gtag('config', GA_ID, { allow_google_signals: false, allow_ad_personalization_signals: false });
})();

// Google Analytics (GA4). Turned on only when firebase-config.js has a measurementId.
// Counts page views plus two game events; no names or other personal details are sent.
import { firebaseConfig } from './firebase-config.js?v=20261017';

const id = firebaseConfig && firebaseConfig.measurementId;

if (id) {
  const s = document.createElement('script');
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
  document.head.appendChild(s);

  window.dataLayer = window.dataLayer || [];
  window.gtag = function () { window.dataLayer.push(arguments); };
  gtag('js', new Date());
  gtag('config', id, { allow_google_signals: false, allow_ad_personalization_signals: false });

  window.addEventListener('nine:start', () => gtag('event', 'game_start'));
  window.addEventListener('nine:gameover', e => {
    gtag('event', 'game_end', { score: e.detail.score, level: e.detail.level, nines: e.detail.nines });
  });
}

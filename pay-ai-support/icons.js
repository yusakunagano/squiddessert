// アイコン（平面）：色ベタ・線だけ。影・グラデーション・絵文字は使わない。
// 使い方：ic('bank')（文字列でSVGを返す）／ HTMLでは <span data-ic="bank"></span>
const IC_PATHS = {
  // AIの印：四角い枠（右上が開いている）に「AI」、右上にキラキラ
  ai: '<path d="M28 9H16a7 7 0 0 0-7 7v16a7 7 0 0 0 7 7h16a7 7 0 0 0 7-7v-3"/><path d="M14.5 32 21 16.5 27.5 32M16.8 26.5h8.4"/><path d="M32.5 16.5v15.5"/><g fill="currentColor" stroke="none"><path d="M34 3q0 6 6 6-6 0-6 6 0-6-6-6 6 0 6-6z"/><path d="M43 8q0 3 3 3-3 0-3 3 0-3-3-3 3 0 3-3z"/><path d="M41 19q0 3.4 3.4 3.4-3.4 0-3.4 3.4 0-3.4-3.4-3.4 3.4 0 3.4-3.4z"/></g>',
  bank: '<path d="M3 9.5 12 4l9 5.5"/><path d="M5 10v8M9.7 10v8M14.3 10v8M19 10v8M3 20.5h18"/>',
  gift: '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13M5 12v8.5h14V12"/><path d="M12 8C9.5 8 8 6.8 8 5.5S9.3 3.8 10.5 4.5 12 6.5 12 8c0-1.5.3-2.8 1.5-3.5S16 4.2 16 5.5 14.5 8 12 8z"/>',
  receipt: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>',
  send: '<path d="M21 3 10 14"/><path d="M21 3l-6.5 18-4-7.5L3 9.5z"/>',
  spark: '<path d="M12 3q0 9 9 9-9 0-9 9 0-9-9-9 9 0 9-9z"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  open: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  warn: '<path d="M12 3 2 20h20z"/><path d="M12 10v4.5M12 17.5v.5"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7"/>',
  checkc: '<circle cx="12" cy="12" r="9"/><path d="M8 12.5l3 3L16.5 9"/>',
  circle: '<circle cx="12" cy="12" r="9"/>',
  phone: '<rect x="7" y="2.5" width="10" height="19" rx="2"/><path d="M11 18h2"/>',
  card: '<rect x="2.5" y="5" width="19" height="14" rx="2"/><path d="M2.5 10h19M6 15h4"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13.5" r="3.5"/>',
  finger: '<path d="M12 10a2 2 0 0 0-2 2c0 1.02-.1 2.51-.26 4"/><path d="M14 13.12c0 2.38 0 6.38-1 8.88"/><path d="M17.29 21.02c.12-.6.43-2.3.5-3.02"/><path d="M2 12a10 10 0 0 1 18-6"/><path d="M21.8 16c.2-2 .131-5.354 0-6"/><path d="M5 19.5C5.5 18 6 15 6 12a6 6 0 0 1 .34-2"/><path d="M8.65 22c.21-.66.45-1.32.57-2"/><path d="M9 6.8a6 6 0 0 1 9 5.2v2"/>',
  face: '<circle cx="12" cy="12" r="9"/><path d="M8.5 14.5c1 1.5 2.3 2 3.5 2s2.5-.5 3.5-2M9 9.5v1M15 9.5v1"/>',
};
// 「ai」だけは、座標が 48 の大きさ。ほかは 24
function ic(name, cls = '') {
  const big = name === 'ai';
  return `<svg class="icon ${cls}" viewBox="0 0 ${big ? 48 : 24} ${big ? 48 : 24}" fill="none" stroke="currentColor" stroke-width="${big ? 3.6 : 2}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${IC_PATHS[name] || ''}</svg>`;
}
// HTMLの <span data-ic="名前"> に、アイコンを入れる
function fillIcons(root = document) { root.querySelectorAll('[data-ic]').forEach((el) => { if (!el.firstChild) el.innerHTML = ic(el.dataset.ic); }); }
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => fillIcons()); else fillIcons();

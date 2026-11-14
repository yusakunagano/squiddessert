// 見出しタイポグラフィ：1文字ずつに分けて登場させ、幅いっぱいにフィットさせ、
// マウスが近づいた文字だけ細くなる（可変フォントのウェイト軸を使う）。
(function () {
  var h = document.querySelector('.display');
  if (!h) return;
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  // 1. サンセリフ部分を1文字ずつ span に分ける
  var chars = [];
  h.querySelectorAll('.d-sans').forEach(function (el) {
    var text = el.textContent;
    el.textContent = '';
    for (var i = 0; i < text.length; i++) {
      var s = document.createElement('span');
      s.className = 'ch';
      s.textContent = text[i];
      s.style.setProperty('--i', chars.length);
      el.appendChild(s);
      chars.push(s);
    }
  });

  // 件数（一覧のカード数）を右肩に
  var count = h.querySelector('.count');
  if (count) {
    var n = document.querySelectorAll('.grid a.card:not(.c-dev)').length;
    if (n) count.textContent = '(' + (n < 10 ? '0' : '') + n + ')';
  }

  // 2. 親の幅ぴったりに文字サイズを合わせる
  var centers = [];
  function fit() {
    h.style.fontSize = '100px';
    var w = h.getBoundingClientRect().width;
    var avail = h.parentElement.clientWidth;
    if (w > 0) {
      var size = Math.min(240, avail / w * 100);
      h.style.fontSize = size + 'px';
      // 件数ラベルは最小サイズがあるので比例しない。もう一度測って微調整する
      var w2 = h.getBoundingClientRect().width;
      if (w2 > avail) h.style.fontSize = size * avail / w2 + 'px';
    }
    centers = chars.map(function (c) {
      var r = c.getBoundingClientRect();
      return [r.left + r.width / 2 + scrollX, r.top + r.height / 2 + scrollY];
    });
  }
  var queued = false;
  function refit() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(function () { queued = false; fit(); });
  }
  fit();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fit);
  addEventListener('resize', refit);

  // 3. マウスが近い文字ほど細く（800 → 240）
  if (reduce) return;
  var mx = -1e4, my = -1e4, ticking = false;
  function paint() {
    ticking = false;
    var R = h.getBoundingClientRect().height * 1.5;
    for (var i = 0; i < chars.length; i++) {
      var c = centers[i];
      if (!c) continue;
      var t = Math.max(0, 1 - Math.hypot(mx - c[0], my - c[1]) / R);
      chars[i].style.setProperty('--w', Math.round(800 - 560 * t * t));
    }
  }
  addEventListener('pointermove', function (e) {
    if (e.pointerType !== 'mouse') return;
    mx = e.clientX + scrollX;
    my = e.clientY + scrollY;
    if (!ticking) { ticking = true; requestAnimationFrame(paint); }
  });
  document.addEventListener('pointerleave', function () { mx = my = -1e4; paint(); });
})();

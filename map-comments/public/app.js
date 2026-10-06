const TOKEN_KEY = 'map-comments:owner-token';
const REFRESH_MS = 15000;

// 自分のコメントを見分けるための秘密の合言葉 (このブラウザに保存)
function ownerToken() {
  let token = null;
  try {
    token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      token = crypto.randomUUID();
      localStorage.setItem(TOKEN_KEY, token);
    }
  } catch {
    token ??= crypto.randomUUID();
  }
  return token;
}
const TOKEN = ownerToken();

async function api(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: { 'Content-Type': 'application/json', 'X-Owner-Token': TOKEN, ...options.headers },
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

let toastTimer;
function toast(message) {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 3500);
}

function loadGoogleMaps(apiKey) {
  return new Promise((resolve, reject) => {
    window.__onMapsLoaded = resolve;
    const s = document.createElement('script');
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}`
      + '&v=weekly&language=ja&region=JP&loading=async&callback=__onMapsLoaded';
    s.async = true;
    s.onerror = () => reject(new Error('Google Maps の読み込みに失敗しました'));
    document.head.appendChild(s);
  });
}

function showMapError(html) {
  document.getElementById('map').innerHTML = `<div class="map-error">${html}</div>`;
}

async function main() {
  const config = await api('/api/config');
  document.getElementById('rule').textContent =
    `${config.overlapRadius}m 以内に ${config.overlapLimit} 個重なると、まとめて消えます。`;

  if (!config.mapsApiKey) {
    showMapError('Google Maps の API キーが設定されていません。<br>'
      + '環境変数 <code>GOOGLE_MAPS_API_KEY</code> を設定してサーバーを起動してください。');
    return;
  }
  await loadGoogleMaps(config.mapsApiKey);

  const { Map, InfoWindow } = await google.maps.importLibrary('maps');
  const { AdvancedMarkerElement } = await google.maps.importLibrary('marker');

  const map = new Map(document.getElementById('map'), {
    center: { lat: 35.681236, lng: 139.767125 }, // 東京駅
    zoom: 16,
    mapId: config.mapId,
    clickableIcons: false,
    gestureHandling: 'greedy',
  });

  navigator.geolocation?.getCurrentPosition(
    (pos) => map.setCenter({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
    () => {},
    { timeout: 5000 },
  );

  /** id -> AdvancedMarkerElement */
  const markers = new globalThis.Map();

  function bubbleFor(comment) {
    const el = document.createElement('div');
    el.className = comment.mine ? 'bubble mine' : 'bubble';
    el.textContent = comment.text;
    if (comment.mine) {
      const del = document.createElement('button');
      del.className = 'del';
      del.type = 'button';
      del.textContent = '消す';
      del.title = '自分のコメントを消す';
      del.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!confirm('このコメントを消しますか？')) return;
        try {
          await api(`/api/comments/${comment.id}`, { method: 'DELETE' });
          removeMarker(comment.id);
        } catch (err) {
          toast(err.message);
        }
      });
      el.append(del);
    }
    return el;
  }

  function addMarker(comment) {
    if (markers.has(comment.id)) return;
    const marker = new AdvancedMarkerElement({
      map,
      position: { lat: comment.lat, lng: comment.lng },
      content: bubbleFor(comment),
      title: comment.text,
      zIndex: Date.parse(comment.createdAt) / 1000,
    });
    markers.set(comment.id, marker);
  }

  function removeMarker(id, { animate = false } = {}) {
    const marker = markers.get(id);
    if (!marker) return;
    markers.delete(id);
    if (animate) {
      marker.content.classList.add('vanish');
      setTimeout(() => { marker.map = null; }, 600);
    } else {
      marker.map = null;
    }
  }

  async function refresh() {
    const b = map.getBounds();
    if (!b) return;
    const ne = b.getNorthEast();
    const sw = b.getSouthWest();
    const q = new URLSearchParams({
      south: sw.lat(), west: sw.lng(), north: ne.lat(), east: ne.lng(),
    });
    try {
      const { comments } = await api(`/api/comments?${q}`);
      const ids = new Set(comments.map((c) => c.id));
      // 他の人の投稿で消えたもの / 範囲外に出たものを外す
      for (const id of [...markers.keys()]) if (!ids.has(id)) removeMarker(id);
      comments.forEach(addMarker);
    } catch (err) {
      toast(`読み込みに失敗しました: ${err.message}`);
    }
  }

  map.addListener('idle', refresh);
  setInterval(refresh, REFRESH_MS);

  // 地図クリックで投稿フォーム
  const infoWindow = new InfoWindow();
  map.addListener('click', (e) => {
    const position = e.latLng;
    const form = document.createElement('form');
    form.className = 'post-form';
    form.innerHTML = `
      <textarea name="text" maxlength="${config.maxTextLength}" placeholder="ここにコメント" required></textarea>
      <div class="row"><span class="count">0 / ${config.maxTextLength}</span><button type="submit">置く</button></div>`;
    const textarea = form.elements.text;
    const count = form.querySelector('.count');
    textarea.addEventListener('input', () => {
      count.textContent = `${[...textarea.value].length} / ${config.maxTextLength}`;
    });
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const button = form.querySelector('button');
      button.disabled = true;
      try {
        const { comment, removed } = await api('/api/comments', {
          method: 'POST',
          body: JSON.stringify({ lat: position.lat(), lng: position.lng(), text: textarea.value }),
        });
        infoWindow.close();
        if (removed.length > 0) {
          removed.forEach((id) => removeMarker(id, { animate: true }));
          toast(`${removed.length} 個重なったので、まとめて消えました！`);
        } else {
          addMarker(comment);
        }
      } catch (err) {
        toast(err.message);
        button.disabled = false;
      }
    });
    infoWindow.setContent(form);
    infoWindow.setPosition(position);
    infoWindow.open(map);
    setTimeout(() => textarea.focus(), 0);
  });
}

main().catch((err) => {
  console.error(err);
  showMapError(`エラー: ${err.message}`);
});

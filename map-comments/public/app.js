import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, onAuthStateChanged, signInAnonymously } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';
import { firebaseConfig, googleMapsApiKey, googleMapsMapId } from './config.js';
import { MAX_TEXT_LENGTH, VANISH_LIMIT, cellBounds, cellOf } from './lib/grid.js';
import { deleteComment, getCell, postComment, watchComments, watchLatest } from './lib/comments.js';

// これより引いた地図では、1つずつではなくエリアごとの最新コメントだけを表示する
const MIN_ZOOM = 14;
// 引いた地図でまとめるエリアの大きさ (画面上のピクセル)
const CLUSTER_PX = 90;
// 一覧と引いた地図に使う、新しいコメントの件数
const LATEST_MAX = 300;

// localhost で開いたときは Firebase エミュレータにつなぐ (npm run dev)
const USE_EMULATOR = ['localhost', '127.0.0.1'].includes(location.hostname);

let toastTimer;
function toast(message) {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 3500);
}

function showMapError(html) {
  document.getElementById('map').innerHTML = `<div class="map-error">${html}</div>`;
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

function initFirebase() {
  const app = initializeApp(USE_EMULATOR ? { ...firebaseConfig, apiKey: 'emulator', projectId: 'demo-map-comments' } : firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);
  if (USE_EMULATOR) {
    connectAuthEmulator(auth, `http://${location.hostname}:9099`, { disableWarnings: true });
    connectFirestoreEmulator(db, location.hostname, 8080);
  }
  // ログイン画面は出さず、ブラウザごとの匿名アカウントで「自分のコメント」を見分ける
  const uid = new Promise((resolve, reject) => {
    const stop = onAuthStateChanged(auth, (user) => {
      if (user) {
        stop();
        resolve(user.uid);
      } else {
        signInAnonymously(auth).catch(reject);
      }
    });
  });
  return { db, uid };
}

// 場所を検索して地図を移動する (Google の Places API (New) を使う)
async function setupSearch(map) {
  const box = document.getElementById('search');
  try {
    const { PlaceAutocompleteElement } = await google.maps.importLibrary('places');
    const input = new PlaceAutocompleteElement({});
    input.placeholder = '場所を検索';
    input.setAttribute('aria-label', '場所を検索');
    input.addEventListener('gmp-select', async (e) => {
      try {
        const place = e.placePrediction ? e.placePrediction.toPlace() : e.place;
        await place.fetchFields({ fields: ['displayName', 'location', 'viewport'] });
        if (place.viewport) {
          map.fitBounds(place.viewport);
        } else if (place.location) {
          map.setCenter(place.location);
          map.setZoom(17);
        }
      } catch (err) {
        console.error(err);
        toast('その場所に移動できませんでした');
      }
    });
    box.append(input);
    box.hidden = false;
  } catch (err) {
    // Places API が使えないときは検索欄を出さない
    console.error('場所の検索が使えません', err);
  }
}

async function main() {
  document.getElementById('rule').textContent =
    `同じマス (約30m四方) に ${VANISH_LIMIT} 個重なると、まとめて消えます。`;

  if (!USE_EMULATOR && !firebaseConfig.projectId) {
    showMapError('Firebase の設定がありません。<code>public/config.js</code> を書き換えてください。');
    return;
  }
  if (!googleMapsApiKey) {
    showMapError('Google Maps の API キーがありません。<code>public/config.js</code> を書き換えてください。');
    return;
  }

  const { db, uid: uidPromise } = initFirebase();
  const [uid] = await Promise.all([uidPromise, loadGoogleMaps(googleMapsApiKey)]);

  const { Map, InfoWindow, Rectangle } = await google.maps.importLibrary('maps');
  const { AdvancedMarkerElement } = await google.maps.importLibrary('marker');

  const map = new Map(document.getElementById('map'), {
    center: { lat: 35.681236, lng: 139.767125 }, // 東京駅
    zoom: 17,
    mapId: googleMapsMapId,
    clickableIcons: false,
    gestureHandling: 'greedy',
  });

  navigator.geolocation?.getCurrentPosition(
    (pos) => map.setCenter({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
    () => {},
    { timeout: 5000 },
  );

  setupSearch(map);

  /** id -> AdvancedMarkerElement */
  const markers = new globalThis.Map();

  function bubbleFor(comment) {
    const mine = comment.uid === uid;
    const el = document.createElement('div');
    el.className = mine ? 'bubble mine' : 'bubble';
    el.textContent = comment.text;
    if (mine) {
      const del = document.createElement('button');
      del.className = 'del';
      del.type = 'button';
      del.textContent = '消す';
      del.title = '自分のコメントを消す';
      del.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!confirm('このコメントを消しますか？')) return;
        try {
          await deleteComment(db, comment.id);
        } catch (err) {
          console.error(err);
          toast('消せませんでした');
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
      zIndex: Math.floor((comment.createdAt?.toMillis() ?? Date.now()) / 1000),
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

  // ---- 寄った地図: 表示範囲のコメントを1つずつ、リアルタイムで ----
  let unsubscribe = null;
  let firstSnapshot = true;
  function watchDetail() {
    const b = map.getBounds();
    const ne = b.getNorthEast();
    const sw = b.getSouthWest();
    firstSnapshot = true;
    unsubscribe = watchComments(
      db,
      { south: sw.lat(), west: sw.lng(), north: ne.lat(), east: ne.lng() },
      (comments) => {
        const ids = new Set(comments.map((c) => c.id));
        // 消された・まとめて消えたコメント (範囲を移動した直後は単に外す)
        for (const id of [...markers.keys()]) {
          if (!ids.has(id)) removeMarker(id, { animate: !firstSnapshot });
        }
        comments.forEach(addMarker);
        firstSnapshot = false;
      },
      (err) => {
        console.error(err);
        toast('コメントを読み込めませんでした');
      },
    );
  }

  // ---- 引いた地図: 画面をエリアに区切り、各エリアの最新コメントだけを出す ----
  let latest = [];
  let clusterMarkers = [];
  const zoomedOut = () => map.getZoom() < MIN_ZOOM;

  function clearClusters() {
    clusterMarkers.forEach((m) => { m.map = null; });
    clusterMarkers = [];
  }

  function renderClusters() {
    clearClusters();
    if (!zoomedOut()) return;
    const bounds = map.getBounds();
    if (!bounds) return;
    const size = (CLUSTER_PX * 360) / (256 * 2 ** map.getZoom()); // CLUSTER_PX 分の経度
    const groups = new globalThis.Map();
    // latest は新しい順なので、各エリアで最初に出てきたものが最新
    for (const c of latest) {
      if (!bounds.contains({ lat: c.lat, lng: c.lng })) continue;
      const key = `${Math.floor(c.lat / size)}_${Math.floor(c.lng / size)}`;
      const g = groups.get(key);
      if (g) g.count++;
      else groups.set(key, { comment: c, count: 1 });
    }
    for (const { comment, count } of groups.values()) {
      const el = document.createElement('div');
      el.className = comment.uid === uid ? 'bubble mine cluster' : 'bubble cluster';
      el.textContent = comment.text.length > 30 ? `${comment.text.slice(0, 30)}…` : comment.text;
      el.title = count > 1 ? `このあたりに ${count} 件。クリックで拡大` : 'クリックで拡大';
      if (count > 1) {
        const more = document.createElement('span');
        more.className = 'more';
        more.textContent = `+${count - 1}`;
        el.append(more);
      }
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        map.setCenter({ lat: comment.lat, lng: comment.lng });
        map.setZoom(count > 1 ? Math.min(map.getZoom() + 3, MIN_ZOOM) : 17);
      });
      clusterMarkers.push(new AdvancedMarkerElement({
        map,
        position: { lat: comment.lat, lng: comment.lng },
        content: el,
        zIndex: Math.floor(comment.createdAt.toMillis() / 1000),
      }));
    }
  }

  map.addListener('idle', () => {
    unsubscribe?.();
    unsubscribe = null;
    document.getElementById('notice').hidden = !zoomedOut();
    if (zoomedOut()) {
      for (const id of [...markers.keys()]) removeMarker(id);
      renderClusters();
    } else {
      clearClusters();
      watchDetail();
    }
  });

  // ---- コメント一覧 (新しい順) ----
  const tlList = document.getElementById('tlList');
  const timeline = document.getElementById('timeline');
  const seen = new Set();
  let firstLatest = true;

  function timeAgo(date) {
    const sec = Math.max(0, (Date.now() - date.getTime()) / 1000);
    if (sec < 60) return 'たった今';
    if (sec < 3600) return `${Math.floor(sec / 60)}分前`;
    if (sec < 86400) return `${Math.floor(sec / 3600)}時間前`;
    if (sec < 86400 * 7) return `${Math.floor(sec / 86400)}日前`;
    return date.toLocaleDateString('ja-JP');
  }

  function renderTimeline() {
    tlList.replaceChildren(...latest.map((c) => {
      const li = document.createElement('li');
      if (!firstLatest && !seen.has(c.id)) li.className = 'tl-new';
      const btn = document.createElement('button');
      btn.type = 'button';
      const text = document.createElement('div');
      text.className = 'tl-text';
      text.textContent = c.text;
      const meta = document.createElement('div');
      meta.className = 'tl-meta';
      const date = c.createdAt.toDate();
      meta.textContent = timeAgo(date);
      meta.title = date.toLocaleString('ja-JP');
      if (c.uid === uid) {
        const mine = document.createElement('span');
        mine.className = 'tl-mine';
        mine.textContent = '自分';
        meta.append(mine);
      }
      btn.append(text, meta);
      btn.addEventListener('click', () => {
        map.setCenter({ lat: c.lat, lng: c.lng });
        map.setZoom(Math.max(map.getZoom(), 17));
        timeline.classList.remove('open');
      });
      li.append(btn);
      return li;
    }));
    latest.forEach((c) => seen.add(c.id));
    firstLatest = false;
    document.getElementById('tlEmpty').hidden = latest.length > 0;
  }

  watchLatest(
    db,
    (comments) => {
      latest = comments;
      renderTimeline();
      renderClusters();
    },
    (err) => {
      console.error(err);
      toast('コメント一覧を読み込めませんでした');
    },
    LATEST_MAX,
  );
  // 「◯分前」を更新する
  setInterval(() => { if (latest.length) renderTimeline(); }, 60000);

  // スマホでは一覧を下から引き出す
  document.getElementById('tlOpen').addEventListener('click', () => timeline.classList.add('open'));
  document.getElementById('tlClose').addEventListener('click', () => timeline.classList.remove('open'));

  // 地図クリックで投稿フォーム
  const infoWindow = new InfoWindow();
  const cellRect = new Rectangle({
    strokeColor: '#1a73e8',
    strokeWeight: 1,
    fillColor: '#1a73e8',
    fillOpacity: 0.08,
    clickable: false,
  });
  infoWindow.addListener('close', () => cellRect.setMap(null));

  map.addListener('click', (e) => {
    const lat = e.latLng.lat();
    const lng = e.latLng.lng();
    const cell = cellOf(lat, lng);

    cellRect.setBounds(cellBounds(cell));
    cellRect.setMap(map);

    const form = document.createElement('form');
    form.className = 'post-form';
    form.innerHTML = `
      <textarea name="text" maxlength="${MAX_TEXT_LENGTH}" placeholder="ここにコメント" required></textarea>
      <p class="remain">&nbsp;</p>
      <div class="row"><span class="count">0 / ${MAX_TEXT_LENGTH}</span><button type="submit">置く</button></div>`;
    const textarea = form.elements.text;
    const count = form.querySelector('.count');
    const remain = form.querySelector('.remain');
    textarea.addEventListener('input', () => {
      count.textContent = `${textarea.value.length} / ${MAX_TEXT_LENGTH}`;
    });

    getCell(db, cell).then((c) => {
      const left = VANISH_LIMIT - c.count;
      remain.textContent = left <= 1
        ? `このマスには ${c.count} 個。置くとまとめて消えます！`
        : `このマスには ${c.count} 個。あと ${left} 個で消えます`;
      remain.classList.toggle('danger', left <= 1);
    }).catch(() => {});

    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const button = form.querySelector('button');
      button.disabled = true;
      try {
        const result = await postComment(db, uid, { lat, lng, text: textarea.value });
        infoWindow.close();
        if (result.vanished) {
          toast(`${VANISH_LIMIT} 個重なったので、まとめて消えました！`);
        }
      } catch (err) {
        console.error(err);
        toast(err.code ? '置けませんでした' : err.message);
        button.disabled = false;
      }
    });

    infoWindow.setContent(form);
    infoWindow.setPosition(e.latLng);
    infoWindow.open(map);
    setTimeout(() => textarea.focus(), 0);
  });
}

main().catch((err) => {
  console.error(err);
  showMapError(`エラー: ${err.message}`);
});

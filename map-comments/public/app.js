import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, onAuthStateChanged, signInAnonymously } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';
import { firebaseConfig, googleMapsApiKey, googleMapsMapId } from './config.js';
import { MAX_TEXT_LENGTH, VANISH_LIMIT, cellBounds, cellOf } from './lib/grid.js';
import { deleteComment, getCell, postComment, watchComments } from './lib/comments.js';

// これより引いた地図ではコメントを読み込まない (読み込み量を抑えるため)
const MIN_ZOOM = 14;

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

  // 表示範囲のコメントをリアルタイムで受け取る
  let unsubscribe = null;
  let firstSnapshot = true;
  map.addListener('idle', () => {
    unsubscribe?.();
    unsubscribe = null;
    const tooFar = map.getZoom() < MIN_ZOOM;
    document.getElementById('notice').hidden = !tooFar;
    if (tooFar) {
      for (const id of [...markers.keys()]) removeMarker(id);
      return;
    }
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
  });

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

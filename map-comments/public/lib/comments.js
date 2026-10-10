import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  where,
} from 'firebase/firestore';
import { MAX_TEXT_LENGTH, VANISH_LIMIT, cellOf } from './grid.js';

const MAX_RETRIES = 3;

/**
 * Firestore のデータ構造
 *   comments/{id}  { uid, text, lat, lng, cell, createdAt }
 *   cells/{cell}   { count, last, vanished }
 *     count    … そのマスに今あるコメントの数
 *     last     … 直前に追加・削除したコメントの ID (ルールでの検証用)
 *     vanished … そのマスで消えた回数
 */

/** マスの状態 (まだ誰も置いていなければ count 0) */
export async function getCell(db, cell) {
  const snap = await getDoc(doc(db, 'cells', cell));
  return snap.exists() ? snap.data() : { count: 0, last: '', vanished: 0 };
}

/**
 * コメントを置く。
 * そのマスで VANISH_LIMIT 個目になる場合は、マスのコメントをまとめて消す (置いたコメントも残らない)。
 * @returns {Promise<{ id: string } | { vanished: string[] }>}
 */
export async function postComment(db, uid, { lat, lng, text }) {
  text = String(text ?? '').trim();
  if (!text) throw new Error('コメントを入力してください');
  if (text.length > MAX_TEXT_LENGTH) throw new Error(`${MAX_TEXT_LENGTH}文字までです`);

  const cell = cellOf(lat, lng);
  const cellRef = doc(db, 'cells', cell);

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    // トランザクション内ではクエリが使えないので、消す候補を先に集めておく
    const existing = await getDocs(query(collection(db, 'comments'), where('cell', '==', cell)));

    const result = await runTransaction(db, async (tx) => {
      const cellSnap = await tx.get(cellRef);
      const count = cellSnap.exists() ? cellSnap.data().count : 0;
      const vanished = cellSnap.exists() ? (cellSnap.data().vanished ?? 0) : 0;

      if (count + 1 >= VANISH_LIMIT) {
        const live = (await Promise.all(existing.docs.map((d) => tx.get(d.ref)))).filter((d) => d.exists());
        if (live.length < count) return null; // 集めた後に誰かが置いた。やり直し
        live.forEach((d) => tx.delete(d.ref));
        tx.set(cellRef, { count: 0, last: '', vanished: vanished + 1 });
        return { vanished: live.map((d) => d.id) };
      }

      const ref = doc(collection(db, 'comments'));
      tx.set(ref, { uid, text, lat, lng, cell, createdAt: serverTimestamp() });
      tx.set(cellRef, { count: count + 1, last: ref.id, vanished });
      return { id: ref.id };
    });
    if (result) return result;
  }
  throw new Error('混み合っています。もう一度お試しください');
}

/** 自分のコメントを消す */
export async function deleteComment(db, id) {
  const ref = doc(db, 'comments', id);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) return;
    const cellRef = doc(db, 'cells', snap.data().cell);
    const cellSnap = await tx.get(cellRef);
    tx.delete(ref);
    tx.update(cellRef, { count: Math.max(0, (cellSnap.data()?.count ?? 1) - 1), last: id });
  });
}

/**
 * 範囲内のコメントをリアルタイムで受け取る。
 * @returns {() => void} 購読をやめる関数
 */
export function watchComments(db, { south, west, north, east }, onChange, onError, max = 500) {
  const q = query(
    collection(db, 'comments'),
    where('lat', '>=', south),
    where('lat', '<=', north),
    limit(max),
  );
  return onSnapshot(
    q,
    (snap) => {
      const comments = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((c) => (west <= east ? c.lng >= west && c.lng <= east : c.lng >= west || c.lng <= east));
      onChange(comments);
    },
    onError,
  );
}

/**
 * 新しい順に max 件のコメントをリアルタイムで受け取る (一覧表示と、引いた地図用)。
 * 送信直後でサーバー時刻が未確定のものは、手元の推定時刻を入れる。
 * @returns {() => void} 購読をやめる関数
 */
export function watchLatest(db, onChange, onError, max = 300) {
  const q = query(collection(db, 'comments'), orderBy('createdAt', 'desc'), limit(max));
  return onSnapshot(
    q,
    (snap) => onChange(snap.docs.map((d) => ({ id: d.id, ...d.data({ serverTimestamps: 'estimate' }) }))),
    onError,
  );
}

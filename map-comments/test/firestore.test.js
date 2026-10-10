// Firestore / Auth エミュレータ上で動かす (npm test)
import { test, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { deleteApp, initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, signInAnonymously } from 'firebase/auth';
import {
  collection,
  connectFirestoreEmulator,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  initializeFirestore,
  serverTimestamp,
  setDoc,
  terminate,
  writeBatch,
} from 'firebase/firestore';
import { cellOf, cellBounds } from '../public/lib/grid.js';
import { deleteComment, getCell, postComment, watchComments, watchLatest } from '../public/lib/comments.js';

const PROJECT = 'demo-map-comments';
const apps = [];

async function user(name) {
  const app = initializeApp({ projectId: PROJECT, apiKey: 'fake-key' }, `${name}-${Math.random()}`);
  const auth = getAuth(app);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  const db = initializeFirestore(app, {});
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  const { user: u } = await signInAnonymously(auth);
  apps.push({ app, db });
  return { db, uid: u.uid };
}

beforeEach(async () => {
  await fetch(`http://127.0.0.1:8080/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, {
    method: 'DELETE',
  });
});

after(async () => {
  for (const { app, db } of apps) {
    await terminate(db);
    await deleteApp(app);
  }
});

const LAT = 35.681236;
const LNG = 139.767125;
const CELL = cellOf(LAT, LNG);
const live = async (db) => (await getDocs(collection(db, 'comments'))).docs.map((d) => d.data());

test('マスの計算', () => {
  const b = cellBounds(CELL);
  assert.ok(b.south <= LAT && LAT < b.north);
  assert.ok(b.west <= LNG && LNG < b.east);
  assert.equal(cellOf(-0.0001, -0.0001), '-1_-1');
});

test('置いたコメントが見え、マスの数が増える', async () => {
  const alice = await user('alice');
  const res = await postComment(alice.db, alice.uid, { lat: LAT, lng: LNG, text: 'やあ' });
  assert.ok(res.id);
  const comments = await live(alice.db);
  assert.equal(comments.length, 1);
  assert.equal(comments[0].text, 'やあ');
  assert.equal(comments[0].uid, alice.uid);
  assert.equal((await getCell(alice.db, CELL)).count, 1);
});

test('自分のコメントは消せるが、他人のコメントは消せない', async () => {
  const alice = await user('alice');
  const bob = await user('bob');
  const { id } = await postComment(alice.db, alice.uid, { lat: LAT, lng: LNG, text: 'alice' });

  await assert.rejects(deleteComment(bob.db, id), /permission/i);
  await assert.rejects(deleteDoc(doc(bob.db, 'comments', id)), /permission/i);
  // 自分のでも、マスの数を減らさずに消すのはダメ
  await assert.rejects(deleteDoc(doc(alice.db, 'comments', id)), /permission/i);

  await deleteComment(alice.db, id);
  assert.equal((await live(alice.db)).length, 0);
  assert.equal((await getCell(alice.db, CELL)).count, 0);
});

test('同じマスに10個目が置かれると、まとめて消える。別のマスは残る', async () => {
  const users = await Promise.all(Array.from({ length: 10 }, (_, i) => user(`u${i}`)));
  const far = await postComment(users[0].db, users[0].uid, { lat: LAT + 0.01, lng: LNG, text: '遠く' });

  for (let i = 0; i < 9; i++) {
    // 同じマスの中で少しずつずらす
    const res = await postComment(users[i].db, users[i].uid, { lat: LAT + i * 0.00001, lng: LNG, text: `${i}` });
    assert.ok(res.id, `comment ${i}`);
  }
  assert.equal((await getCell(users[0].db, CELL)).count, 9);

  const res = await postComment(users[9].db, users[9].uid, { lat: LAT, lng: LNG, text: '10個目' });
  assert.equal(res.vanished.length, 9);

  const remaining = await live(users[0].db);
  assert.deepEqual(remaining.map((c) => c.text), ['遠く']);
  const cell = await getCell(users[0].db, CELL);
  assert.equal(cell.count, 0);
  assert.equal(cell.vanished, 1);
  assert.ok(far.id);

  // また置ける
  assert.ok((await postComment(users[9].db, users[9].uid, { lat: LAT, lng: LNG, text: '再び' })).id);
});

test('watchComments で範囲内のコメントがリアルタイムに届く', async () => {
  const alice = await user('alice');
  const bob = await user('bob');
  const bounds = { south: LAT - 0.01, north: LAT + 0.01, west: LNG - 0.01, east: LNG + 0.01 };
  const seen = [];
  const stop = watchComments(bob.db, bounds, (cs) => seen.push(cs.map((c) => c.text)), assert.fail);
  await postComment(alice.db, alice.uid, { lat: LAT, lng: LNG, text: '中' });
  await postComment(alice.db, alice.uid, { lat: LAT, lng: LNG + 1, text: '外' });
  await new Promise((r) => setTimeout(r, 300));
  stop();
  assert.deepEqual(seen.at(-1), ['中']);
});

test('watchLatest で全コメントが新しい順に届く', async () => {
  const alice = await user('alice');
  const bob = await user('bob');
  await postComment(alice.db, alice.uid, { lat: LAT, lng: LNG, text: '1つ目' });
  await postComment(alice.db, alice.uid, { lat: LAT + 1, lng: LNG + 1, text: '2つ目' });
  await postComment(alice.db, alice.uid, { lat: -33.8, lng: 151.2, text: '3つ目' });
  const seen = [];
  const stop = watchLatest(bob.db, (cs) => seen.push(cs), assert.fail, 2);
  await new Promise((r) => setTimeout(r, 300));
  stop();
  const last = seen.at(-1);
  assert.deepEqual(last.map((c) => c.text), ['3つ目', '2つ目']);
  assert.ok(last[0].createdAt.toMillis() >= last[1].createdAt.toMillis());
});

test('ルールで不正な書き込みを防ぐ', async () => {
  const alice = await user('alice');
  const bob = await user('bob');
  const valid = { uid: alice.uid, text: 'x', lat: LAT, lng: LNG, cell: CELL, createdAt: serverTimestamp() };

  async function tryCreate(db, data, cellData) {
    const ref = doc(collection(db, 'comments'));
    const batch = writeBatch(db);
    batch.set(ref, data);
    if (cellData !== null) batch.set(doc(db, 'cells', data.cell), { count: 1, last: ref.id, vanished: 0, ...cellData });
    return batch.commit();
  }
  const denied = (p) => assert.rejects(p, /permission/i);

  await denied(tryCreate(alice.db, valid, null)); // マスを数えない
  await denied(tryCreate(alice.db, { ...valid, uid: bob.uid }, {})); // なりすまし
  await denied(tryCreate(alice.db, { ...valid, cell: '0_0' }, {})); // 位置とマスが合わない
  await denied(tryCreate(alice.db, { ...valid, text: '' }, {}));
  await denied(tryCreate(alice.db, { ...valid, text: 'あ'.repeat(141) }, {}));
  await denied(tryCreate(alice.db, { ...valid, lat: 91, cell: cellOf(91, LNG) }, {}));
  await denied(tryCreate(alice.db, { ...valid, extra: 1 }, {}));
  await denied(tryCreate(alice.db, valid, { count: 5 })); // 数をごまかす
  await tryCreate(alice.db, { ...valid, text: 'あ'.repeat(140) }, {});

  // マスだけを勝手にいじる
  await denied(setDoc(doc(alice.db, 'cells', CELL), { count: 0, last: '', vanished: 1 }));
  await denied(setDoc(doc(alice.db, 'cells', CELL), { count: 2, last: 'nope', vanished: 0 }));

  // 9個そろっていないのに他人のコメントは消せない
  const [{ id }] = (await getDocs(collection(alice.db, 'comments'))).docs;
  const batch = writeBatch(bob.db);
  batch.delete(doc(bob.db, 'comments', id));
  batch.set(doc(bob.db, 'cells', CELL), { count: 0, last: '', vanished: 1 });
  await denied(batch.commit());

  // コメントの書き換えはできない
  await denied(setDoc(doc(alice.db, 'comments', id), { ...valid, text: '書き換え' }));
  assert.equal((await getDoc(doc(alice.db, 'comments', id))).data().text.length, 140);
});

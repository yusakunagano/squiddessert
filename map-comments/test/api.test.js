import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../server.js';
import { CommentStore } from '../store.js';

let server;
let base;
let store;

before(async () => {
  store = new CommentStore({ overlapRadius: 30, overlapLimit: 10 });
  server = createApp({ store, config: { mapsApiKey: 'test-key', mapId: 'DEMO_MAP_ID' } });
  await new Promise((r) => server.listen(0, r));
  base = `http://localhost:${server.address().port}`;
});

after(() => server.close());

function call(path, { token, method = 'GET', body } = {}) {
  return fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { 'X-Owner-Token': token } : {}) },
    body: body && JSON.stringify(body),
  });
}

function post(token, lat, lng, text = 'hello') {
  return call('/api/comments', { token, method: 'POST', body: { lat, lng, text } });
}

test('config を返す', async () => {
  const res = await call('/api/config');
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.mapsApiKey, 'test-key');
  assert.equal(data.overlapLimit, 10);
});

test('投稿して一覧に出る。自分のものだけ mine=true', async () => {
  store.comments = [];
  const res = await post('alice', 35.0, 139.0, 'やあ');
  assert.equal(res.status, 201);
  const { comment, removed } = await res.json();
  assert.equal(comment.text, 'やあ');
  assert.equal(comment.mine, true);
  assert.equal(comment.ownerHash, undefined);
  assert.deepEqual(removed, []);

  const forAlice = await (await call('/api/comments', { token: 'alice' })).json();
  assert.equal(forAlice.comments[0].mine, true);
  const forBob = await (await call('/api/comments', { token: 'bob' })).json();
  assert.equal(forBob.comments[0].mine, false);
});

test('範囲で絞り込める', async () => {
  store.comments = [];
  await post('alice', 35.0, 139.0);
  await post('alice', 10.0, 10.0);
  const q = 'south=34&west=138&north=36&east=140';
  const { comments } = await (await call(`/api/comments?${q}`)).json();
  assert.equal(comments.length, 1);
  assert.equal(comments[0].lat, 35.0);
});

test('自分のコメントは消せるが、他人のコメントは消せない', async () => {
  store.comments = [];
  const { comment } = await (await post('alice', 35.0, 139.0)).json();

  assert.equal((await call(`/api/comments/${comment.id}`, { token: 'bob', method: 'DELETE' })).status, 403);
  assert.equal((await call(`/api/comments/${comment.id}`, { method: 'DELETE' })).status, 403);
  assert.equal((await call(`/api/comments/${comment.id}`, { token: 'alice', method: 'DELETE' })).status, 204);
  assert.equal((await call(`/api/comments/${comment.id}`, { token: 'alice', method: 'DELETE' })).status, 404);
  assert.equal(store.comments.length, 0);
});

test('10個重なると全部消える。離れたコメントは残る', async () => {
  store.comments = [];
  await post('far', 35.01, 139.0, '遠くのコメント'); // 約1.1km 離れている

  for (let i = 0; i < 9; i++) {
    // 0.00002度 ≒ 2m ずつずらして、すべて 30m 以内に置く
    const { removed } = await (await post(`user${i}`, 35.0 + i * 0.00002, 139.0)).json();
    assert.deepEqual(removed, []);
  }
  assert.equal(store.comments.length, 10);

  const { comment, removed } = await (await post('user9', 35.0001, 139.0)).json();
  assert.equal(removed.length, 10);
  assert.ok(removed.includes(comment.id));
  assert.equal(store.comments.length, 1);
  assert.equal(store.comments[0].text, '遠くのコメント');
});

test('入力チェック', async () => {
  assert.equal((await post(null, 35, 139)).status, 400);
  assert.equal((await post('a', 91, 139)).status, 400);
  assert.equal((await post('a', 35, 181)).status, 400);
  assert.equal((await post('a', 35, 139, '   ')).status, 400);
  assert.equal((await post('a', 35, 139, 'あ'.repeat(141))).status, 400);
  assert.equal((await post('a', 35, 139, 'あ'.repeat(140))).status, 201);
});

test('静的ファイルを配信し、外側は見せない', async () => {
  const res = await call('/');
  assert.equal(res.status, 200);
  assert.match(await res.text(), /マップコメント/);
  assert.notEqual((await call('/..%2fstore.js')).status, 200);
});

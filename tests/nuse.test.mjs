// nuse（api/nuse.js）の自動テスト。実行：npm test
import assert from "node:assert/strict";
import test from "node:test";

process.env.GEMINI_API_KEY ||= "test";
const { ai } = await import("../api/_shared.js");
const { default: handler } = await import("../api/nuse.js");

const call = async (body, ip = "1.1.1.1") => {
  let out;
  const res = { setHeader() {}, status(c) { this.c = c; return this; }, json(b) { out = [this.c, b]; }, end() {} };
  await handler({ method: "POST", headers: { "x-forwarded-for": ip }, body }, res);
  return out;
};
const u = (text) => ({ role: "user", text });
const a = (text) => ({ role: "assistant", text });

test("会話が空、または最後が利用者の発言でないなら 400", async () => {
  assert.equal((await call({ messages: [] }, "2.2.2.1"))[0], 400);
  assert.equal((await call({ messages: [u(" ")] }, "2.2.2.2"))[0], 400);
  assert.equal((await call({ messages: [u("a"), a("b")] }, "2.2.2.3"))[0], 400);
});

test("返事を返し、会話履歴とトーンを渡す（先頭の assistant は落とす）", async () => {
  let seen;
  ai.models.generateContent = async (req) => { seen = req; return { text: " こんにちは " }; };
  const [status, body] = await call({ messages: [a("はじめまして"), u("雨の日"), a("いいね"), u("図書館")], mood: "bold" }, "3.3.3.3");
  assert.equal(status, 200);
  assert.equal(body.reply, "こんにちは");
  assert.deepEqual(seen.contents.map((c) => c.role), ["user", "model", "user"]);
  assert.match(seen.config.systemInstruction, /大胆/);
});

test("10 回より古い発言は切り捨てて答える", async () => {
  ai.models.generateContent = async () => ({ text: "ok" });
  const long = Array.from({ length: 11 }, (_, i) => u(`m${i}`)).flatMap((m, i, all) => (i < all.length - 1 ? [m, a("r")] : [m]));
  const [status, body] = await call({ messages: long }, "5.5.5.5");
  assert.equal(status, 200); // 古い分は切り捨てて最新 10 回分だけ使う
  assert.equal(body.reply, "ok");
});

test("同じ接続元からの連続呼び出しは 429", async () => {
  ai.models.generateContent = async () => ({ text: "ok" });
  let last;
  for (let i = 0; i < 16; i++) last = await call({ messages: [u("x")] }, "4.4.4.4");
  assert.equal(last[0], 429);
});

test("action: step は会話から予定の下書きを返す（会話は <conversation> に入れて渡す・分は 5〜60 に収める）", async () => {
  let seen;
  ai.models.generateContent = async (req) => { seen = req; return { text: JSON.stringify({ title: "図書館の本を1冊選ぶ", minutes: 999, note: "雨の日の図書館から" }) }; };
  const [status, body] = await call({ action: "step", messages: [u("雨の日の図書館"), a("いいですね。どんな本？")] }, "6.6.6.6");
  assert.equal(status, 200);
  assert.deepEqual(body, { title: "図書館の本を1冊選ぶ", minutes: 60, note: "雨の日の図書館から" });
  assert.match(seen.contents[0].parts[0].text, /<conversation>\n利用者: 雨の日の図書館\nnuse: いいですね/);
  assert.ok(seen.config.responseJsonSchema.required.includes("title"));
});

test("action: step で会話が空なら 400、タイトルが空なら 422", async () => {
  assert.equal((await call({ action: "step", messages: [] }, "7.7.7.1"))[0], 400);
  ai.models.generateContent = async () => ({ text: JSON.stringify({ title: " ", minutes: 10, note: "" }) });
  assert.equal((await call({ action: "step", messages: [u("a")] }, "7.7.7.2"))[0], 422);
});

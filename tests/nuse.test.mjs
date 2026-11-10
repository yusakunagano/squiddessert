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

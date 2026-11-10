// muse（api/muse.js）の自動テスト。実行：npm test
import assert from "node:assert/strict";
import test from "node:test";

process.env.GEMINI_API_KEY ||= "test";
const { ai } = await import("../api/_shared.js");
const { default: handler } = await import("../api/muse.js");

const call = async (body, ip = "1.1.1.1") => {
  let out;
  const res = { setHeader() {}, status(c) { this.c = c; return this; }, json(b) { out = [this.c, b]; }, end() {} };
  await handler({ method: "POST", headers: { "x-forwarded-for": ip }, body }, res);
  return out;
};
const reply = { summary: "s", ideas: [1, 2, 3, 4].map((n) => ({ title: `t${n}`, body: `b${n}` })), questions: ["q1", "q2", "q3"], nextStep: "n" };

test("入力が空なら 400", async () => {
  const [status] = await call({ input: "  " }, "2.2.2.2");
  assert.equal(status, 400);
});

test("結果を整形して返し、入力は <input> で囲んで渡す", async () => {
  let seen;
  ai.models.generateContent = async (req) => { seen = req; return { text: JSON.stringify(reply) }; };
  const [status, body] = await call({ input: "雨の日", mood: "bold" }, "3.3.3.3");
  assert.equal(status, 200);
  assert.equal(body.ideas.length, 3);
  assert.equal(body.questions.length, 2);
  assert.match(seen.contents[0].parts[0].text, /<input>\n雨の日\n<\/input>/);
  assert.match(seen.config.systemInstruction, /大胆/);
});

test("同じ接続元からの連続呼び出しは 429", async () => {
  ai.models.generateContent = async () => ({ text: JSON.stringify(reply) });
  let last;
  for (let i = 0; i < 11; i++) last = await call({ input: "x" }, "4.4.4.4");
  assert.equal(last[0], 429);
});

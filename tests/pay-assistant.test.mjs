// AIサポートの中継（api/pay-assistant.js）の自動テスト。実行：npm test
// 本物の Gemini は呼ばず、返事を作る部分を、テスト用に差し替えて確認する。
import assert from "node:assert/strict";
import test from "node:test";

process.env.GEMINI_API_KEY ||= "test"; // _shared.js が読み込み時に参照する（このテストでは使わない）
const { ai } = await import("../api/_shared.js");
const { default: handler } = await import("../api/pay-assistant.js");

const call = async (body, ip) => {
  let out;
  const res = { setHeader() {}, status(c) { this.c = c; return this; }, json(b) { out = [this.c, b]; }, end() {} };
  await handler({ method: "POST", headers: { "x-forwarded-for": ip }, body }, res);
  return out;
};
const msg = (page, text) => ({ page, facts: "案内", messages: [{ role: "user", text }] });

// 呼び出しの内容を記録しながら、決めた返事を返す
function stub(reply) {
  const seen = [];
  ai.models.generateContent = async (req) => { seen.push(req); return { text: JSON.stringify({ scopes: [], chips: [], links: [], ...reply }) }; };
  return seen;
}

test("AI は「特集一覧を開く」を返せる（スキーマ・指示・そのまま返る）", async () => {
  const seen = stub({ reply: "特集の一覧を開きます", action: "open_campaigns" });
  const [status, body] = await call(msg("deals", "他の特集も見たい"), "10.0.0.1");
  assert.equal(status, 200);
  assert.equal(body.action, "open_campaigns");
  const req = seen.at(-1);
  assert.ok(req.config.responseJsonSchema.properties.action.enum.includes("open_campaigns"), "スキーマに open_campaigns がある");
  assert.match(req.config.systemInstruction, /open_campaigns: 利用者が「他の特集」/, "指示に open_campaigns の説明がある");
  assert.match(req.config.systemInstruction, /紹介した以外の特集も見たがっている/, "お得な情報の指示にも、特集一覧への案内がある");
});

test("ほかの画面を開く action は、これまでどおり返る", async () => {
  for (const action of ["open_send", "open_history", "open_register", "open_services", "none"]) {
    stub({ reply: "ok", action });
    const [status, body] = await call(msg("home", "テスト"), "10.0.0.2");
    assert.equal(status, 200);
    assert.equal(body.action, action);
  }
});

test("スキーマにない action は、AI が返しても通らない設計（enum で限定している）", () => {
  const seen = stub({ reply: "ok", action: "none" });
  return call(msg("home", "テスト"), "10.0.0.3").then(() => {
    const enumValues = seen.at(-1).config.responseJsonSchema.properties.action.enum;
    assert.deepEqual(enumValues, ["none", "open_send", "open_history", "open_register", "open_services", "open_campaigns", "need_consent"]);
  });
});

test("利用サービスのAI：提携銀行の口座を持っていないときは、銀行口座の登録画面を開くよう指示している", async () => {
  const seen = stub({ reply: "登録の画面を開きます", action: "open_register" });
  const [status, body] = await call(msg("services", "提携銀行の口座は持っていません"), "10.0.0.4");
  assert.equal(status, 200);
  assert.equal(body.action, "open_register");
  assert.match(seen.at(-1).config.systemInstruction, /口座を「持っていない」「これから作る」と答えたときは、銀行口座の登録画面を開く/);
  // ほかのページの指示には入っていない
  stub({ reply: "ok", action: "none" });
  const home = [];
  ai.models.generateContent = async (req) => { home.push(req); return { text: JSON.stringify({ reply: "ok", action: "none", scopes: [], chips: [], links: [] }) }; };
  await call(msg("home", "こんにちは"), "10.0.0.5");
  assert.doesNotMatch(home.at(-1).config.systemInstruction, /これから作る/);
});

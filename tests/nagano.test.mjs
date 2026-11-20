import test from "node:test";
import assert from "node:assert/strict";
process.env.GEMINI_API_KEY ||= "test";
const { route } = await import("../api/nagano.js");

test("話題の振り分け", () => {
  assert.deepEqual(route("自己紹介して"), ["nagano"]);
  assert.deepEqual(route("d払いの始め方は？"), ["dpay"]);
  assert.deepEqual(route("d払いが使えない"), ["dpay_faq"]);
  assert.deepEqual(route("dカードの年会費"), ["dcard"]);
  assert.ok(route("どんな会社？").includes("dfg"));
  assert.deepEqual(route("ahamoって何"), ["docomo"]);
  assert.deepEqual(route("今日の天気"), ["nagano"]);
});

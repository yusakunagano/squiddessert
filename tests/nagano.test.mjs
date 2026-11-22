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

const { stripUrls, pickLinks } = await import("../api/nagano.js");
test("本文の URL と参考行を消す", () => {
  assert.equal(stripUrls("答えです。\n\n参考：[d払い](https://service.smt.docomo.ne.jp/keitai_payment/)"), "答えです。");
  assert.equal(stripUrls("詳しくは https://example.com を見て"), "詳しくは  を見て");
});
test("参考リンクは検索の根拠になった公式ページを優先", () => {
  const r = { candidates: [{ groundingMetadata: { groundingChunks: [
    { web: { uri: "https://g/redirect1", title: "docomo.ne.jp" } },
    { web: { uri: "https://g/redirect2", title: "example.com" } },
  ] } }] };
  assert.deepEqual(pickLinks(r, ["https://top/"]).map((l) => l.url), ["https://g/redirect1"]);
  assert.deepEqual(pickLinks({}, ["https://top/"]).map((l) => l.url), ["https://top/"]);
});

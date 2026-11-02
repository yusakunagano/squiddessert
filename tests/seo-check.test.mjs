// SEO・OGP・AIO チェック（api/seo-check.js など）の自動テスト。実行：npm test
// 手元の簡易サーバーに接続するテストだけ、テスト用の許可（allowHosts）を付けた取得部品を使う。本番の取得部品には付けない。
import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";
import zlib from "node:zlib";

process.env.GEMINI_API_KEY ||= "test"; // _shared.js が読み込み時に参照する（このテストでは使わない）
const { createFetcher, isPrivateAddress, safeFetcher, BlockedError } = await import("../api/_safefetch.js");
const { AI_BOTS, blocksRoot, evaluate, extractFacts, parseRobots } = await import("../api/_seo.js");
const { createHandler } = await import("../api/seo-check.js");
const { createLimiter } = await import("../api/_ratelimit.js");

// ---------- テスト用のページ ----------
const GOOD = `<!doctype html><html lang="ja"><head><meta charset="utf-8">
<title>銀行口座の登録方法｜かんたんガイド</title>
<meta name="description" content="銀行口座をアプリに登録する手順を、準備するもの・本人確認・認証の順に、画像つきで分かりやすく説明します。初めての方でも約10分で終わります。">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="canonical" href="/guide/">
<meta property="og:title" content="銀行口座の登録方法"><meta property="og:description" content="手順をやさしく説明"><meta property="og:image" content="https://127.0.0.1/og.png">
<meta property="og:url" content="/guide/"><meta property="og:type" content="article"><meta name="twitter:card" content="summary_large_image">
<meta name="author" content="編集部">
<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"Organization","name":"例"},{"@type":"Article","headline":"銀行口座の登録方法","datePublished":"2026-10-01","dateModified":"2026-10-20","author":{"@type":"Person","name":"編集部"}}]}</script>
</head><body><header><nav>メニュー</nav></header><main><article>
<h1>銀行口座の登録方法</h1>
<p>結論：準備するものをそろえれば、約10分で登録できます。手順は大きく5つです。</p>
<h2>準備するものは？</h2><ul><li>キャッシュカード</li><li>本人確認書類</li></ul>
<h2>本人確認はどうする？</h2><p>${"本人確認書類を撮影して送ります。".repeat(30)}</p>
<h2>よくある質問</h2><table><tr><td>A</td><td>B</td></tr></table>
<img src="/a.png" alt="手順の図"><a href="/next">次の手順を見る</a>
</article></main><footer><a href="/about">会社概要</a> <a href="/contact">お問い合わせ</a> <a href="/privacy">プライバシーポリシー</a></footer></body></html>`;
const BAD = `<!doctype html><html><head><meta name="robots" content="noindex,nofollow"></head><body><div id="root"></div>
<h3>見出し</h3><h1>A</h1><h1>B</h1><img src="1.png"><img src="2.png"><a href="/x">こちら</a><a href="/y">こちら</a><a href="/z">こちら</a><a href="/w">こちら</a><a href="/v"></a>
<script>window.app = 1</script></body></html>`;
const ROBOTS_BLOCKING = `User-agent: *\nAllow: /\n\nUser-agent: OAI-SearchBot\nDisallow: /\n\nUser-agent: GPTBot\nDisallow: /\n\nSitemap: https://example.com/sitemap.xml\n`;

function server(routes) {
  const srv = http.createServer((req, res) => {
    const r = routes[req.url.split("?")[0]];
    if (!r) { res.writeHead(404, { "content-type": "text/html" }); return res.end("<html><body>Not Found</body></html>"); }
    r(req, res);
  });
  return new Promise((ok) => srv.listen(0, "127.0.0.1", () => ok({ srv, base: `http://127.0.0.1:${srv.address().port}` })));
}
const send = (type, body, status = 200, extra = {}) => (req, res) => { res.writeHead(status, { "content-type": type, ...extra }); res.end(body); };
const call = async (handler, body, ip = "9.9.9.9") => {
  let out;
  const res = { setHeader() {}, status(c) { this.c = c; return this; }, json(b) { out = [this.c, b]; }, end() {} };
  await handler({ method: "POST", headers: { "x-forwarded-for": ip }, body }, res);
  return out;
};

// ---------- 取得の安全対策 ----------
test("非公開のアドレスを判定できる", () => {
  for (const a of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.0.1", "169.254.169.254", "0.0.0.0", "100.64.0.1", "224.0.0.1", "::1", "::", "fe80::1", "fd00::1", "::ffff:127.0.0.1", "::ffff:7f00:1", "64:ff9b::1", "abc"])
    assert.equal(isPrivateAddress(a), true, a);
  for (const a of ["8.8.8.8", "1.1.1.1", "93.184.216.34", "172.32.0.1", "2606:4700:4700::1111"])
    assert.equal(isPrivateAddress(a), false, a);
});

test("危険な URL は取得前に拒否する", () => {
  for (const u of ["http://localhost/", "http://127.0.0.1/", "http://2130706433/", "http://0x7f.1/", "http://10.0.0.1/", "http://169.254.169.254/latest/meta-data/",
    "http://[::1]/", "http://[::ffff:127.0.0.1]/", "http://foo.internal/", "http://foo.local/", "https://user:pass@example.com/", "http://example.com:8080/", "http://example.com:22/",
    "file:///etc/passwd", "ftp://example.com/", "javascript:alert(1)", "not a url"])
    assert.throws(() => safeFetcher.checkUrl(u), BlockedError, u);
  assert.doesNotThrow(() => safeFetcher.checkUrl("https://example.com/path?x=1"));
});

test("取得：転送・圧縮・大きさの上限・時間切れ", async () => {
  const { srv, base } = await server({
    "/gz": (req, res) => { res.writeHead(200, { "content-type": "text/html; charset=utf-8", "content-encoding": "gzip" }); res.end(zlib.gzipSync("<title>圧縮</title>")); },
    "/r1": send("text/html", "", 301, { location: "/r2" }),
    "/r2": send("text/html", "", 302, { location: "/gz" }),
    "/loop": send("text/html", "", 302, { location: "/loop" }),
    "/evil": send("text/html", "", 302, { location: "http://169.254.169.254/latest/meta-data/" }),
    "/big": send("text/html", "x".repeat(50_000)),
    "/slow": (req, res) => setTimeout(() => res.end("late"), 3000),
  });
  const f = createFetcher({ allowHosts: ["127.0.0.1"] });
  try {
    assert.equal((await f.get(`${base}/gz`)).body, "<title>圧縮</title>");
    const r = await f.get(`${base}/r1`);
    assert.equal(r.redirects.length, 2); assert.ok(r.finalUrl.endsWith("/gz")); assert.equal(r.body, "<title>圧縮</title>");
    await assert.rejects(f.get(`${base}/loop`), /リダイレクトが多すぎます/);
    await assert.rejects(f.get(`${base}/evil`), BlockedError); // 転送先も検査する
    const big = await f.get(`${base}/big`, { maxBytes: 1000 });
    assert.equal(big.truncated, true); assert.equal(big.bytes, 1000); assert.equal(big.body.length, 1000);
    await assert.rejects(f.get(`${base}/slow`, { timeoutMs: 700 }), /時間内/);
    assert.equal((await f.get(`${base}/gz`, { headersOnly: true })).status, 200);
    // テスト用の許可がない本番の部品は、手元のサーバーに接続できない
    await assert.rejects(safeFetcher.get(`${base}/gz`), BlockedError);
  } finally { srv.close(); srv.closeAllConnections?.(); }
});

// ---------- 判定 ----------
const run = (html, extra = {}) => {
  const page = { status: 200, finalUrl: "https://example.com/guide/", redirects: [], ms: 400, bytes: html.length, truncated: false, contentType: "text/html", headers: {}, ...extra.page };
  const facts = extractFacts(html, page.finalUrl, page.headers);
  const res = evaluate({ facts, page, robots: extra.robots ?? { status: 200, contentType: "text/plain", body: "User-agent: *\nAllow: /\nSitemap: https://example.com/sitemap.xml" }, sitemap: extra.sitemap ?? null, llms: extra.llms ?? null, ogImage: extra.ogImage ?? { status: 200, contentType: "image/png" } });
  const by = Object.fromEntries(res.groups.flatMap((g) => g.checks).map((c) => [c.id, c]));
  return { res, by, facts };
};

test("よく整ったページは、3 つとも高い点数になる", () => {
  const { res, by } = run(GOOD);
  assert.ok(res.scores.seo >= 90, `seo ${res.scores.seo}`);
  assert.ok(res.scores.share >= 90, `share ${res.scores.share}`);
  assert.ok(res.scores.aio >= 85, `aio ${res.scores.aio}`);
  for (const id of ["https", "title", "description", "h1", "canonical", "noindex", "jsonld", "schema-types", "static-text", "answer-first", "eeat", "og-image", "twitter-card"])
    assert.equal(by[id].status, "ok", `${id}: ${by[id].detail}`);
  assert.equal(by.faq.status, "info");
  assert.deepEqual(res.priorities.filter((p) => p.status === "fail"), []);
  assert.equal(res.preview.fallback.title, false);
});

test("問題の多いページは、問題を見つけて点数が低くなる", () => {
  const { res, by } = run(BAD, { page: { finalUrl: "http://example.com/", status: 200 }, robots: { status: 404, contentType: "text/html", body: "" }, ogImage: null });
  assert.equal(by.https.status, "fail");
  assert.equal(by.title.status, "fail");
  assert.equal(by.description.status, "fail");
  assert.equal(by.h1.status, "warn"); // h1 が 2 つ
  assert.equal(by.headings.status, "warn"); // h3 から始まり階層が飛ぶ
  assert.equal(by.noindex.status, "fail");
  assert.equal(by["img-alt"].status, "fail");
  assert.equal(by["link-text"].status, "warn");
  assert.equal(by["robots-txt"].status, "warn");
  assert.equal(by.jsonld.status, "fail");
  assert.equal(by["static-text"].status, "fail"); // JavaScript で描画する前提の空のページ
  assert.equal(by["og-image"].status, "fail");
  assert.ok(res.scores.seo < 40 && res.scores.aio < 30, JSON.stringify(res.scores));
  assert.ok(res.priorities.length === 5 && res.priorities.every((p) => p.fix));
  assert.equal(res.priorities[0].status, "fail");
});

test("存在しないファイルに HTML を返すサイトを、あると誤判定しない", () => {
  const html404 = { status: 200, contentType: "text/html; charset=utf-8", body: "<html>SPA</html>" };
  const { by } = run(GOOD, { robots: html404, sitemap: html404, llms: html404 });
  assert.equal(by["robots-txt"].status, "warn");
  assert.equal(by.sitemap.status, "warn");
  assert.match(by.llms_txt?.detail ?? by["llms-txt"].detail, /ありません/);
  const { by: ok } = run(GOOD, { sitemap: { status: 200, contentType: "application/xml", body: "" }, llms: { status: 200, contentType: "text/plain", body: "# x" } });
  assert.equal(ok.sitemap.status, "ok"); assert.match(ok["llms-txt"].detail, /あります/);
});

test("robots.txt：AI クローラーの許可を、検索側と学習側に分けて判定する", () => {
  const robots = parseRobots(ROBOTS_BLOCKING);
  assert.equal(blocksRoot(robots, "OAI-SearchBot"), true);
  assert.equal(blocksRoot(robots, "GPTBot"), true);
  assert.equal(blocksRoot(robots, "ClaudeBot"), false); // * の Allow に従う
  assert.equal(blocksRoot(parseRobots("User-agent: *\nDisallow: /\n"), "PerplexityBot"), true);
  assert.equal(blocksRoot(parseRobots("User-agent: *\nDisallow: /\nUser-agent: PerplexityBot\nAllow: /\n"), "PerplexityBot"), false);
  assert.equal(blocksRoot(parseRobots("User-agent: *\nDisallow: /private/\n"), "GPTBot"), false);
  assert.equal(blocksRoot(parseRobots("User-agent: *\nDisallow:\n"), "GPTBot"), false);
  assert.ok(AI_BOTS.every((b) => b.kind === "search" || b.kind === "train"));
  const { by } = run(GOOD, { robots: { status: 200, contentType: "text/plain", body: ROBOTS_BLOCKING } });
  assert.equal(by["ai-crawlers"].status, "warn");
  assert.match(by["ai-crawlers"].detail, /OAI-SearchBot/);
  assert.match(by["ai-crawlers"].fix, /OAI-SearchBot/);
  // 学習側だけのブロックは、警告にしない
  const { by: t } = run(GOOD, { robots: { status: 200, contentType: "text/plain", body: "User-agent: GPTBot\nDisallow: /\n\nUser-agent: CCBot\nDisallow: /\n" } });
  assert.equal(t["ai-crawlers"].status, "ok"); assert.equal(t["ai-training"].status, "info");
});

test("構造化データが壊れている・Q&A 見出しに FAQPage がない", () => {
  const broken = GOOD.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/, '<script type="application/ld+json">{ not json }</script>');
  assert.equal(run(broken).by.jsonld.status, "warn");
  const qa = GOOD.replace("<h2>よくある質問</h2>", "<h2>手数料はかかる？</h2><h2>本人確認は必要？</h2>");
  assert.equal(run(qa).by["faq-schema"]?.status, "warn");
});

test("日本語の文字数の目安・文字コード", () => {
  const long = GOOD.replace(/<title>.*?<\/title>/, `<title>${"あ".repeat(60)}</title>`);
  assert.equal(run(long).by.title.status, "warn");
  const short = GOOD.replace(/<title>.*?<\/title>/, "<title>ガイド</title>");
  assert.equal(run(short).by.title.status, "warn");
  assert.equal(run(GOOD.replace('lang="ja"', 'lang="en"')).by.lang.status, "warn");
});

// ---------- API ----------
test("API：URL を渡すと、点数・項目・共有時のプレビューが返る", async () => {
  const { srv, base } = await server({
    "/": send("text/html; charset=utf-8", GOOD.replace("https://127.0.0.1/og.png", "http://127.0.0.1/og.png")),
    "/robots.txt": send("text/plain", ROBOTS_BLOCKING),
    "/sitemap.xml": send("application/xml", "<urlset/>"),
    "/llms.txt": send("text/plain", "# llms"),
    "/og.png": send("image/png", "png"),
    "/pdf": send("application/pdf", "%PDF"),
  });
  const handler = createHandler(createFetcher({ allowHosts: ["127.0.0.1"] }));
  try {
    const [status, r] = await call(handler, { url: `${base}/` });
    assert.equal(status, 200, JSON.stringify(r));
    assert.deepEqual(Object.keys(r.scores).sort(), ["aio", "seo", "share"]);
    assert.equal(r.groups.length, 3);
    assert.ok(r.groups.every((g) => g.checks.length >= 7 && g.checks.every((c) => c.id && c.label && c.status)));
    assert.equal(r.status, 200);
    assert.equal(r.preview.title, "銀行口座の登録方法");
    assert.equal(r.facts.title, "銀行口座の登録方法｜かんたんガイド");
    const ai = r.groups.find((g) => g.id === "aio").checks;
    assert.equal(ai.find((c) => c.id === "ai-crawlers").status, "warn");
    assert.match(ai.find((c) => c.id === "llms-txt").detail, /あります/);

    assert.equal((await call(handler, { url: "" }))[0], 400);
    assert.equal((await call(handler, { url: `${base}/pdf` }))[0], 422);
    const missing = await call(handler, { url: `${base}/nothing` });
    assert.equal(missing[0], 200); // 404 のページも、状態を報告する
    assert.equal(missing[1].groups.flatMap((g) => g.checks).find((c) => c.id === "status").status, "fail");
    // 公開されていないアドレスは、422 で拒否する（本番の取得部品）
    for (const u of [`${base}/`, "http://169.254.169.254/latest/meta-data/", "http://localhost/", "file:///etc/passwd"]) {
      const out = await call(createHandler(safeFetcher), { url: u });
      assert.equal(out[0], 422, u);
    }
  } finally { srv.close(); srv.closeAllConnections?.(); }
});

test("API：短時間に何度も呼ぶと 429、接続元ごとに数える", async () => {
  const handler = createHandler({ get: async () => { throw new Error("使われない"); } }, { limiter: createLimiter({ max: 3, windowMs: 60_000 }) });
  const codes = [];
  for (let i = 0; i < 4; i++) codes.push((await call(handler, { url: "https://example.com/" }, "1.1.1.1"))[0]);
  assert.deepEqual(codes, [502, 502, 502, 429]);
  assert.equal((await call(handler, { url: "https://example.com/" }, "2.2.2.2"))[0], 502);
});

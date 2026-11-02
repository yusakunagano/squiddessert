// SEO・SNS 共有（OGP）・AIO（AI 検索・生成 AI 向け）の、機械的なチェック。
// HTML と robots.txt などを読んで、決まったルールで判定する（AI は使わない）。順位や AI での引用を保証するものではない。
// ファイル名が _ で始まるので Vercel は API として公開しない。
import { parse } from "node-html-parser";

// ---- AI クローラー（robots.txt での許可の確認用）。kind: search=AI 検索・回答に出る側、train=学習データ側 ----
export const AI_BOTS = [
  { ua: "OAI-SearchBot", kind: "search", label: "OpenAI（ChatGPT 検索）" },
  { ua: "ChatGPT-User", kind: "search", label: "OpenAI（ChatGPT の閲覧）" },
  { ua: "Claude-SearchBot", kind: "search", label: "Anthropic（Claude 検索）" },
  { ua: "Claude-User", kind: "search", label: "Anthropic（Claude の閲覧）" },
  { ua: "PerplexityBot", kind: "search", label: "Perplexity（検索）" },
  { ua: "Perplexity-User", kind: "search", label: "Perplexity（閲覧）" },
  { ua: "GPTBot", kind: "train", label: "OpenAI（学習）" },
  { ua: "ClaudeBot", kind: "train", label: "Anthropic（学習）" },
  { ua: "Google-Extended", kind: "train", label: "Google（Gemini の学習・利用）" },
  { ua: "Applebot-Extended", kind: "train", label: "Apple（AI の学習）" },
  { ua: "CCBot", kind: "train", label: "Common Crawl（学習データ）" },
  { ua: "Bytespider", kind: "train", label: "ByteDance（学習）" },
  { ua: "Meta-ExternalAgent", kind: "train", label: "Meta（AI の学習）" },
];

// ---- robots.txt ----
export function parseRobots(text) {
  const groups = [];
  const sitemaps = [];
  let cur = null;
  let lastWasAgent = false;
  for (const raw of String(text ?? "").split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    const m = /^([A-Za-z-]+)\s*:\s*(.*)$/.exec(line);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const value = m[2].trim();
    if (key === "user-agent") {
      if (!cur || !lastWasAgent) { cur = { agents: [], rules: [] }; groups.push(cur); }
      cur.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (key === "sitemap") sitemaps.push(value);
    else if ((key === "disallow" || key === "allow") && cur) cur.rules.push({ type: key, path: value });
  }
  return { groups, sitemaps };
}

// サイト全体（/）をクロール禁止にしているか。その UA の専用の記述があればそれを、なければ * の記述を見る。
export function blocksRoot(robots, ua) {
  const name = ua.toLowerCase();
  const group = robots.groups.find((g) => g.agents.includes(name)) ?? robots.groups.find((g) => g.agents.includes("*"));
  if (!group) return false;
  const disallowAll = group.rules.some((r) => r.type === "disallow" && r.path === "/");
  const allowAll = group.rules.some((r) => r.type === "allow" && r.path === "/");
  return disallowAll && !allowAll;
}

// ---- 小さな部品 ----
const clean = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
// 表示の幅の目安（全角 = 2、半角 = 1）。検索結果での切れやすさの判断に使う
const width = (s) => [...String(s)].reduce((n, ch) => n + (ch.codePointAt(0) > 0xff ? 2 : 1), 0);
const GENERIC_LINK = /^(こちら|ここ|詳細|詳しくはこちら|詳しく見る|もっと見る|続きを読む|more|read more|click here|here|link)$/i;

function walk(node, fn) {
  if (Array.isArray(node)) node.forEach((x) => walk(x, fn));
  else if (node && typeof node === "object") {
    fn(node);
    for (const v of Object.values(node)) walk(v, fn);
  }
}

// ---- HTML から、判定に使う事実を取り出す ----
export function extractFacts(html, pageUrl, headers = {}) {
  const root = parse(String(html ?? ""), { blockTextElements: { script: true, style: true, noscript: true, pre: true } });
  const abs = (href) => { try { return new URL(href, pageUrl).href; } catch { return ""; } };

  const meta = {};
  for (const m of root.querySelectorAll("meta")) {
    const key = (m.getAttribute("name") || m.getAttribute("property") || m.getAttribute("http-equiv") || "").toLowerCase();
    const content = m.getAttribute("content");
    if (key && content != null && !(key in meta)) meta[key] = clean(content);
  }

  // 構造化データ（JSON-LD）は、スクリプトを取り除く前に読む
  const ld = [];
  let ldInvalid = 0;
  for (const s of root.querySelectorAll("script")) {
    if ((s.getAttribute("type") || "").toLowerCase() !== "application/ld+json") continue;
    try { ld.push(JSON.parse(s.text)); } catch { ldInvalid++; }
  }
  const ldTypes = new Set();
  const ldHas = { author: false, published: false, modified: false };
  walk(ld, (o) => {
    for (const t of [].concat(o["@type"] ?? [])) ldTypes.add(String(t));
    if (o.author) ldHas.author = true;
    if (o.datePublished) ldHas.published = true;
    if (o.dateModified) ldHas.modified = true;
  });

  const htmlEl = root.querySelector("html");
  const titleEl = root.querySelector("title");
  const canonicalEl = root.querySelector('link[rel~="canonical"]');
  const headings = root.querySelectorAll("h1,h2,h3,h4,h5,h6").map((h) => ({ level: Number(h.tagName[1]), text: clean(h.text) }));
  const imgs = root.querySelectorAll("img");
  const links = root.querySelectorAll("a[href]").filter((a) => !/^(#|javascript:|mailto:|tel:)/i.test(a.getAttribute("href") ?? ""));
  const linkText = (a) => clean(a.text) || clean(a.getAttribute("aria-label")) || clean(a.querySelector("img")?.getAttribute("alt"));
  const trust = { about: false, contact: false, policy: false };
  for (const a of links) {
    const s = `${linkText(a)} ${a.getAttribute("href")}`;
    if (/会社概要|企業情報|運営会社|運営者|about/i.test(s)) trust.about = true;
    if (/お問い合わせ|問い合わせ|contact/i.test(s)) trust.contact = true;
    if (/プライバシー|privacy|利用規約|terms|特定商取引/i.test(s)) trust.policy = true;
  }
  const hasDate = !!(root.querySelector("time[datetime]") || meta["article:published_time"] || meta["article:modified_time"] || ldHas.published || ldHas.modified);
  const hasAuthor = !!(meta.author || root.querySelector('[rel~="author"]') || root.querySelector('[itemprop="author"]') || root.querySelector(".author, .byline") || ldHas.author);
  const breadcrumb = ldTypes.has("BreadcrumbList") || !!root.querySelector('[aria-label*="bread" i], [aria-label*="パンくず"], .breadcrumb, .breadcrumbs');

  // 本文の長さなどは、スクリプトなどを取り除いてから数える。ナビ・フッターは本文に含めない。
  root.querySelectorAll("script,style,noscript,template").forEach((n) => n.remove());
  const body = root.querySelector("body") ?? root;
  const main = root.querySelector("main") ?? root.querySelector("article") ?? body;
  const region = parse(main.outerHTML);
  region.querySelectorAll("nav,header,footer,aside").forEach((n) => n.remove());
  const text = clean(region.text);
  const firstParagraph = region.querySelectorAll("p").map((p) => clean(p.text)).find((t) => t.length >= 20) ?? "";

  return {
    lang: clean(htmlEl?.getAttribute("lang")),
    title: clean(titleEl?.text),
    description: meta.description ?? "",
    canonical: canonicalEl ? abs(canonicalEl.getAttribute("href")) : "",
    robotsMeta: `${meta.robots ?? ""} ${meta.googlebot ?? ""} ${headers["x-robots-tag"] ?? ""}`.toLowerCase(),
    viewport: meta.viewport ?? "",
    og: Object.fromEntries(Object.entries(meta).filter(([k]) => k.startsWith("og:") || k.startsWith("twitter:") || k === "article:published_time")),
    ogImage: meta["og:image"] ? abs(meta["og:image"]) : "",
    headings,
    h1s: headings.filter((h) => h.level === 1).map((h) => h.text),
    images: { total: imgs.length, missingAlt: imgs.filter((i) => !i.hasAttribute("alt")).length },
    links: { total: links.length, empty: links.filter((a) => !linkText(a)).length, generic: links.filter((a) => GENERIC_LINK.test(linkText(a))).length },
    jsonld: { blocks: ld.length, invalid: ldInvalid, types: [...ldTypes] },
    microdata: !!root.querySelector("[itemscope]"),
    textLength: text.length,
    firstParagraphLength: firstParagraph.length,
    lists: region.querySelectorAll("ul,ol").length,
    tables: region.querySelectorAll("table").length,
    questionHeadings: headings.filter((h) => /[?？]$/.test(h.text) || /^Q[.．:：]/i.test(h.text)).length,
    landmarks: { main: !!root.querySelector("main"), article: !!root.querySelector("article"), nav: !!root.querySelector("nav") },
    trust, hasAuthor, hasDate, breadcrumb,
  };
}

// ---- 判定 ----
const SCORE = { ok: 1, warn: 0.5, fail: 0 };

function makeCheck(group) {
  return (id, label, status, detail, fix = "", weight = 1) => ({ group, id, label, status, detail, fix: status === "ok" || status === "info" ? "" : fix, weight });
}

export function evaluate({ facts: f, page, robots: robotsRes, sitemap: sitemapRes, llms: llmsRes, ogImage: ogImageRes }) {
  // 存在しないファイルでも、HTML を 200 で返すサイトがある。HTML が返ってきたものは「ない」と扱う
  const isText = (r) => r?.status === 200 && !/html/i.test(r.contentType ?? "");
  const robots = isText(robotsRes) ? parseRobots(robotsRes.body) : null;
  const seo = makeCheck("seo");
  const share = makeCheck("share");
  const aio = makeCheck("aio");
  const checks = [];
  const add = (...c) => checks.push(...c);
  const u = new URL(page.finalUrl);

  // ===== 基本の SEO =====
  add(seo("https", "HTTPS で配信されている", u.protocol === "https:" ? "ok" : "fail", u.protocol === "https:" ? "https です" : "http のままです", "サイト全体を HTTPS にし、http からは https へ転送してください", 2));
  add(seo("status", "ページが正常に表示できる（HTTP 200）", page.status >= 200 && page.status < 300 ? "ok" : "fail", `HTTP ${page.status}`, "エラーや非公開のページは、検索にも AI にも使われません。正しく表示される URL を指定してください", 2));
  add(seo("redirects", "転送（リダイレクト）が少ない", page.redirects.length <= 2 ? "ok" : "warn", page.redirects.length ? `${page.redirects.length} 回転送されています` : "転送なし", "転送の連鎖を 1〜2 回までに減らし、最終の URL を直接案内してください", 1));

  const tw = width(f.title);
  add(seo("title", "タイトル（title）が適切", !f.title ? "fail" : tw < 20 || tw > 70 ? "warn" : "ok",
    f.title ? `「${f.title}」（全角換算で約 ${Math.round(tw / 2)} 文字）` : "ありません",
    !f.title ? "検索結果の見出しになる title を、そのページの内容を表す言葉で書いてください" : tw < 20 ? "短すぎます。ページの内容が分かる言葉を足し、全角 15〜35 文字ほどにしてください" : "長いと検索結果で途中で切れます。全角 35 文字ほどまでに収めてください", 3));
  const dl = [...f.description].length;
  add(seo("description", "説明文（meta description）が適切", !f.description ? "fail" : dl < 50 || dl > 140 ? "warn" : "ok",
    f.description ? `${dl} 文字：「${f.description.slice(0, 60)}${dl > 60 ? "…" : ""}」` : "ありません",
    !f.description ? "検索結果の説明文になります。ページの要点を 80〜120 文字ほどで書いてください" : dl < 50 ? "短すぎます。80〜120 文字ほどで要点を書いてください" : "長いと途中で切れます。120 文字ほどまでに収めてください", 2));
  add(seo("h1", "見出し（h1）が 1 つある", f.h1s.length === 1 ? "ok" : f.h1s.length === 0 ? "fail" : "warn",
    f.h1s.length === 1 ? `「${f.h1s[0]}」` : `${f.h1s.length} 個あります`,
    f.h1s.length === 0 ? "ページの主題を表す h1 を 1 つ置いてください" : "h1 は 1 ページに 1 つにし、小見出しは h2 以降にしてください", 2));
  const skipped = f.headings.some((h, i) => i > 0 && h.level > f.headings[i - 1].level + 1);
  const firstNotH1 = f.headings.length > 0 && f.headings[0].level !== 1;
  add(seo("headings", "見出しの階層が正しい", skipped || firstNotH1 || !f.headings.length ? "warn" : "ok",
    skipped ? "階層が飛んでいます（例：h2 のあとに h4）" : firstNotH1 ? `最初の見出しが h${f.headings[0].level} です（h1 から始まっていません）` : f.headings.length ? `見出し ${f.headings.length} 個` : "見出しがありません",
    "見出しは h1 → h2 → h3 の順に、飛ばさずに使ってください。AI も人も、構造から内容をつかみます", 1));
  const canonicalOk = f.canonical && new URL(f.canonical).host === u.host;
  add(seo("canonical", "正規 URL（canonical）が設定されている", canonicalOk ? "ok" : "warn",
    f.canonical ? (canonicalOk ? f.canonical : `別のサイトを指しています：${f.canonical}`) : "ありません",
    "同じ内容に複数の URL がある場合に備え、<link rel=\"canonical\"> で正しい URL を 1 つ指定してください", 2));
  const noindex = /noindex/.test(f.robotsMeta);
  add(seo("noindex", "検索結果への表示が禁止されていない", noindex ? "fail" : "ok", noindex ? "noindex が指定されています" : "noindex なし",
    "noindex があると、検索結果にも AI の回答にも出ません。公開したいページなら外してください", 3));
  add(seo("viewport", "スマホ表示の設定（viewport）がある", f.viewport ? "ok" : "warn", f.viewport || "ありません", "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"> を追加してください", 1));
  const jaText = /[぀-ヿ]/.test(f.title + f.description);
  add(seo("lang", "言語（html の lang）が宣言されている", !f.lang ? "warn" : jaText && !/^ja/i.test(f.lang) ? "warn" : "ok",
    f.lang ? `lang="${f.lang}"` : "ありません", jaText && f.lang ? "日本語のページなので lang=\"ja\" にしてください" : "<html lang=\"ja\"> のように言語を指定してください", 1));
  const altRatio = f.images.total ? f.images.missingAlt / f.images.total : 0;
  add(seo("img-alt", "画像に代替テキスト（alt）がある", !f.images.total ? "info" : altRatio === 0 ? "ok" : altRatio <= 0.2 ? "warn" : "fail",
    f.images.total ? `画像 ${f.images.total} 枚のうち、alt がないもの ${f.images.missingAlt} 枚` : "画像なし",
    "意味のある画像には内容を表す alt を、飾りの画像には alt=\"\" を付けてください", 1));
  add(seo("link-text", "リンクの文言が分かりやすい", f.links.empty + f.links.generic > 3 ? "warn" : "ok",
    `リンク ${f.links.total} 個（文言なし ${f.links.empty}、「こちら」など ${f.links.generic}）`, "「こちら」ではなく、行き先が分かる言葉をリンクにしてください", 1));
  add(seo("robots-txt", "robots.txt がある", !robotsRes ? "warn" : robots ? (blocksRoot(robots, "*") ? "fail" : "ok") : "warn",
    !robotsRes ? "取得できませんでした" : robots ? (blocksRoot(robots, "*") ? "サイト全体のクロールを禁止しています" : "あります") : robotsRes.status === 200 ? "ありません（HTML のページが返っています）" : `ありません（HTTP ${robotsRes.status}）`,
    robots ? "Disallow: / を外し、公開したいページはクロールを許可してください" : "/robots.txt を置き、Sitemap の場所も書いておくと確実です", 1));
  const hasSitemap = robots?.sitemaps.length > 0 || (isText(sitemapRes) && /xml/i.test(sitemapRes.contentType));
  add(seo("sitemap", "サイトマップ（sitemap.xml）がある", hasSitemap ? "ok" : "warn", hasSitemap ? "あります" : "見つかりません", "sitemap.xml を作り、robots.txt の Sitemap: に書いてください。ページを見つけてもらいやすくなります", 1));
  add(seo("speed", "サーバーの応答と HTML の大きさ", page.ms > 3000 || page.bytes > 1_000_000 ? "warn" : "ok",
    `応答 ${(page.ms / 1000).toFixed(1)} 秒（転送を含む）、HTML ${Math.round(page.bytes / 1024)} KB${page.truncated ? "（大きいため途中まで）" : ""}`, "応答が遅い・HTML が重いと、クロールも表示も不利になります。画像や不要なスクリプトを見直してください", 1));

  // ===== SNS 共有（OGP）：URL を LINE・X・Slack などで共有したときの見え方 =====
  const og = f.og;
  add(share("og-title", "共有時のタイトル（og:title）", og["og:title"] ? "ok" : "warn", og["og:title"] ? `「${og["og:title"]}」` : "ありません（title で代用されます）", "<meta property=\"og:title\"> を追加してください", 2));
  add(share("og-description", "共有時の説明文（og:description）", og["og:description"] ? "ok" : "warn", og["og:description"] ? og["og:description"].slice(0, 60) : "ありません（description で代用されます）", "<meta property=\"og:description\"> を追加してください", 1));
  const imgHttps = f.ogImage.startsWith("https://");
  const imgStatus = !f.ogImage ? "fail" : !imgHttps ? "warn" : !ogImageRes ? "warn" : ogImageRes.status === 200 && /^image\//i.test(ogImageRes.contentType) ? "ok" : "fail";
  add(share("og-image", "共有時の画像（og:image）", imgStatus,
    !f.ogImage ? "ありません" : `${f.ogImage}${!imgHttps ? "（https ではありません）" : !ogImageRes ? "（画像を確認できませんでした）" : ogImageRes.status === 200 && /^image\//i.test(ogImageRes.contentType) ? "（表示できます）" : `（画像が取得できません：HTTP ${ogImageRes.status}）`}`,
    !f.ogImage ? "共有時に大きく表示される画像です。1200×630px ほどの画像を https の絶対 URL で指定してください" : "og:image は https の絶対 URL で、実際に表示できる画像にしてください", 3));
  add(share("og-url", "共有時の URL（og:url）", og["og:url"] ? "ok" : "warn", og["og:url"] || "ありません", "<meta property=\"og:url\"> に正規の URL を指定してください", 1));
  add(share("og-type", "ページの種類（og:type）", og["og:type"] ? "ok" : "warn", og["og:type"] || "ありません", "<meta property=\"og:type\" content=\"website\"> など（記事なら article）を追加してください", 1));
  add(share("twitter-card", "X（旧 Twitter）のカード（twitter:card）", og["twitter:card"] ? "ok" : "warn", og["twitter:card"] || "ありません", "<meta name=\"twitter:card\" content=\"summary_large_image\"> を追加すると、X で大きな画像つきで表示されます", 2));
  add(share("og-site", "サイト名（og:site_name）", og["og:site_name"] ? "ok" : "info", og["og:site_name"] || "ありません（任意）", "", 1));

  // ===== AIO：AI 検索・生成 AI に、見つけられ、引用されやすいか =====
  const hasLd = f.jsonld.blocks > 0 && f.jsonld.types.length > 0;
  add(aio("jsonld", "構造化データ（JSON-LD）がある", f.jsonld.invalid ? "warn" : hasLd ? "ok" : f.microdata ? "warn" : "fail",
    f.jsonld.invalid ? `${f.jsonld.invalid} 個が JSON として読めません` : hasLd ? `種類：${f.jsonld.types.slice(0, 6).join("、")}` : f.microdata ? "microdata はありますが、JSON-LD がありません" : "ありません",
    "ページの内容（組織・記事・商品・よくある質問など）を schema.org の JSON-LD で書くと、検索や AI が内容を正確に理解できます", 3));
  const typeSet = new Set(f.jsonld.types);
  const hasOrg = ["Organization", "WebSite", "Person", "LocalBusiness", "Corporation"].some((t) => typeSet.has(t));
  const hasPageType = ["Article", "NewsArticle", "BlogPosting", "FAQPage", "Product", "HowTo", "Event", "Recipe", "SoftwareApplication", "WebPage", "CollectionPage", "Service"].some((t) => typeSet.has(t));
  add(aio("schema-types", "運営者とページの種類が構造化データで分かる", hasOrg && hasPageType ? "ok" : hasLd ? "warn" : "fail",
    `運営者の情報：${hasOrg ? "あり" : "なし"}／ページの種類：${hasPageType ? "あり" : "なし"}`,
    "Organization（運営者）と、Article・Product・FAQPage などそのページに合う種類の両方を書くと、AI が「誰が出した何の情報か」を判断しやすくなります", 2));
  if (f.questionHeadings >= 2 && !typeSet.has("FAQPage")) add(aio("faq-schema", "Q&A 形式の見出しに FAQPage が付いている", "warn", `質問形式の見出しが ${f.questionHeadings} 個ありますが、FAQPage がありません`, "質問と答えを FAQPage の JSON-LD でも書くと、AI の回答に引用されやすくなります", 1));
  const blocked = robots ? AI_BOTS.filter((b) => blocksRoot(robots, b.ua)) : [];
  const blockedSearch = blocked.filter((b) => b.kind === "search");
  const blockedTrain = blocked.filter((b) => b.kind === "train");
  add(aio("ai-crawlers", "AI 検索のクローラーを許可している", blockedSearch.length ? "warn" : "ok",
    !robots ? "robots.txt がないので、すべて許可の扱いです" : blocked.length ? `ブロック中：${blocked.map((b) => `${b.ua}（${b.label}）`).join("、")}` : "AI 関連のクローラーはブロックしていません",
    blockedSearch.length ? `${blockedSearch.map((b) => b.ua).join("・")} は AI 検索・回答に載せる側のクローラーです。ブロックすると引用されにくくなります。意図的か確認してください` : "", 3));
  if (blockedTrain.length && !blockedSearch.length) add(aio("ai-training", "AI の学習用クローラー", "info", `学習側をブロック中：${blockedTrain.map((b) => b.ua).join("、")}（引用には影響しにくい設定です）`, "", 1));
  add(aio("llms-txt", "llms.txt がある（任意）", "info", isText(llmsRes) ? "あります" : "ありません", "", 1));
  add(aio("static-text", "本文が HTML に含まれている（JavaScript なしで読める）", f.textLength >= 500 ? "ok" : f.textLength >= 200 ? "warn" : "fail",
    `最初の HTML に含まれる本文：約 ${f.textLength} 文字`, "AI のクローラーは JavaScript を実行しないことが多く、描画後にしか出ない本文は読まれません。本文をサーバー側で HTML に出力してください（SSR・静的生成）", 3));
  add(aio("answer-first", "冒頭で要点を短く述べている（目安）", f.firstParagraphLength === 0 ? "warn" : f.firstParagraphLength <= 220 ? "ok" : "warn",
    f.firstParagraphLength ? `最初の段落：約 ${f.firstParagraphLength} 文字` : "段落（p）が見つかりません",
    "AI の回答には、冒頭の要点がそのまま使われやすくなります。最初の段落で、結論を 200 文字ほどで述べてください", 2));
  add(aio("scannable", "箇条書き・表で整理されている（目安）", f.textLength < 800 ? "info" : f.lists + f.tables > 0 ? "ok" : "warn",
    `${f.textLength < 800 ? "本文が短いので対象外です。" : ""}箇条書き ${f.lists} 個、表 ${f.tables} 個`, "手順・比較・条件は、箇条書きや表にすると、AI も読者も内容を拾いやすくなります", 1));
  add(aio("faq", "質問形式の見出し（任意）", "info", f.questionHeadings ? `${f.questionHeadings} 個あります（AI が答えとして引用しやすい形です）` : "ありません", "", 1));
  const eeat = [f.hasAuthor, f.hasDate, f.trust.about || f.trust.contact || f.trust.policy].filter(Boolean).length;
  add(aio("eeat", "誰が・いつ書いたかが分かる（信頼性）", eeat === 3 ? "ok" : eeat >= 1 ? "warn" : "fail",
    `著者：${f.hasAuthor ? "あり" : "なし"}／日付：${f.hasDate ? "あり" : "なし"}／運営者・問い合わせ・規約のリンク：${f.trust.about || f.trust.contact || f.trust.policy ? "あり" : "なし"}`,
    "著者名、公開日・更新日、運営者情報へのリンクを載せると、AI も検索も信頼できる情報源として扱いやすくなります", 2));
  add(aio("semantic", "ページの構造がタグで示されている", f.landmarks.main || f.landmarks.article ? "ok" : "warn",
    `main：${f.landmarks.main ? "あり" : "なし"}、article：${f.landmarks.article ? "あり" : "なし"}、nav：${f.landmarks.nav ? "あり" : "なし"}`, "本文を <main> や <article> で囲むと、AI が本文とメニューなどを区別しやすくなります", 1));
  add(aio("breadcrumb", "パンくず（サイト内の位置）がある（任意）", "info", f.breadcrumb ? "あります" : "ありません", "", 1));

  // ===== 点数とまとめ =====
  const groups = [
    { id: "seo", title: "基本の SEO", lead: "検索結果に正しく載るための基本の設定です" },
    { id: "share", title: "SNS 共有（OGP）", lead: "URL を LINE・X・Slack などで共有したときの見え方です" },
    { id: "aio", title: "AIO（AI 検索・生成 AI 向け）", lead: "AI の検索・回答に、見つけられ、引用されやすいかを見ます" },
  ].map((g) => {
    const items = checks.filter((c) => c.group === g.id);
    const scored = items.filter((c) => c.status !== "info");
    const total = scored.reduce((n, c) => n + c.weight, 0);
    const got = scored.reduce((n, c) => n + c.weight * SCORE[c.status], 0);
    const order = { fail: 0, warn: 1, ok: 2, info: 3 };
    return { ...g, score: total ? Math.round((got / total) * 100) : 0, checks: items.sort((a, b) => order[a.status] - order[b.status]) };
  });
  const priorities = checks
    .filter((c) => c.status === "fail" || c.status === "warn")
    .sort((a, b) => (a.status === b.status ? b.weight - a.weight : a.status === "fail" ? -1 : 1))
    .slice(0, 5)
    .map((c) => ({ group: c.group, id: c.id, label: c.label, status: c.status, fix: c.fix }));

  return {
    scores: Object.fromEntries(groups.map((g) => [g.id, g.score])),
    groups,
    priorities,
    preview: {
      title: og["og:title"] || f.title,
      description: og["og:description"] || f.description,
      image: f.ogImage,
      siteName: og["og:site_name"] || u.hostname,
      host: u.hostname,
      fallback: { title: !og["og:title"], description: !og["og:description"] },
    },
    facts: { title: f.title, description: f.description, canonical: f.canonical, lang: f.lang, h1: f.h1s, jsonldTypes: f.jsonld.types, textLength: f.textLength },
  };
}

// SEO・SNS 共有（OGP）・AIO のチェック API（Vercel Serverless Function）
// POST /api/seo-check  body: { url: string }
// 返り値: { url, finalUrl, status, redirects, ms, scores: { seo, share, aio }, groups, priorities, preview, facts }
// 指定された URL のページと、同じサイトの robots.txt・sitemap.xml・llms.txt、og:image を取得して、決まったルールで判定する（AI は使わない）。
// 取得は _safefetch.js の検査を通ったものだけ（社内ネットワークなど、公開されていないアドレスは拒否）。
import { acceptPost, readBody } from "./_shared.js";
import { clientIp, createLimiter } from "./_ratelimit.js";
import { BlockedError, safeFetcher } from "./_safefetch.js";
import { evaluate, extractFacts } from "./_seo.js";

const reason = (err) => (err?.code === "ENOTFOUND" ? "ドメインが見つかりません" : err?.code === "ECONNREFUSED" ? "接続を拒否されました" : String(err?.message ?? err).slice(0, 120));

// 取得できなくても全体は止めない（その項目は「取得できませんでした」の扱い）
const soft = (p) => p.catch(() => null);

export function createHandler(fetcher, { limiter = createLimiter({ max: 20, windowMs: 10 * 60 * 1000 }) } = {}) {
  return async function handler(req, res) {
    if (!acceptPost(req, res)) return;
    const body = readBody(req, res);
    if (!body) return;
    if (!limiter(clientIp(req))) return res.status(429).json({ error: "短い間に多くの URL を調べたため、しばらく待ってからお試しください" });

    const input = String(body.url ?? "").trim().slice(0, 2000);
    if (!input) return res.status(400).json({ error: "URL を入力してください" });

    let page;
    try {
      page = await fetcher.get(input, { maxBytes: 1_500_000, timeoutMs: 8000 });
    } catch (err) {
      if (err instanceof BlockedError) return res.status(422).json({ error: err.message });
      return res.status(502).json({ error: `ページを取得できませんでした（${reason(err)}）` });
    }
    if (!/html|xml/i.test(page.contentType)) {
      return res.status(422).json({ error: `HTML のページではありません（${page.contentType.split(";")[0] || "種類不明"}）` });
    }

    const origin = new URL(page.finalUrl).origin;
    const facts = extractFacts(page.body, page.finalUrl, page.headers);
    const small = { maxBytes: 300_000, timeoutMs: 5000, accept: "text/plain,text/xml,*/*;q=0.5" };
    const [robots, sitemap, llms, ogImage] = await Promise.all([
      soft(fetcher.get(`${origin}/robots.txt`, small)),
      soft(fetcher.get(`${origin}/sitemap.xml`, { ...small, headersOnly: true })),
      soft(fetcher.get(`${origin}/llms.txt`, { ...small, headersOnly: true })),
      facts.ogImage ? soft(fetcher.get(facts.ogImage, { timeoutMs: 5000, headersOnly: true, accept: "image/*,*/*;q=0.5" })) : null,
    ]);

    const result = evaluate({ facts, page, robots, sitemap, llms, ogImage });
    return res.status(200).json({
      url: input,
      finalUrl: page.finalUrl,
      status: page.status,
      redirects: page.redirects,
      ms: page.ms,
      checkedAt: new Date().toISOString(),
      ...result,
    });
  };
}

export default createHandler(safeFetcher);

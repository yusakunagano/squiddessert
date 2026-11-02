// 利用者が指定した URL を、安全に取得する（SEO・AIO チェック用）。
// 誰でも URL を渡せる API は、社内ネットワークやクラウドの内部 API への不正アクセス（SSRF）に悪用されるため、
// 次を守る。
//  - http / https の、ポート 80・443 だけ。ID・パスワード入り（user:pass@）は拒否
//  - 接続先の IP アドレスを、接続の直前に確認し、非公開のアドレス（127.x・10.x・192.168.x・169.254.x など）は拒否
//    （名前解決のあとに別のアドレスへすり替えられても、接続先そのものを検査するので防げる）
//  - リダイレクトは 1 回ずつ同じ検査をして、最大 5 回まで
//  - 取得する大きさと時間に上限（圧縮されたものは、展開後の大きさで数える）
// ファイル名が _ で始まるので Vercel は API として公開しない。
import dns from "node:dns";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import zlib from "node:zlib";

const UA = "SquiddessertSeoCheck/1.0 (+https://github.com/yusakunagano/squiddessert)";

export class BlockedError extends Error {}

// 公開されていない（インターネットから届かない・内部向けの）アドレスなら true。判断できない形式も true（拒否側に倒す）。
export function isPrivateAddress(addr) {
  if (net.isIPv4(addr)) {
    const [a, b, c] = addr.split(".").map(Number);
    return (
      a === 0 || a === 10 || a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 0 && c === 0) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }
  if (net.isIPv6(addr)) {
    const x = addr.toLowerCase();
    if (x === "::" || x === "::1") return true;
    const dotted = x.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/); // IPv4 を埋め込んだ形
    if (dotted) return isPrivateAddress(dotted[1]);
    const hex = x.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
    if (hex) {
      const n1 = parseInt(hex[1], 16), n2 = parseInt(hex[2], 16);
      return isPrivateAddress(`${n1 >> 8}.${n1 & 255}.${n2 >> 8}.${n2 & 255}`);
    }
    return /^f[cd]/.test(x) || /^fe[89ab]/.test(x) || x.startsWith("ff") || x.startsWith("2001:db8") || x.startsWith("64:ff9b:");
  }
  return true;
}

const BLOCKED_NAMES = /(^|\.)(localhost|local|internal|localdomain|lan|home|corp|intranet)$/;

export function createFetcher({ allowHosts = [] } = {}) {
  // allowHosts は自動テスト専用（手元のテスト用サーバーに接続するため）。本番のコードでは渡さない。
  const exempt = new Set(allowHosts);

  function checkUrl(input) {
    let u;
    try { u = new URL(input); } catch { throw new BlockedError("URL の形式が正しくありません"); }
    if (u.protocol !== "http:" && u.protocol !== "https:") throw new BlockedError("http または https の URL だけ調べられます");
    if (u.username || u.password) throw new BlockedError("ID・パスワード入りの URL は調べられません");
    if (!exempt.has(u.hostname) && u.port && u.port !== "80" && u.port !== "443") throw new BlockedError("このポート番号の URL は調べられません");
    const host = u.hostname.replace(/^\[|\]$/g, "").toLowerCase();
    if (!exempt.has(u.hostname)) {
      if (BLOCKED_NAMES.test(host)) throw new BlockedError("公開されていないアドレスは調べられません");
      if (net.isIP(host) && isPrivateAddress(host)) throw new BlockedError("公開されていないアドレスは調べられません");
    }
    return u;
  }

  // 接続の直前に、名前解決の結果をすべて確認する
  function safeLookup(hostname, options, cb) {
    dns.lookup(hostname, { all: true, verbatim: true }, (err, addrs) => {
      if (err) return cb(err);
      if (!addrs.length || (!exempt.has(hostname) && addrs.some((a) => isPrivateAddress(a.address)))) {
        return cb(new BlockedError("公開されていないアドレスは調べられません"));
      }
      if (options?.all) return cb(null, addrs);
      cb(null, addrs[0].address, addrs[0].family);
    });
  }

  function decodeBody(buf, contentType) {
    const head = buf.subarray(0, 4096).toString("latin1");
    const label = (/charset=["']?([\w-]+)/i.exec(contentType ?? "") || /<meta[^>]+charset=["']?([\w-]+)/i.exec(head) || [])[1];
    try { return new TextDecoder(label || "utf-8").decode(buf); } catch { return buf.toString("utf8"); }
  }

  function requestOnce(u, { maxBytes, timeoutMs, accept, headersOnly }) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const done = (fn, v) => { if (!settled) { settled = true; clearTimeout(timer); fn(v); } };
      const lib = u.protocol === "https:" ? https : http;
      const req = lib.request(u, {
        method: "GET", lookup: safeLookup, agent: false,
        headers: { "User-Agent": UA, Accept: accept, "Accept-Language": "ja,en;q=0.8", "Accept-Encoding": "gzip, deflate, br" },
      }, (res) => {
        const { statusCode: status, headers } = res;
        if (headersOnly) { res.destroy(); return done(resolve, { status, headers, body: "", bytes: 0, truncated: false }); }
        const enc = String(headers["content-encoding"] ?? "").toLowerCase();
        let stream = res;
        if (enc === "gzip" || enc === "x-gzip") stream = res.pipe(zlib.createGunzip());
        else if (enc === "deflate") stream = res.pipe(zlib.createInflate());
        else if (enc === "br") stream = res.pipe(zlib.createBrotliDecompress());
        const chunks = [];
        let bytes = 0, truncated = false;
        const finish = () => {
          const buf = Buffer.concat(chunks);
          done(resolve, { status, headers, body: decodeBody(buf, headers["content-type"]), bytes, truncated });
        };
        stream.on("data", (c) => {
          if (truncated) return;
          if (bytes + c.length > maxBytes) { chunks.push(c.subarray(0, maxBytes - bytes)); bytes = maxBytes; truncated = true; res.destroy(); stream.destroy?.(); finish(); return; }
          chunks.push(c); bytes += c.length;
        });
        stream.on("end", finish);
        stream.on("error", (e) => (truncated ? finish() : done(reject, e)));
        res.on("error", (e) => (truncated ? finish() : done(reject, e)));
      });
      const timer = setTimeout(() => req.destroy(new Error("時間内に応答がありませんでした")), timeoutMs);
      req.on("error", (e) => done(reject, e));
      req.end();
    });
  }

  // 取得する。リダイレクトは 1 回ずつ検査して追う。
  async function get(startUrl, { maxBytes = 1_500_000, timeoutMs = 8000, maxRedirects = 5, accept = "text/html,application/xhtml+xml,*/*;q=0.8", headersOnly = false } = {}) {
    const t0 = Date.now();
    const redirects = [];
    let url = startUrl;
    for (let hop = 0; hop <= maxRedirects; hop++) {
      const u = checkUrl(url);
      const left = Math.max(1000, timeoutMs - (Date.now() - t0));
      const res = await requestOnce(u, { maxBytes, timeoutMs: left, accept, headersOnly });
      if ([301, 302, 303, 307, 308].includes(res.status) && res.headers.location) {
        redirects.push({ url: u.href, status: res.status });
        url = new URL(res.headers.location, u).href;
        continue;
      }
      return { ...res, finalUrl: u.href, redirects, ms: Date.now() - t0, contentType: String(res.headers["content-type"] ?? "") };
    }
    throw new Error("リダイレクトが多すぎます（5 回まで）");
  }

  return { get, checkUrl };
}

// 本番用（テスト用の例外は付けない）
export const safeFetcher = createFetcher();

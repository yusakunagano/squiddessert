// 同じ接続元からの呼び出し回数を、おおまかに制限する。
// サーバーが複数起動している場合はそれぞれで数えるので、本格的な対策ではなく、おおまかな歯止め。
// ファイル名が _ で始まるので Vercel は API として公開しない。
export function createLimiter({ max, windowMs }) {
  const hits = new Map(); // key -> 時刻の配列
  return function allow(key) {
    const now = Date.now();
    const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
    if (recent.length >= max) {
      hits.set(key, recent);
      return false;
    }
    recent.push(now);
    hits.set(key, recent);
    if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((t) => now - t < windowMs)) hits.delete(k);
    return true;
  };
}

export const clientIp = (req) => String(req.headers?.["x-forwarded-for"] ?? "").split(",")[0].trim() || "unknown";

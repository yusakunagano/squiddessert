// キャンペーンページの特集一覧と、各リンク先の詳細を事前に読んで JSON に保存する。
// 毎日 1 回 GitHub Actions から実行する（.github/workflows/crawl-campaigns.yml）。手元でも実行できる：
//   GEMINI_API_KEY=... node scripts/crawl-campaigns.mjs
// 保存先は pay-ai-support/data/campaigns.json（環境変数 CAMPAIGN_OUT で変更可）。
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";
import { CAMPAIGN_URL, fetchDetail, fetchIndex, idOf } from "../api/_campaigns.js";

const DEFAULT_OUT = "pay-ai-support/data/campaigns.json";
const CONCURRENCY = 3; // 詳細ページを同時に読む数（読み込みの上限に当たらないよう控えめに）
const DETAIL_MAX_AGE = 3 * 24 * 60 * 60 * 1000; // 詳細をこの期間は読み直さない
const HEARTBEAT = 6 * 24 * 60 * 60 * 1000; // 内容が同じでも、これより古ければ更新日だけ新しくする

async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return null;
  }
}

// 同時に読む数を絞りながら、全部に fn を実行する
async function pool(items, size, fn) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        results[i] = await fn(items[i], i);
      }
    }),
  );
  return results;
}

// 内容が変わったかどうかの比較用（読んだ時刻は含めない）
const fingerprint = (campaigns) => JSON.stringify(campaigns.map(({ detailAt, ...rest }) => rest));

export async function run({ out = process.env.CAMPAIGN_OUT || DEFAULT_OUT, now = Date.now() } = {}) {
  const previous = await readJson(out);
  const prevById = new Map((previous?.campaigns ?? []).map((c) => [c.id, c]));

  const index = await fetchIndex();
  console.log(`一覧: ${index.status}（${(index.ms / 1000).toFixed(1)}秒）`);
  if (!index.list) {
    // 読めなかったときは、前回の保存データを残したまま失敗にする（Actions の失敗通知で気づける）
    throw new Error(`特集一覧を読み取れませんでした: ${index.status}`);
  }

  const lines = [];
  const campaigns = await pool(index.list, CONCURRENCY, async (c) => {
    const item = { id: idOf(c), ...c, detail: null, detailAt: null };
    const prev = prevById.get(item.id);
    const fresh = prev?.detail && prev.detailAt && now - Date.parse(prev.detailAt) < DETAIL_MAX_AGE && prev.period === c.period;
    let note;
    if (!c.url) {
      note = "リンクなし";
    } else if (fresh) {
      Object.assign(item, { detail: prev.detail, detailAt: prev.detailAt });
      note = "前回の詳細を利用";
    } else {
      const d = await fetchDetail(c.url);
      if (d.detail) {
        Object.assign(item, { detail: d.detail, detailAt: new Date(now).toISOString() });
        note = "詳細を読み取り";
      } else if (prev?.detail) {
        Object.assign(item, { detail: prev.detail, detailAt: prev.detailAt });
        note = `読めず前回の詳細を維持（${d.status}）`;
      } else {
        note = `詳細なし（${d.status}）`;
      }
    }
    lines.push(`- [${c.kind}] ${c.title}｜エントリー:${c.entry}｜期間:${c.period} → ${note}`);
    return item;
  });

  const stats = {
    total: campaigns.length,
    withUrl: campaigns.filter((c) => c.url).length,
    withDetail: campaigns.filter((c) => c.detail).length,
  };
  const summary = `特集 ${stats.total} 件（リンクあり ${stats.withUrl} 件、詳細あり ${stats.withDetail} 件）`;
  console.log(summary);
  lines.forEach((l) => console.log(l));

  const unchanged = previous && fingerprint(previous.campaigns ?? []) === fingerprint(campaigns);
  const recent = previous?.updatedAt && now - Date.parse(previous.updatedAt) < HEARTBEAT;
  let written = false;
  if (unchanged && recent) {
    console.log("内容に変更がないため、ファイルは更新しません");
  } else {
    await mkdir(dirname(out), { recursive: true });
    const data = { updatedAt: new Date(now).toISOString(), sourceUrl: CAMPAIGN_URL, stats, campaigns };
    await writeFile(out, JSON.stringify(data, null, 2) + "\n");
    written = true;
    console.log(`${out} を更新しました`);
  }

  if (process.env.GITHUB_STEP_SUMMARY) {
    await appendFile(process.env.GITHUB_STEP_SUMMARY, `### キャンペーンの事前読み取り\n${summary}\n\n${lines.join("\n")}\n`);
  }
  return { stats, written };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}

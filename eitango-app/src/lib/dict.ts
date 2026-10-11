import type { Example } from "../types";

// APIキーなしでも使える無料サービスによる「自動入力」。
// - 例文: Free Dictionary API (https://dictionaryapi.dev)
// - 翻訳: MyMemory Translation API (https://mymemory.translated.net)

export async function freeTranslate(text: string): Promise<string> {
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=en|ja`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("翻訳サービスに接続できませんでした。");
  const data = (await res.json()) as { responseData?: { translatedText?: string } };
  return data.responseData?.translatedText?.trim() ?? "";
}

export async function freeLookup(word: string): Promise<{ meaning: string; examples: Example[] }> {
  const [meaning, englishExamples] = await Promise.all([
    freeTranslate(word).catch(() => ""),
    fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word.toLowerCase())}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((entries: { meanings?: { definitions?: { example?: string }[] }[] }[]) =>
        entries
          .flatMap((e) => e.meanings ?? [])
          .flatMap((m) => m.definitions ?? [])
          .map((d) => d.example)
          .filter((x): x is string => !!x),
      )
      .catch(() => [] as string[]),
  ]);
  const picked = [...new Set(englishExamples)].slice(0, 3);
  const examples = await Promise.all(
    picked.map(async (en) => ({ en, ja: await freeTranslate(en).catch(() => "") })),
  );
  return { meaning, examples };
}

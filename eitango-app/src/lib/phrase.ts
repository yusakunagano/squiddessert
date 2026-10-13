// 単語・熟語を例文の中から探すための共通処理。
// 熟語は「take part in」「provide ~ with」「cannot help ~ing」のように書かれていて、
// ~ は目的語などが入る場所を表す。

export const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** テストで書く答え（~ の部分を除いたもの） */
export const answerOf = (word: string) =>
  word
    .replace(/~\w*/g, " ")
    .replace(/\s+/g, " ")
    .trim();

// 不規則変化（過去形・過去分詞・複数形など）
const IRREGULAR: Record<string, string[]> = {
  bear: ["born", "bore"], begin: ["began", "begun"], bend: ["bent"], break: ["broke", "broken"],
  bring: ["brought"], buy: ["bought"], catch: ["caught"], choose: ["chose", "chosen"], come: ["came"],
  dig: ["dug"], drink: ["drank", "drunk"], drive: ["drove", "driven"], eat: ["ate", "eaten"],
  fall: ["fell", "fallen"], feel: ["felt"], find: ["found"], fly: ["flew", "flown"],
  forget: ["forgot", "forgotten"], forgive: ["forgave", "forgiven"], freeze: ["froze", "frozen"],
  get: ["got", "gotten"], give: ["gave", "given"], go: ["went", "gone"], grow: ["grew", "grown"],
  hang: ["hung"], hide: ["hid", "hidden"], hold: ["held"], keep: ["kept"], kneel: ["knelt"],
  know: ["knew", "known"], lead: ["led"], leave: ["left"], lend: ["lent"], lose: ["lost"],
  make: ["made"], overcome: ["overcame"], pay: ["paid"], ride: ["rode"], rise: ["rose", "risen"],
  run: ["ran"], say: ["said"], see: ["saw", "seen"], seek: ["sought"], sell: ["sold"], send: ["sent"],
  shake: ["shook", "shaken"], shelf: ["shelves"], shoot: ["shot"], sink: ["sank", "sunk"], sit: ["sat"],
  sleep: ["slept"], speak: ["spoke", "spoken"], spend: ["spent"], stand: ["stood"],
  steal: ["stole", "stolen"], strike: ["struck"], swear: ["swore", "sworn"], sweep: ["swept"],
  swim: ["swam"], swing: ["swung"], take: ["took", "taken"], teach: ["taught"], tear: ["tore", "torn"],
  tell: ["told"], think: ["thought"], throw: ["threw", "thrown"], understand: ["understood"],
  wake: ["woke", "woken"], wear: ["wore", "worn"], win: ["won"], withdraw: ["withdrew", "withdrawn"],
  write: ["wrote", "written"],
};

// 活用しない短い語（前置詞など）は完全一致で探す
const FIXED = new Set(["a", "an", "the", "of", "to", "in", "on", "at", "by", "up", "as", "for", "out", "off", "all", "and", "but", "or", "so", "no", "not", "be", "it", "is", "with", "from", "into", "than", "that", "far"]);

/** 1語ぶんの正規表現（活用形もざっくり含める） */
function tokenRe(token: string): string {
  const t = token.toLowerCase();
  const alts = (IRREGULAR[t] ?? []).map(escapeRe);
  let base: string;
  if (FIXED.has(t) || t.length <= 2) base = escapeRe(t);
  else {
    // study → stud(ies/ied), make → mak(ing), stop → stop(ped)
    const stem = t.length >= 4 ? t.replace(/(e|y)$/, "") : t;
    base = `${escapeRe(stem)}[a-z]*`;
  }
  return alts.length ? `(?:${[base, ...alts].join("|")})` : base;
}

/** 熟語全体にマッチする正規表現。キーワード部分だけをグループにする */
function phraseRegex(tokens: string[]): RegExp | null {
  const parts: string[] = [];
  for (const tok of tokens) {
    if (tok === "~" || tok === "a" || tok === "an") parts.push(`(?:[\\w',]+\\s+){0,4}?`);
    else if (tok === "one's") parts.push(`(?:my|your|his|her|its|our|their|one's)`);
    else if (tok === "oneself") parts.push(`(?:myself|yourself|himself|herself|itself|ourselves|themselves|oneself)`);
    else if (tok.startsWith("~")) parts.push(`(?:\\w+${escapeRe(tok.slice(1))})`);
    else parts.push(`(${tokenRe(tok)})`);
  }
  if (!parts.some((p) => p.startsWith("(") && !p.startsWith("(?:"))) return null;
  // 区切りの空白（~ の後ろは ~ 側で空白を食べるので不要）
  let src = "";
  tokens.forEach((tok, i) => {
    src += parts[i];
    if (i < tokens.length - 1 && tok !== "~" && tok !== "a" && tok !== "an") src += "\\s+";
  });
  return new RegExp(`\\b${src}\\b`, "gi");
}

/**
 * 例文の中の見出し語の位置を返す（キーワード部分の [開始, 終了] の配列）。
 * 熟語の最初の動詞が不規則変化（take → took など）で見つからないときは、残りの部分だけで探す。
 */
export function findInSentence(sentence: string, word: string): [number, number][] {
  const tokens = word.trim().split(/\s+/);
  const attempts = [tokens];
  if (tokens.length >= 2 && !tokens[0].startsWith("~")) attempts.push(tokens.slice(1));
  for (const toks of attempts) {
    const re = phraseRegex(toks);
    if (!re) continue;
    const ranges: [number, number][] = [];
    for (const m of sentence.matchAll(re)) {
      // マッチ全体の中で、グループ（キーワード）の位置を前から順に探す
      let cursor = m.index!;
      for (const g of m.slice(1)) {
        if (!g) continue;
        const at = sentence.indexOf(g, cursor);
        ranges.push([at, at + g.length]);
        cursor = at + g.length;
      }
    }
    if (ranges.length) return ranges;
  }
  return [];
}

/** キーワード部分を ＿ にした例文（テスト用） */
export function maskSentence(sentence: string, word: string): string {
  const ranges = findInSentence(sentence, word);
  let out = "";
  let last = 0;
  for (const [s, e] of ranges) {
    out += sentence.slice(last, s) + "＿".repeat(Math.min(e - s, 8));
    last = e;
  }
  return out + sentence.slice(last);
}

/** キーワード部分で文を区切る（奇数番目がキーワード） */
export function splitSentence(sentence: string, word: string): string[] {
  const ranges = findInSentence(sentence, word);
  const parts: string[] = [];
  let last = 0;
  for (const [s, e] of ranges) {
    parts.push(sentence.slice(last, s), sentence.slice(s, e));
    last = e;
  }
  parts.push(sentence.slice(last));
  return parts;
}

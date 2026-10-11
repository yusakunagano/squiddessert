import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { getState } from "../store";
import type { ChatMessage, Example } from "../types";

// Claude API をブラウザから直接呼び出す。
// APIキーは「設定」画面で入力し、この端末の localStorage にだけ保存される。

export const MODEL_OPTIONS = [
  { id: "claude-opus-5-5", label: "Claude Opus 5.5（高性能・標準）" },
  { id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5（速い）" },
  { id: "claude-haiku-5-5", label: "Claude Haiku 5.5（最速・低コスト）" },
];

// サーバー側フォールバック（安全分類器が誤って拒否したときに別モデルで再実行）に対応したモデル
const FALLBACK_MODELS = new Set(["claude-opus-5-5", "claude-sonnet-5-5"]);

export const hasAI = () => getState().settings.apiKey.trim().length > 0;

function client() {
  const { apiKey } = getState().settings;
  if (!apiKey.trim()) throw new Error("AI機能を使うには「設定」でAPIキーを入力してください。");
  return new Anthropic({ apiKey: apiKey.trim(), dangerouslyAllowBrowser: true });
}

function baseParams() {
  const model = getState().settings.model;
  return FALLBACK_MODELS.has(model)
    ? { model, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const }
    : { model };
}

function textOf(content: { type: string }[]): string {
  return content
    .filter((b): b is { type: "text"; text: string } => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
}

function checkRefusal(stopReason: string | null) {
  if (stopReason === "refusal") throw new Error("AIが応答できませんでした。言い方を変えてもう一度試してください。");
}

/** 手書き画像 (PNG の base64) から書かれた英字を読み取る */
export async function recognizeHandwriting(pngBase64: string): Promise<string> {
  const res = await client().beta.messages.create({
    ...baseParams(),
    max_tokens: 2000,
    output_config: { effort: "low" },
    system:
      "You transcribe handwritten English letters for a spelling test. " +
      "Report exactly the letters the student wrote, even if the spelling is wrong. " +
      "Never correct or guess the intended word. If a letter is unclear, pick the closest letter shape. " +
      "Reply with only the letters (no quotes, no explanation). If nothing is written, reply with an empty line.",
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: "image/png", data: pngBase64 } },
          { type: "text", text: "What letters are handwritten in this image?" },
        ],
      },
    ],
  });
  checkRefusal(res.stop_reason);
  return textOf(res.content).split("\n")[0].replace(/[^A-Za-z' -]/g, "").trim();
}

const WordInfoSchema = z.object({
  meaning: z.string().describe("日本語の意味（主なものを簡潔に。複数ある場合は読点で区切る）"),
  examples: z
    .array(z.object({ en: z.string(), ja: z.string() }))
    .describe("自然でやさしい英語の例文と、その日本語訳"),
});

/** 単語の意味と例文を AI に作ってもらう */
export async function generateWordInfo(
  word: string,
  opts: { count?: number; existing?: Example[]; level?: string } = {},
): Promise<{ meaning: string; examples: Example[] }> {
  const count = opts.count ?? 3;
  const existing = opts.existing?.length
    ? `\nすでにある例文（これとは違う場面・用法の例文にしてください）:\n${opts.existing.map((e) => "- " + e.en).join("\n")}`
    : "";
  const res = await client().beta.messages.parse({
    ...baseParams(),
    max_tokens: 4000,
    output_config: { effort: "low", format: betaZodOutputFormat(WordInfoSchema) },
    messages: [
      {
        role: "user",
        content:
          `英単語「${word}」について、日本人の英語学習者${opts.level ? `（${opts.level}レベル）` : ""}向けに、` +
          `日本語の意味と、その単語を使った例文を${count}個作ってください。` +
          `例文は短めで、さまざまな場面・用法がわかるものにしてください。${existing}`,
      },
    ],
  });
  checkRefusal(res.stop_reason);
  if (!res.parsed_output) throw new Error("AIの応答を読み取れませんでした。");
  return res.parsed_output;
}

/** 英文を日本語に訳す */
export async function translateToJapanese(text: string): Promise<string> {
  const res = await client().beta.messages.create({
    ...baseParams(),
    max_tokens: 2000,
    output_config: { effort: "low" },
    messages: [{ role: "user", content: `次の英文を自然な日本語に訳してください。訳文だけを答えてください。\n\n${text}` }],
  });
  checkRefusal(res.stop_reason);
  return textOf(res.content);
}

export interface FocusWord {
  word: string;
  meaning: string;
}

function chatSystemPrompt(focus: FocusWord[]): string {
  const list = focus.length
    ? focus.map((f) => `- ${f.word}（${f.meaning}）`).join("\n")
    : "（まだ再テスト項目はありません。日常的な話題で会話してください）";
  return `You are a friendly, patient English conversation partner for a Japanese learner who is studying for the Eiken (英検) test.

The learner is reviewing these words that they got wrong on a spelling test (their "retest" words):
${list}

How to run the conversation:
- Keep the conversation centered on the retest words. Naturally use one or two of them in each of your messages, and create situations or ask questions that invite the learner to use them too.
- Write in simple, natural English that matches the level of the words. Keep each message short (2-4 sentences) and end with a question so the conversation continues.
- When you use a retest word, wrap it in double asterisks like **word** so the app can highlight it.
- If the learner makes an English mistake, gently show a corrected version first (start that line with "✏️"), then continue the conversation.
- If the learner writes in Japanese or seems stuck, help them in Japanese briefly, suggest an English sentence they could say, then continue in English.
- After your English message, add one line starting with "🇯🇵" containing a short Japanese translation of your message.`;
}

/** 再テスト単語を中心にした英会話。テキストを少しずつ onText に渡す */
export async function streamChat(
  history: ChatMessage[],
  focus: FocusWord[],
  onText: (fullText: string) => void,
): Promise<string> {
  const messages: Anthropic.Beta.BetaMessageParam[] = history.map((m) => ({ role: m.role, content: m.text }));
  if (messages.length === 0 || messages[0].role !== "user") {
    messages.unshift({ role: "user", content: "Hi! Let's start our conversation practice." });
  }
  const stream = client().beta.messages.stream({
    ...baseParams(),
    max_tokens: 8000,
    output_config: { effort: "low" },
    system: chatSystemPrompt(focus),
    messages,
  });
  let full = "";
  for await (const event of stream) {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
      full += event.delta.text;
      onText(full);
    }
  }
  const final = await stream.finalMessage();
  checkRefusal(final.stop_reason);
  return full.trim();
}

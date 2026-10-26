import { getState } from "../store";

// Google Gemini API（REST）をブラウザから直接呼び出す。
// Google AI Studio で無料のAPIキーを作れる（回数制限あり）。

export const GEMINI_MODEL_OPTIONS = [
  { id: "gemini-flash-latest", label: "Gemini Flash（無料枠向け・おすすめ）" },
  { id: "gemini-flash-lite-latest", label: "Gemini Flash-Lite（最速・回数制限がゆるめ）" },
  { id: "gemini-pro-latest", label: "Gemini Pro（高性能・無料枠は回数が少ない）" },
];

const BASE = "https://generativelanguage.googleapis.com/v1beta/models";

type Part = { text: string } | { inline_data: { mime_type: string; data: string } };
export interface GeminiContent {
  role: "user" | "model";
  parts: Part[];
}

interface Request {
  contents: GeminiContent[];
  system?: string;
  json?: object; // responseSchema
  /** 指定するとこのモデルを使う（設定のモデルより優先） */
  model?: string;
  /** true: 推論（thinking）を切り、短い出力だけにする高速モード */
  fast?: boolean;
}

function key() {
  const k = getState().settings.geminiKey.trim();
  if (!k) throw new Error("AI機能を使うには「設定」でGeminiのAPIキーを入力してください。");
  return k;
}

// 推論を切る指定はモデルの世代で書き方が違い、合わないと 400（invalid argument）になる。
// 順に試して、通った書き方を覚えておく。
const THINKING_OFF: (object | null)[] = [{ thinkingBudget: 0 }, { thinkingLevel: "minimal" }, null];
let thinkingOffIndex = 0;

function body(req: Request, thinkingOff: object | null = THINKING_OFF[thinkingOffIndex]) {
  return JSON.stringify({
    contents: req.contents,
    ...(req.system ? { systemInstruction: { parts: [{ text: req.system }] } } : {}),
    ...(req.json ? { generationConfig: { responseMimeType: "application/json", responseSchema: req.json } } : {}),
    ...(req.fast
      ? { generationConfig: { temperature: 0, ...(thinkingOff ? { thinkingConfig: thinkingOff } : {}) } }
      : {}),
  });
}

async function errorOf(res: Response, model: string): Promise<Error> {
  let msg = "";
  try {
    msg = ((await res.json()) as { error?: { message?: string } }).error?.message ?? "";
  } catch {
    /* 本文なし */
  }
  if (res.status === 429) return new Error("Geminiの無料枠の回数制限に達しました。少し時間をおいてから試してください。");
  if (res.status === 400 && /API key/i.test(msg)) return new Error("GeminiのAPIキーが正しくありません。「設定」を確認してください。");
  return new Error(`Geminiでエラーが起きました（${res.status}・${model}）${msg ? "：" + msg : ""}`);
}

interface Candidate {
  content?: { parts?: { text?: string }[] };
  finishReason?: string;
}

function textOf(data: { candidates?: Candidate[]; promptFeedback?: { blockReason?: string } }): string {
  if (data.promptFeedback?.blockReason) throw new Error("AIが応答できませんでした。言い方を変えてもう一度試してください。");
  const c = data.candidates?.[0];
  if (c?.finishReason === "SAFETY") throw new Error("AIが応答できませんでした。言い方を変えてもう一度試してください。");
  return (c?.content?.parts ?? []).map((p) => p.text ?? "").join("");
}

export async function geminiGenerate(req: Request): Promise<string> {
  const model = req.model ?? getState().settings.geminiModel;
  const post = (b: string) =>
    fetch(`${BASE}/${model}:generateContent?key=${encodeURIComponent(key())}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: b,
    });
  let res = await post(body(req));
  // 高速モードで 400 のときは、推論オフの別の書き方で試し直す
  while (req.fast && res.status === 400 && thinkingOffIndex < THINKING_OFF.length - 1) {
    thinkingOffIndex++;
    res = await post(body(req));
  }
  if (!res.ok) throw await errorOf(res, model);
  return textOf(await res.json()).trim();
}

/** ストリーミングで生成し、途中経過を onText に渡す */
export async function geminiStream(req: Request, onText: (full: string) => void): Promise<string> {
  const model = getState().settings.geminiModel;
  const res = await fetch(`${BASE}/${model}:streamGenerateContent?alt=sse&key=${encodeURIComponent(key())}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body(req),
  });
  if (!res.ok || !res.body) throw await errorOf(res, model);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let full = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      full += textOf(JSON.parse(line.slice(5)));
      onText(full);
    }
  }
  return full.trim();
}

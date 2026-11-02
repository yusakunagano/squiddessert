// 永野AI：Gemini Flash と Gemma に同じ質問を投げて、答えを並べて比べる API（Vercel Serverless Function）
// POST /api/nagano-compare  body: { persona: string, question: string, history?: { [id]: [{ role: "user" | "assistant", text }] } }
//   history はモデルごとの、これまでの会話（そのモデル自身の答えが入る）。
//   → { results: [{ id, label, model, reply, ms, error }] }
// POST /api/nagano-compare  body: { action: "models" }  → { models: string[] }（Gemma / Flash のモデル名の確認用）
// 永野さんの情報（persona）はリポジトリに置かず、ページから毎回送ってもらう。
import { ApiError } from "@google/genai";
import { acceptPost, ai, readBody, sendAiError } from "./_shared.js";

// 環境変数 FLASH_MODEL / GEMMA_MODEL で差し替えられる。Gemma の正確な名前は action: "models" で確認する。
const SIDES = [
  { id: "gemini", label: "Gemini Flash", model: process.env.FLASH_MODEL || "gemini-flash-latest" },
  { id: "gemma", label: "Gemma 4", model: process.env.GEMMA_MODEL || "gemma-4-31b-it" },
];

const MAX_PERSONA = 8000;
const MAX_QUESTION = 500;
const MAX_REPLY = 1500;
const MAX_TURNS = 10; // 履歴に含める質問の数

// Gemma は systemInstruction に対応していないことがあるので、どちらのモデルにも同じ 1 通のメッセージで渡す（公平な比較にもなる）。
function buildFirstMessage(persona, question) {
  return `あなたは「永野優作」本人になりきって、質問に答えます。
<persona> は永野優作についての情報（口調・価値観・過去の回答例など）です。口調や考え方をできるだけ再現してください。

- 一人称で、永野本人が話すように答える。AI であることや役作りをしていることには触れない。
- <persona> に書かれていないことは、書かれている人柄から自然に推測して答える。事実を細かく作り込まない。
- 長さは 100〜300 文字を目安にする。

<persona>
${persona || "（情報なし。自然な日本語で答えてください）"}
</persona>

質問: ${question}`;
}

// そのモデルの履歴を整える（user から始まり user で終わる交互の会話にする）
function cleanHistory(raw) {
  const list = (Array.isArray(raw) ? raw : [])
    .slice(-2 * MAX_TURNS)
    .map((m) => ({
      role: m?.role === "assistant" ? "model" : "user",
      text: String(m?.text ?? "").slice(0, m?.role === "assistant" ? MAX_REPLY : MAX_QUESTION).trim(),
    }))
    .filter((m) => m.text);
  while (list.length && list[0].role !== "user") list.shift();
  const alternating = list.filter((m, i) => i === 0 || m.role !== list[i - 1].role);
  // 今回の質問が続くので、履歴はモデルの答えで終わらせる
  while (alternating.length && alternating.at(-1).role !== "model") alternating.pop();
  return alternating;
}

// Google 側の 500 台は、生成設定（温度・最大トークン）を外して 1 回だけやり直す。
// 一時的な不調なのか、設定がモデルに合っていないのかを切り分けるため。
async function generate(params) {
  try {
    return await ai.models.generateContent(params);
  } catch (err) {
    if (err instanceof ApiError && err.status >= 500) {
      const { config, ...rest } = params;
      return ai.models.generateContent(rest);
    }
    throw err;
  }
}

// ApiError の message は JSON 文字列のことがあるので、中の message だけ取り出す（API キーは含まれない）
function upstreamMessage(err) {
  try {
    return String(JSON.parse(err.message)?.error?.message ?? err.message).slice(0, 300);
  } catch {
    return String(err.message ?? "").slice(0, 300);
  }
}

async function ask(side, persona, history, question) {
  const started = Date.now();
  const base = { id: side.id, label: side.label, model: side.model };
  try {
    // 永野さんの情報は会話の最初の発言にだけ付ける。以降は履歴＋今回の質問をそのまま渡す。
    const turns = [...history, { role: "user", text: question }];
    turns[0] = { ...turns[0], text: buildFirstMessage(persona, turns[0].text) };
    const response = await generate({
      model: side.model,
      contents: turns.map((m) => ({ role: m.role, parts: [{ text: m.text }] })),
      config: { temperature: 0.7, maxOutputTokens: 2048 },
    });
    const reply = response.text?.trim();
    if (!reply) return { ...base, ms: Date.now() - started, error: "回答が空でした（安全フィルタの可能性）" };
    return { ...base, ms: Date.now() - started, reply };
  } catch (err) {
    const status = err instanceof ApiError ? err.status : undefined;
    console.error("nagano-compare", side.model, status, err.message);
    const error =
      status === 404 ? `モデル「${side.model}」が見つかりません`
      : status === 429 ? "混み合っています（無料枠の上限の可能性）"
      : `呼び出しに失敗しました${status ? `（${status}）` : ""}`;
    return { ...base, ms: Date.now() - started, error, status, detail: upstreamMessage(err) };
  }
}

async function listModels() {
  const names = [];
  for await (const m of await ai.models.list({ config: { pageSize: 100 } })) {
    const name = String(m.name ?? "").replace(/^models\//, "");
    if (/gemma|flash/i.test(name)) names.push(name);
  }
  return names;
}

export default async function handler(req, res) {
  if (!acceptPost(req, res)) return;
  const body = readBody(req, res);
  if (!body) return;

  try {
    if (body.action === "models") {
      return res.status(200).json({ models: await listModels() });
    }

    const persona = String(body.persona ?? "").slice(0, MAX_PERSONA).trim();
    const question = String(body.question ?? "").slice(0, MAX_QUESTION).trim();
    if (!question) return res.status(400).json({ error: "質問を入力してください" });

    const histories = body.history && typeof body.history === "object" ? body.history : {};
    const results = await Promise.all(
      SIDES.map((side) => ask(side, persona, cleanHistory(histories[side.id]), question)),
    );
    return res.status(200).json({ results });
  } catch (err) {
    return sendAiError(res, err);
  }
}

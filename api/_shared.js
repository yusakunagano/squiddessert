// api/ の関数で共通に使うもの。ファイル名が _ で始まるので Vercel は API として公開しない。
import { ApiError, GoogleGenAI } from "@google/genai";

// 環境変数 GEMINI_API_KEY が必要です（ブラウザには公開されません）。
export const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
export const MODEL = "gemini-flash-lite-latest";

// GitHub Pages に置いたページからの呼び出しを許可する
const ALLOWED_ORIGINS = ["https://yusakunagano.github.io"];

// CORS ヘッダーを付け、OPTIONS と POST 以外はここで返す。処理を続けてよければ true。
export function acceptPost(req, res) {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Access-Control-Max-Age", "86400");
  }
  res.setHeader("Vary", "Origin");
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return false;
  }
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, OPTIONS");
    res.status(405).json({ error: "POST のみ対応しています" });
    return false;
  }
  return true;
}

// JSON の本文を読む。壊れていれば 400 を返して null。
export function readBody(req, res) {
  const body = req.body ?? {};
  if (typeof body !== "string") return body;
  try {
    return JSON.parse(body || "{}");
  } catch {
    res.status(400).json({ error: "リクエストの形式が正しくありません" });
    return null;
  }
}

export function sendAiError(res, err) {
  if (err instanceof ApiError) {
    if (err.status === 429) {
      return res.status(429).json({ error: "混み合っています。少し待ってからお試しください。" });
    }
    console.error("Gemini API error", err.status, err.message);
    return res.status(502).json({ error: "AI の呼び出しに失敗しました" });
  }
  if (err instanceof SyntaxError) {
    return res.status(502).json({ error: "AI の返事をうまく読み取れませんでした。もう一度お試しください。" });
  }
  console.error(err);
  return res.status(500).json({ error: "サーバーエラーが発生しました" });
}

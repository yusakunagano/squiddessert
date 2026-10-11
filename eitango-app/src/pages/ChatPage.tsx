import { useEffect, useMemo, useRef, useState } from "react";
import { hasAI, streamChat, type FocusWord } from "../lib/ai";
import { createRecognition, speak } from "../lib/speech";
import { actions, useAppState } from "../store";
import type { ChatMessage } from "../types";
import { escapeRe } from "../components/WordCard";

const usedIn = (text: string, word: string) => {
  const stem = word.toLowerCase().replace(/e$/, "");
  return new RegExp(`\\b${escapeRe(stem)}[a-z]*`, "i").test(text);
};

/** 再テスト項目の単語を中心に、AIと英会話する */
export function ChatPage({ onOpenSettings }: { onOpenSettings: () => void }) {
  const chat = useAppState((s) => s.chat);
  const misses = useAppState((s) => s.misses);
  const focus: FocusWord[] = useMemo(
    () => misses.filter((m) => m.retest).map((m) => ({ word: m.word, meaning: m.meaning })),
    [misses],
  );
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [openChip, setOpenChip] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat, streaming]);

  const usedWords = new Set(
    focus.filter((f) => chat.some((m) => m.role === "user" && usedIn(m.text, f.word))).map((f) => f.word),
  );

  const send = async (text: string | null) => {
    if (streaming !== null) return;
    setError("");
    const history: ChatMessage[] = text ? [...chat, { role: "user", text }] : chat;
    actions.setChat(history);
    setInput("");
    setStreaming("");
    try {
      const reply = await streamChat(history, focus, setStreaming);
      actions.setChat([...history, { role: "assistant", text: reply }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setStreaming(null);
    }
  };

  const startOver = () => {
    if (chat.length && !confirm("会話をリセットして新しく始めますか？")) return;
    actions.setChat([]);
    void send(null);
  };

  const mic = () => {
    const r = createRecognition();
    if (!r) return alert("このブラウザは音声入力に対応していません（Chrome / Safari で使えます）。");
    r.onresult = (e) => setInput((v) => (v ? v + " " : "") + e.results[0][0].transcript);
    r.onerror = () => setListening(false);
    r.onend = () => setListening(false);
    setListening(true);
    r.start();
  };

  if (!hasAI()) {
    return (
      <div className="page">
        <div className="card">
          <h2>💬 AIと英会話</h2>
          <p>AIとの会話には Claude の APIキーが必要です。「設定」画面で入力してください。</p>
          <button className="btn primary" onClick={onOpenSettings}>
            設定を開く
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="page chat-page">
      <div className="card focus">
        <div className="row">
          <b className="grow">🎯 今日の練習単語（再テスト項目）</b>
          <button className="btn small" onClick={startOver}>
            ↻ 新しい会話
          </button>
        </div>
        {focus.length === 0 ? (
          <p className="muted small">再テスト項目がないので、自由な話題で会話します。「復習」タブで ★ をつけると、その単語を中心に会話できます。</p>
        ) : (
          <>
            <div className="chips">
              {focus.map((f) => (
                <button
                  key={f.word}
                  className={`chip ${usedWords.has(f.word) ? "used" : ""}`}
                  onClick={() => {
                    setOpenChip(openChip === f.word ? null : f.word);
                    speak(f.word);
                  }}
                >
                  {usedWords.has(f.word) && "✅ "}
                  {f.word}
                  {openChip === f.word && <span className="chip-meaning">：{f.meaning}</span>}
                </button>
              ))}
            </div>
            <p className="muted small">
              会話の中で使えた単語には ✅ がつきます（{usedWords.size}/{focus.length}）
            </p>
          </>
        )}
      </div>

      <div className="messages">
        {chat.length === 0 && streaming === null && (
          <div className="center">
            <button className="btn primary big" onClick={() => send(null)}>
              会話をはじめる
            </button>
          </div>
        )}
        {chat.map((m, i) => (
          <Bubble key={i} message={m} />
        ))}
        {streaming !== null && <Bubble message={{ role: "assistant", text: streaming || "…" }} />}
        <div ref={bottom} />
      </div>

      {error && <p className="error">{error}</p>}

      <form
        className="composer"
        onSubmit={(e) => {
          e.preventDefault();
          if (input.trim()) void send(input.trim());
        }}
      >
        <button type="button" className={`icon-btn ${listening ? "rec" : ""}`} onClick={mic} aria-label="音声入力">
          🎤
        </button>
        <input
          className="input grow"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="英語で返事をしてみよう（日本語でもOK）"
        />
        <button className="btn primary" disabled={!input.trim() || streaming !== null}>
          送信
        </button>
      </form>
    </div>
  );
}

function Bubble({ message }: { message: ChatMessage }) {
  const [showJa, setShowJa] = useState(false);
  if (message.role === "user") return <div className="bubble user">{message.text}</div>;

  const lines = message.text.split("\n");
  const ja = lines.filter((l) => l.startsWith("🇯🇵")).map((l) => l.replace(/^🇯🇵\s*/, ""));
  const body = lines.filter((l) => !l.startsWith("🇯🇵"));
  const english = body.filter((l) => !l.startsWith("✏️")).join(" ").replace(/\*\*/g, "");

  return (
    <div className="bubble ai">
      {body.map((l, i) =>
        l.trim() === "" ? null : (
          <p key={i} className={l.startsWith("✏️") ? "correction" : ""}>
            {renderBold(l)}
          </p>
        ),
      )}
      <div className="bubble-tools">
        <button className="icon-btn small" onClick={() => speak(english)} aria-label="読み上げ">
          🔊
        </button>
        {ja.length > 0 && (
          <button className="btn tiny" onClick={() => setShowJa((v) => !v)}>
            {showJa ? "訳を隠す" : "日本語訳"}
          </button>
        )}
      </div>
      {showJa && <p className="example-ja">{ja.join(" ")}</p>}
    </div>
  );
}

function renderBold(text: string) {
  return text.split(/\*\*(.+?)\*\*/g).map((p, i) => (i % 2 === 1 ? <mark key={i}>{p}</mark> : p));
}

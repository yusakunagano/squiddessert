import { useState } from "react";
import type { Word } from "../types";
import { gradeLabel } from "../types";
import { speak } from "../lib/speech";

interface Props {
  word: Word;
  actions?: React.ReactNode;
}

/** 単語カード: 単語をタップすると訳が表示され、🔊で発音を聞ける。例文もタップで訳が出る。 */
export function WordCard({ word, actions }: Props) {
  const [showMeaning, setShowMeaning] = useState(false);
  const [openExamples, setOpenExamples] = useState<Set<number>>(new Set());

  const toggleExample = (i: number) =>
    setOpenExamples((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  return (
    <div className="card word-card">
      <div className="word-head">
        <button className="word-main" onClick={() => setShowMeaning((v) => !v)} aria-label="タップで訳を表示">
          <span className="word-text">{word.word}</span>
          <span className={`word-meaning ${showMeaning ? "show" : ""}`}>
            {showMeaning ? word.meaning || "（意味が未登録です）" : "タップで訳を表示"}
          </span>
        </button>
        <button className="icon-btn speak" onClick={() => speak(word.word)} aria-label="発音を聞く">
          🔊
        </button>
      </div>
      {word.grade && <span className="badge">英検{gradeLabel(word.grade)}</span>}

      {word.examples.length > 0 && (
        <ul className="examples">
          {word.examples.map((ex, i) => (
            <li key={i}>
              <div className="example-row">
                <button className="example-en" onClick={() => toggleExample(i)}>
                  {highlight(ex.en, word.word)}
                </button>
                <button className="icon-btn small" onClick={() => speak(ex.en)} aria-label="例文を聞く">
                  🔊
                </button>
              </div>
              {openExamples.has(i) && <div className="example-ja">{ex.ja || "（訳なし）"}</div>}
            </li>
          ))}
        </ul>
      )}
      {actions && <div className="card-actions">{actions}</div>}
    </div>
  );
}

/** 例文の中の見出し語（活用形も含めてざっくり）を太字にする */
export function highlight(sentence: string, word: string) {
  const stem = word.toLowerCase().replace(/e$/, "");
  if (stem.length < 2) return sentence;
  const re = new RegExp(`\\b(${escapeRe(stem)}[a-z]*)`, "gi");
  const parts = sentence.split(re);
  return parts.map((p, i) => (i % 2 === 1 ? <b key={i}>{p}</b> : p));
}

export const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

import { useState } from "react";
import { WordCard } from "../components/WordCard";
import { speak } from "../lib/speech";
import { actions, findWord, useAppState } from "../store";

/** テストでできなかった単語の一覧。ここで再テスト項目に指定できる。 */
export function ReviewPage({ onStartRetest, onChat }: { onStartRetest: () => void; onChat: () => void }) {
  const misses = useAppState((s) => s.misses);
  const history = useAppState((s) => s.history);
  const [filter, setFilter] = useState<"all" | "retest">("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<string | null>(null);

  const list = misses.filter((m) => filter === "all" || m.retest);
  const retestCount = misses.filter((m) => m.retest).length;
  const allSelected = list.length > 0 && list.every((m) => selected.has(m.wordId));

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const bulk = (fn: (ids: string[]) => void) => {
    fn([...selected]);
    setSelected(new Set());
  };

  return (
    <div className="page">
      <div className="row wrap">
        <button className="btn primary" disabled={retestCount === 0} onClick={onStartRetest}>
          🔁 再テストを始める ({retestCount})
        </button>
        <button className="btn" onClick={onChat}>
          💬 再テスト単語でAIと会話
        </button>
      </div>

      <div className="segmented">
        <button className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}>
          できなかった一覧 ({misses.length})
        </button>
        <button className={filter === "retest" ? "active" : ""} onClick={() => setFilter("retest")}>
          再テスト項目 ({retestCount})
        </button>
      </div>

      {list.length === 0 ? (
        <p className="empty">
          {filter === "all"
            ? "まだありません。テストの結果画面でまちがえた単語をチェックして保存すると、ここに一覧で表示されます。"
            : "再テスト項目はありません。一覧の ☆ をタップすると再テスト項目になります。"}
        </p>
      ) : (
        <>
          <div className="row wrap bulk">
            <label className="row">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={() => setSelected(allSelected ? new Set() : new Set(list.map((m) => m.wordId)))}
              />
              すべて選択
            </label>
            <button className="btn small" disabled={!selected.size} onClick={() => bulk((ids) => actions.setRetest(ids, true))}>
              ★ 再テスト項目にする
            </button>
            <button className="btn small" disabled={!selected.size} onClick={() => bulk((ids) => actions.setRetest(ids, false))}>
              ☆ 再テストから外す
            </button>
            <button
              className="btn small danger"
              disabled={!selected.size}
              onClick={() => confirm("選んだ単語を一覧から削除しますか？") && bulk(actions.removeMisses)}
            >
              🗑 一覧から削除
            </button>
          </div>

          <div className="list">
            {list.map((m) => {
              const word = findWord(m.wordId);
              return (
                <div key={m.wordId}>
                  <div className="miss-row">
                    <input type="checkbox" checked={selected.has(m.wordId)} onChange={() => toggle(m.wordId)} />
                    <button
                      className={`star ${m.retest ? "on" : ""}`}
                      onClick={() => actions.setRetest([m.wordId], !m.retest)}
                      aria-label="再テスト項目の切り替え"
                      title="再テスト項目"
                    >
                      {m.retest ? "★" : "☆"}
                    </button>
                    <button className="miss-word grow" onClick={() => setOpen(open === m.wordId ? null : m.wordId)}>
                      <b>{m.word}</b>
                      <span className="muted"> {open === m.wordId ? "" : "…タップで詳細"}</span>
                    </button>
                    <span className="badge ng">×{m.missCount}</span>
                    <button className="icon-btn small" onClick={() => speak(m.word)}>
                      🔊
                    </button>
                  </div>
                  {open === m.wordId && (
                    <WordCard word={word ?? { id: m.wordId, word: m.word, meaning: m.meaning, examples: [], source: "user", createdAt: 0 }} />
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {history.length > 0 && (
        <details className="card">
          <summary>📈 テストの履歴（{history.length}回）</summary>
          <ul className="history">
            {history.map((h) => (
              <li key={h.id}>
                <span>{new Date(h.date).toLocaleString("ja-JP", { dateStyle: "short", timeStyle: "short" })}</span>
                <span>{h.label}</span>
                <b>
                  {h.items.filter((i) => i.correct).length}/{h.items.length}
                </b>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

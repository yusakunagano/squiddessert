import { useState } from "react";
import { WordCard } from "../components/WordCard";
import { actions, useAppState } from "../store";
import { GRADES, type Example, type GradeId, type Word } from "../types";
import { eikenWordsByGrade } from "../data/eiken";
import { generateWordInfo, hasAI } from "../lib/ai";
import { freeLookup } from "../lib/dict";

export function WordsPage() {
  const [tab, setTab] = useState<"mine" | "eiken">("mine");
  const [grade, setGrade] = useState<GradeId>("5");
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Word | "new" | null>(null);
  const myWords = useAppState((s) => s.words);

  const list = (tab === "mine" ? myWords : eikenWordsByGrade(grade)).filter(
    (w) => !query || w.word.toLowerCase().includes(query.toLowerCase()) || w.meaning.includes(query),
  );

  return (
    <div className="page">
      <div className="segmented">
        <button className={tab === "mine" ? "active" : ""} onClick={() => setTab("mine")}>
          マイ単語 ({myWords.length})
        </button>
        <button className={tab === "eiken" ? "active" : ""} onClick={() => setTab("eiken")}>
          英検単語
        </button>
      </div>

      {tab === "eiken" && (
        <div className="chips">
          {GRADES.map((g) => (
            <button key={g.id} className={`chip ${grade === g.id ? "active" : ""}`} onClick={() => setGrade(g.id)}>
              {g.label}
            </button>
          ))}
        </div>
      )}

      <div className="row">
        <input className="input grow" placeholder="🔍 検索" value={query} onChange={(e) => setQuery(e.target.value)} />
        {tab === "mine" && (
          <button className="btn primary" onClick={() => setEditing("new")}>
            ＋ 単語を登録
          </button>
        )}
      </div>

      {editing && <WordEditor initial={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}

      {list.length === 0 && (
        <p className="empty">
          {tab === "mine" ? "まだ単語がありません。「＋ 単語を登録」から追加しましょう。" : "該当する単語がありません。"}
        </p>
      )}

      <div className="list">
        {list.map((w) => (
          <WordCard
            key={w.id}
            word={w}
            actions={
              w.source === "user" ? (
                <>
                  <button className="btn small" onClick={() => setEditing(w)}>
                    ✏️ 編集
                  </button>
                  <button
                    className="btn small danger"
                    onClick={() => confirm(`「${w.word}」を削除しますか？`) && actions.deleteWord(w.id)}
                  >
                    🗑 削除
                  </button>
                </>
              ) : undefined
            }
          />
        ))}
      </div>
    </div>
  );
}

function WordEditor({ initial, onClose }: { initial: Word | null; onClose: () => void }) {
  const [word, setWord] = useState(initial?.word ?? "");
  const [meaning, setMeaning] = useState(initial?.meaning ?? "");
  const [examples, setExamples] = useState<Example[]>(initial?.examples.length ? initial.examples : [{ en: "", ja: "" }]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const filledExamples = examples.filter((e) => e.en.trim());

  const autoFill = async (more: boolean) => {
    if (!word.trim()) return setError("先に英単語を入力してください。");
    setBusy(true);
    setError("");
    try {
      if (hasAI()) {
        const info = await generateWordInfo(word.trim(), { count: 3, existing: more ? filledExamples : [] });
        if (!meaning.trim() || !more) setMeaning(info.meaning);
        setExamples(more ? [...filledExamples, ...info.examples] : info.examples);
      } else {
        const info = await freeLookup(word.trim());
        if (info.meaning && !meaning.trim()) setMeaning(info.meaning);
        if (info.examples.length) setExamples(more ? [...filledExamples, ...info.examples] : info.examples);
        else setError("例文が見つかりませんでした。設定でAPIキーを入れるとAIが例文を作ります。");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const save = () => {
    if (!word.trim()) return setError("英単語を入力してください。");
    const data = { word: word.trim(), meaning: meaning.trim(), examples: filledExamples };
    if (initial) actions.updateWord(initial.id, data);
    else actions.addWord(data);
    onClose();
  };

  const setEx = (i: number, patch: Partial<Example>) =>
    setExamples((xs) => xs.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{initial ? "単語を編集" : "単語を登録"}</h2>
        <label className="field">
          英単語
          <input className="input" value={word} onChange={(e) => setWord(e.target.value)} placeholder="例: adventure" autoFocus />
        </label>
        <label className="field">
          意味（日本語）
          <input className="input" value={meaning} onChange={(e) => setMeaning(e.target.value)} placeholder="例: 冒険" />
        </label>

        <div className="row">
          <button className="btn" disabled={busy} onClick={() => autoFill(false)}>
            {busy ? "作成中…" : hasAI() ? "✨ AIで意味と例文を自動入力" : "🔎 意味と例文を自動入力"}
          </button>
          {filledExamples.length > 0 && (
            <button className="btn" disabled={busy} onClick={() => autoFill(true)}>
              ＋ 例文をさらに追加
            </button>
          )}
        </div>

        <div className="field">例文（いくつでも登録できます）</div>
        {examples.map((ex, i) => (
          <div key={i} className="example-edit">
            <input className="input" value={ex.en} onChange={(e) => setEx(i, { en: e.target.value })} placeholder="英文" />
            <input className="input" value={ex.ja} onChange={(e) => setEx(i, { ja: e.target.value })} placeholder="日本語訳" />
            <button className="icon-btn" onClick={() => setExamples((xs) => xs.filter((_, j) => j !== i))} aria-label="例文を削除">
              ✕
            </button>
          </div>
        ))}
        <button className="btn small" onClick={() => setExamples((xs) => [...xs, { en: "", ja: "" }])}>
          ＋ 例文の入力欄を追加
        </button>

        {error && <p className="error">{error}</p>}

        <div className="row end">
          <button className="btn" onClick={onClose}>
            キャンセル
          </button>
          <button className="btn primary" onClick={save}>
            保存
          </button>
        </div>
      </div>
    </div>
  );
}

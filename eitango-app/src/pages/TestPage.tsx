import { useMemo, useRef, useState } from "react";
import { HandwritingCanvas, type HandwritingHandle } from "../components/HandwritingCanvas";
import { escapeRe } from "../components/WordCard";
import { eikenWordsByGrade } from "../data/eiken";
import { hasAI, recognizeHandwriting } from "../lib/ai";
import { speak } from "../lib/speech";
import { actions, findWord, useAppState } from "../store";
import { GRADES, type TestItemResult, type Word } from "../types";

type Source = string; // "grade:5" | "mine" | "retest"

const PROGRESS_KEY = "eitango-test-progress";
const loadProgress = (): Record<string, number> => {
  try {
    return JSON.parse(localStorage.getItem(PROGRESS_KEY) ?? "{}");
  } catch {
    return {};
  }
};
const saveProgress = (source: string, next: number) => {
  try {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify({ ...loadProgress(), [source]: next }));
  } catch {
    /* 無視 */
  }
};

export const normalize = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");

export function TestPage({ initialSource }: { initialSource?: Source }) {
  const [run, setRun] = useState<{ source: Source; label: string; words: Word[] } | null>(null);
  const [results, setResults] = useState<TestItemResult[] | null>(null);

  if (results && run) {
    return (
      <ResultView
        source={run.source}
        results={results}
        onBack={() => {
          setRun(null);
          setResults(null);
        }}
      />
    );
  }
  if (run) {
    return (
      <QuizView
        words={run.words}
        onQuit={() => setRun(null)}
        onFinish={(r) => {
          actions.saveTest(run.label, r);
          setResults(r);
        }}
      />
    );
  }
  return <SetupView initialSource={initialSource} onStart={(source, label, words) => setRun({ source, label, words })} />;
}

function SetupView({
  initialSource,
  onStart,
}: {
  initialSource?: Source;
  onStart: (source: Source, label: string, words: Word[]) => void;
}) {
  const myWords = useAppState((s) => s.words);
  const misses = useAppState((s) => s.misses);
  const retestWords = useMemo(
    () =>
      misses
        .filter((m) => m.retest)
        .map((m) => findWord(m.wordId) ?? { id: m.wordId, word: m.word, meaning: m.meaning, examples: [], source: "user" as const, createdAt: 0 }),
    [misses],
  );

  const [source, setSource] = useState<Source>(initialSource ?? "grade:5");
  const [count, setCount] = useState(10);
  const progress = loadProgress();

  const pool: Word[] =
    source === "mine" ? [...myWords].reverse() : source === "retest" ? retestWords : eikenWordsByGrade(source.split(":")[1] as never);
  const label =
    source === "mine" ? "マイ単語" : source === "retest" ? "再テスト" : `英検${GRADES.find((g) => `grade:${g.id}` === source)?.label}`;
  const ordered = source !== "retest";
  const savedStart = ordered ? Math.min(progress[source] ?? 0, Math.max(pool.length - 1, 0)) : 0;
  const [startOverride, setStartOverride] = useState<number | null>(null);
  const start = startOverride ?? savedStart;

  const begin = () => {
    const n = count === 0 ? pool.length : count;
    const words = pool.slice(start, start + n);
    if (words.length === 0) return;
    if (ordered) saveProgress(source, start + words.length >= pool.length ? 0 : start + words.length);
    onStart(source, label, words);
  };

  return (
    <div className="page">
      <h2>テストの範囲を選ぶ</h2>
      <div className="chips">
        {GRADES.map((g) => (
          <button
            key={g.id}
            className={`chip ${source === `grade:${g.id}` ? "active" : ""}`}
            onClick={() => {
              setSource(`grade:${g.id}`);
              setStartOverride(null);
            }}
          >
            英検{g.label}
          </button>
        ))}
        <button className={`chip ${source === "mine" ? "active" : ""}`} onClick={() => (setSource("mine"), setStartOverride(null))}>
          マイ単語 ({myWords.length})
        </button>
        <button className={`chip retest ${source === "retest" ? "active" : ""}`} onClick={() => setSource("retest")}>
          🔁 再テスト項目 ({retestWords.length})
        </button>
      </div>

      <div className="card">
        <div className="field">出題数</div>
        <div className="chips">
          {[5, 10, 20, 0].map((n) => (
            <button key={n} className={`chip ${count === n ? "active" : ""}`} onClick={() => setCount(n)}>
              {n === 0 ? "全部" : `${n}問`}
            </button>
          ))}
        </div>

        {ordered && pool.length > 0 && (
          <>
            <div className="field">何番目から（全{pool.length}語・順番に出題）</div>
            <div className="row">
              <input
                type="range"
                min={0}
                max={pool.length - 1}
                value={start}
                onChange={(e) => setStartOverride(Number(e.target.value))}
                className="grow"
              />
              <span className="mono">
                {start + 1}番目「{pool[start]?.word}」
              </span>
            </div>
          </>
        )}

        <p className="hint">
          {hasAI()
            ? "✍️ 手書きの文字はAIが読み取って採点します。"
            : "✍️ 手書きしたあと、答えを見て自分で○×をつけます（設定でAPIキーを入れるとAIが自動採点します）。"}
        </p>
        <button className="btn primary big" disabled={pool.length === 0} onClick={begin}>
          テスト開始
        </button>
        {pool.length === 0 && <p className="empty">この範囲には単語がありません。</p>}
      </div>
    </div>
  );
}

function QuizView({
  words,
  onFinish,
  onQuit,
}: {
  words: Word[];
  onFinish: (r: TestItemResult[]) => void;
  onQuit: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [results, setResults] = useState<TestItemResult[]>([]);
  const [phase, setPhase] = useState<"write" | "checking" | "judged">("write");
  const [written, setWritten] = useState("");
  const [correct, setCorrect] = useState<boolean | null>(null);
  const [error, setError] = useState("");
  const [showExampleJa, setShowExampleJa] = useState(false);
  const canvas = useRef<HandwritingHandle>(null);

  const w = words[index];
  const example = w.examples[0];
  const blanked = example ? maskWord(example.en, w.word) : null;

  const check = async () => {
    setError("");
    if (!hasAI()) {
      setPhase("judged");
      setCorrect(null); // 自己採点
      return;
    }
    if (canvas.current?.isEmpty()) return setError("文字を書いてから答え合わせしてください。");
    setPhase("checking");
    try {
      const text = await recognizeHandwriting(canvas.current!.toPngBase64());
      setWritten(text);
      setCorrect(normalize(text) === normalize(w.word));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setCorrect(null);
    }
    setPhase("judged");
  };

  const giveUp = () => {
    setWritten("");
    setCorrect(false);
    setPhase("judged");
  };

  const next = (isCorrect: boolean) => {
    const r = [...results, { wordId: w.id, word: w.word, meaning: w.meaning, written, correct: isCorrect }];
    if (index + 1 >= words.length) return onFinish(r);
    setResults(r);
    setIndex(index + 1);
    setPhase("write");
    setWritten("");
    setCorrect(null);
    setError("");
    setShowExampleJa(false);
    canvas.current?.clear();
  };

  return (
    <div className="page quiz">
      <div className="quiz-top">
        <button className="btn small" onClick={() => confirm("テストを中断しますか？") && onQuit()}>
          ✕ 中断
        </button>
        <div className="progress">
          <div className="progress-bar" style={{ width: `${(index / words.length) * 100}%` }} />
        </div>
        <span className="mono">
          {index + 1}/{words.length}
        </span>
      </div>

      <div className="card question">
        <div className="q-meaning">{w.meaning || "（意味未登録）"}</div>
        <div className="q-hint">
          {w.word.split("").map((c, i) => (
            <span key={i} className="q-letter">
              {phase === "judged" ? c : i === 0 ? c : c === " " ? " " : "＿"}
            </span>
          ))}
          <span className="muted">（{w.word.replace(/ /g, "").length}文字）</span>
          <button className="icon-btn" onClick={() => speak(w.word)} aria-label="発音を聞く">
            🔊
          </button>
        </div>
        {blanked && (
          <div className="q-example" onClick={() => setShowExampleJa((v) => !v)}>
            <div>{phase === "judged" ? example!.en : blanked}</div>
            {showExampleJa ? <div className="example-ja">{example!.ja}</div> : <div className="muted small">タップで訳</div>}
          </div>
        )}
      </div>

      <HandwritingCanvas ref={canvas} />

      {phase === "write" && (
        <div className="row">
          <button className="btn" onClick={() => canvas.current?.undo()}>
            ↶ 1画もどす
          </button>
          <button className="btn" onClick={() => canvas.current?.clear()}>
            🗑 消す
          </button>
          <button className="btn" onClick={giveUp}>
            わからない
          </button>
        </div>
      )}
      {phase === "write" && (
        <button className="btn primary big" onClick={check}>
          答え合わせ
        </button>
      )}
      {phase === "checking" && <p className="center">✍️ 読み取り中…</p>}
      {error && <p className="error">{error}</p>}

      {phase === "judged" && (
        <div className={`card verdict ${correct === true ? "ok" : correct === false ? "ng" : ""}`}>
          <div className="verdict-answer">
            正解: <b>{w.word}</b>
            <button className="icon-btn" onClick={() => speak(w.word)}>
              🔊
            </button>
          </div>
          {correct !== null && hasAI() && written !== "" && (
            <div>
              読み取り結果: <span className="mono">{written || "（読み取れず）"}</span>
            </div>
          )}
          {correct === true && <div className="verdict-mark">⭕ 正解！</div>}
          {correct === false && <div className="verdict-mark">❌ 不正解</div>}
          {correct === null && <div>書いた答えと見くらべて、○か×を選んでください。</div>}

          <div className="row">
            {correct === null ? (
              <>
                <button className="btn ng grow" onClick={() => next(false)}>
                  ❌ まちがえた
                </button>
                <button className="btn ok grow" onClick={() => next(true)}>
                  ⭕ 合ってた
                </button>
              </>
            ) : (
              <>
                <button className="btn small" onClick={() => setCorrect(!correct)}>
                  {correct ? "やっぱり不正解にする" : "読み取りミス → 正解にする"}
                </button>
                <button className="btn primary grow" onClick={() => next(correct)}>
                  {index + 1 >= words.length ? "結果を見る" : "次へ →"}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function maskWord(sentence: string, word: string): string {
  const stem = word.toLowerCase().replace(/e$/, "");
  const re = new RegExp(`\\b${escapeRe(stem)}[a-z]*`, "gi");
  return re.test(sentence) ? sentence.replace(re, (m) => "＿".repeat(Math.min(m.length, 8))) : sentence;
}

function ResultView({
  source,
  results,
  onBack,
}: {
  source: Source;
  results: TestItemResult[];
  onBack: () => void;
}) {
  const [checked, setChecked] = useState<Set<string>>(() => new Set(results.filter((r) => !r.correct).map((r) => r.wordId)));
  const [saved, setSaved] = useState<string>("");
  const score = results.filter((r) => r.correct).length;
  const correctIds = results.filter((r) => r.correct).map((r) => r.wordId);

  const toggle = (id: string) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const save = (retest: boolean) => {
    const items = results.filter((r) => checked.has(r.wordId));
    actions.addMisses(items, retest);
    setSaved(retest ? `${items.length}語を一覧に保存し、再テスト項目にしました。` : `${items.length}語を「できなかった一覧」に保存しました。`);
  };

  return (
    <div className="page">
      <div className="card score">
        <div className="score-num">
          {score} / {results.length}
        </div>
        <div>{score === results.length ? "🎉 全問正解！すばらしい！" : "おつかれさま！まちがえた単語をチェックしよう。"}</div>
      </div>

      <h3>結果一覧（チェックした単語を一覧に保存できます）</h3>
      <div className="list">
        {results.map((r) => (
          <label key={r.wordId} className={`result-row ${r.correct ? "ok" : "ng"}`}>
            <input type="checkbox" checked={checked.has(r.wordId)} onChange={() => toggle(r.wordId)} />
            <span className="mark">{r.correct ? "⭕" : "❌"}</span>
            <span className="grow">
              <b>{r.word}</b> <span className="muted">{r.meaning}</span>
              {!r.correct && r.written && <span className="muted small"> （書いた答え: {r.written}）</span>}
            </span>
            <button
              className="icon-btn small"
              onClick={(e) => {
                e.preventDefault();
                speak(r.word);
              }}
            >
              🔊
            </button>
          </label>
        ))}
      </div>

      <div className="row wrap">
        <button className="btn" disabled={checked.size === 0} onClick={() => save(false)}>
          📋 チェックした単語を一覧に保存
        </button>
        <button className="btn primary" disabled={checked.size === 0} onClick={() => save(true)}>
          🔁 一覧に保存して再テスト項目にする
        </button>
        {source === "retest" && correctIds.length > 0 && (
          <button
            className="btn"
            onClick={() => {
              actions.setRetest(correctIds, false);
              setSaved(`正解した${correctIds.length}語を再テスト項目から外しました。`);
            }}
          >
            ✅ 正解した単語を再テスト項目から外す
          </button>
        )}
      </div>
      {saved && <p className="success">{saved}</p>}

      <button className="btn" onClick={onBack}>
        ← テストの範囲選択にもどる
      </button>
    </div>
  );
}

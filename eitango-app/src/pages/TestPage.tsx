import { useEffect, useMemo, useRef, useState } from "react";
import { HandwritingCanvas, type HandwritingHandle } from "../components/HandwritingCanvas";
import { EIKEN_WORDS, eikenWordsByGrade } from "../data/eiken";
import { speak } from "../lib/speech";
import { recognizeStrokes } from "../lib/handwriting";
import { highlight } from "../components/WordCard";
import { answerOf, maskSentence } from "../lib/phrase";
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
  const [run, setRun] = useState<{ source: Source; label: string; words: Word[]; random: boolean; direction: Direction } | null>(null);
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
        random={run.random}
        direction={run.direction}
        onQuit={() => setRun(null)}
        onFinish={(r) => {
          actions.saveTest(run.label, r);
          setResults(r);
        }}
      />
    );
  }
  return <SetupView initialSource={initialSource} onStart={(r) => setRun(r)} />;
}

function SetupView({
  initialSource,
  onStart,
}: {
  initialSource?: Source;
  onStart: (r: { source: Source; label: string; words: Word[]; random: boolean; direction: Direction }) => void;
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
  const autoGrade = useAppState((s) => s.settings.autoGrade);
  // 出題数（0 = 全部）
  const [count, setCount] = useState(10);
  // ランダムに出題するか（出題数とは別に選べる）
  const [random, setRandom] = useState(() => {
    try {
      return localStorage.getItem("eitango-test-random") === "1";
    } catch {
      return false;
    }
  });
  const toggleRandom = () => {
    setRandom(!random);
    try {
      localStorage.setItem("eitango-test-random", random ? "0" : "1");
    } catch {
      /* 無視 */
    }
  };
  const [direction, setDirection] = useState<Direction>(() => {
    try {
      const d = localStorage.getItem("eitango-test-direction");
      return d === "en2ja" || d === "choice" ? d : "ja2en";
    } catch {
      return "ja2en";
    }
  });
  const chooseDirection = (d: Direction) => {
    setDirection(d);
    try {
      localStorage.setItem("eitango-test-direction", d);
    } catch {
      /* 無視 */
    }
  };
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
    if (random) {
      // 範囲の中からランダムに n 問（重複なし）
      const shuffled = [...pool];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      const words = shuffled.slice(0, n);
      if (words.length) onStart({ source, label: `${label}（ランダム）`, words, random: false, direction });
      return;
    }
    const words = pool.slice(start, start + n);
    if (words.length === 0) return;
    if (ordered) saveProgress(source, start + words.length >= pool.length ? 0 : start + words.length);
    onStart({ source, label, words, random: false, direction });
  };

  return (
    <div className="page">
      <StatsCard />
      <div className="card">
        <label className="field">
          テストの範囲
          <select
            className="input"
            value={source}
            onChange={(e) => {
              setSource(e.target.value);
              setStartOverride(null);
            }}
          >
            {GRADES.map((g) => (
              <option key={g.id} value={`grade:${g.id}`}>
                英検{g.label}（{eikenWordsByGrade(g.id).length}語）
              </option>
            ))}
            <option value="mine">マイ単語（{myWords.length}語）</option>
            <option value="retest">🔁 再テスト項目（{retestWords.length}語）</option>
          </select>
        </label>
        <div className="field">出題の向き</div>
        <div className="segmented">
          <button className={direction === "ja2en" ? "active" : ""} onClick={() => chooseDirection("ja2en")}>
            日本語 → 英語（手書き）
          </button>
          <button className={direction === "en2ja" ? "active" : ""} onClick={() => chooseDirection("en2ja")}>
            英語 → 日本語
          </button>
          <button className={direction === "choice" ? "active" : ""} onClick={() => chooseDirection("choice")}>
            3択クイズ
          </button>
        </div>

        {direction === "ja2en" && <AiGradeToggle />}

        <div className="field">出題数</div>
        <div className="chips">
          {[10, 20, 30, 0].map((n) => (
            <button key={n} className={`chip ${count === n ? "active" : ""}`} onClick={() => setCount(n)}>
              {n === 0 ? "全部" : `${n}問`}
            </button>
          ))}
          <button className={`chip ${random ? "active" : ""}`} onClick={toggleRandom}>
            🔀 ランダム {random ? "ON" : "OFF"}
          </button>
        </div>

        {ordered && !random && pool.length > 0 && (
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

        {!(direction === "ja2en" && autoGrade) && (
          <p className="hint">
            {direction === "ja2en"
              ? "✍️ 手書きしたあと、答えを見て自分で○×をつけます。"
              : direction === "choice"
                ? "🎯 日本語の意味に合う英単語を3つの中から選びます。"
                : "💭 英単語を見て意味を思い浮かべ、答えを見て自分で○×をつけます。"}
          </p>
        )}
        <button className="btn primary big" disabled={pool.length === 0} onClick={begin}>
          テスト開始
        </button>
        {pool.length === 0 && <p className="empty">この範囲には単語がありません。</p>}
      </div>
    </div>
  );
}

export type Direction = "ja2en" | "en2ja" | "choice";

function QuizView({
  words,
  random,
  direction,
  onFinish,
  onQuit,
}: {
  words: Word[];
  /** true: ランダム♾️（終わりなし・直近20問の成績を表示） */
  random: boolean;
  direction: Direction;
  onFinish: (r: TestItemResult[]) => void;
  onQuit: () => void;
}) {
  const pickRandom = (prev: number | null) => {
    if (words.length <= 1) return 0;
    let i: number;
    do i = Math.floor(Math.random() * words.length);
    while (i === prev);
    return i;
  };
  const [index, setIndex] = useState(() => (random ? pickRandom(null) : 0));
  const [results, setResults] = useState<TestItemResult[]>([]);
  const [phase, setPhase] = useState<"write" | "checking" | "judged">("write");
  const autoGrade = useAppState((s) => s.settings.autoGrade);
  // 自動採点は Google 手書き認識だけを使う（速い・キー不要）
  const useAi = direction === "ja2en" && autoGrade;
  const [written, setWritten] = useState("");
  const [elapsed, setElapsed] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [gradeError, setGradeError] = useState("");
  const [correct, setCorrect] = useState<boolean | null>(null);
  const [showExampleJa, setShowExampleJa] = useState(false);
  const canvas = useRef<HandwritingHandle>(null);
  // 答え合わせのあと、「次へ」ボタンが見えるところまで自動でスクロールする
  const verdictRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (phase === "judged") verdictRef.current?.scrollIntoView({ block: "end" });
  }, [phase, index]);
  const myWords = useAppState((s) => s.words);
  const misses = useAppState((s) => s.misses);

  const w = words[index];
  const inMyWords = myWords.some((x) => x.word.toLowerCase() === w.word.toLowerCase());
  const inRetest = misses.some((m) => m.wordId === w.id && m.retest);
  const markButtons = (
    <div className="mark-buttons">
      <button className={`chip ${inMyWords ? "active" : ""}`} onClick={() => actions.toggleMyWord(w)}>
        {inMyWords ? "★ マイ単語" : "☆ マイ単語に入れる"}
      </button>
      <button
        className={`chip retest ${inRetest ? "active" : ""}`}
        onClick={() => actions.toggleRetest({ wordId: w.id, word: w.word, meaning: w.meaning })}
      >
        {inRetest ? "🔁 再テスト項目" : "🔁 再テストにする"}
      </button>
    </div>
  );
  const example = w.examples[0];
  const blanked = example ? maskSentence(example.en, w.word) : null;
  const answer = answerOf(w.word);
  // 3択クイズの選択肢（正解＋同じ範囲からランダムに2つ。範囲が小さいときは英検単語全体から）
  const choices = useMemo(() => {
    if (direction !== "choice") return [];
    const base = words.length >= 3 ? words : EIKEN_WORDS;
    const picked = new Map<string, Word>([[w.word.toLowerCase(), w]]);
    for (let guard = 0; picked.size < 3 && guard < 200; guard++) {
      const c = base[Math.floor(Math.random() * base.length)];
      if (!picked.has(c.word.toLowerCase()) && c.meaning !== w.meaning) picked.set(c.word.toLowerCase(), c);
    }
    return [...picked.values()].sort(() => Math.random() - 0.5);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [w.id, direction]);
  const [picked, setPicked] = useState<string | null>(null);
  const choose = (word: string) => {
    if (phase !== "write") return;
    setPicked(word);
    setCorrect(word === w.word);
    setPhase("judged");
  };
  const recent = results.slice(-20);
  const recentOk = recent.filter((r) => r.correct).length;
  const isLast = !random && index + 1 >= words.length;

  const check = async () => {
    setError("");
    setGradeError("");
    if (!useAi) {
      setCorrect(null); // 自己採点
      setPhase("judged");
      return;
    }
    if (canvas.current?.isEmpty()) return setError("文字を書いてから答え合わせしてください。");
    setPhase("checking");
    const t0 = performance.now();
    try {
      const ink = canvas.current!.getInk();
      const candidates = await recognizeStrokes(ink.strokes, ink.width, ink.height);
      setElapsed((performance.now() - t0) / 1000);
      // 上位3候補のどれかが答えと一致すれば正解（似た形の文字の読み違いを減らす）
      const hit = candidates.slice(0, 3).find((c) => normalize(c) === normalize(answer));
      setWritten(hit ?? candidates[0] ?? "（読み取れず）");
      setCorrect(!!hit);
    } catch (e) {
      setGradeError(e instanceof Error ? e.message : String(e));
      setCorrect(null); // 失敗したら自己採点に切り替える
    }
    setPhase("judged");
  };

  const giveUp = () => {
    setWritten("");
    setElapsed(null);
    setCorrect(false);
    setPhase("judged");
  };

  const next = (isCorrect: boolean) => {
    actions.recordAnswer(isCorrect);
    const r = [...results, { wordId: w.id, word: w.word, meaning: w.meaning, written, correct: isCorrect }];
    if (isLast) return onFinish(r);
    setResults(r);
    setIndex(random ? pickRandom(index) : index + 1);
    setPhase("write");
    setCorrect(null);
    setWritten("");
    setElapsed(null);
    setError("");
    setGradeError("");
    setPicked(null);
    setShowExampleJa(false);
    canvas.current?.clear();
  };

  const quit = () => {
    if (random && results.length > 0) onFinish(results);
    else if (confirm("テストを中断しますか？")) onQuit();
  };

  return (
    <div className="page quiz">
      <div className="quiz-top">
        <button className="btn small" onClick={quit}>
          {random ? "■ 終了" : "✕ 中断"}
        </button>
        {random ? (
          <div className="grow random-score">
            <span className="mono">第{results.length + 1}問</span>
            <span>
              直近{recent.length}問：<b>{recentOk}</b>/{recent.length}
              {recent.length > 0 && <span className="muted">（{Math.round((recentOk / recent.length) * 100)}%）</span>}
            </span>
          </div>
        ) : (
          <>
            <div className="progress">
              <div className="progress-bar" style={{ width: `${(index / words.length) * 100}%` }} />
            </div>
            <span className="mono">
              {index + 1}/{words.length}
            </span>
          </>
        )}
      </div>
      {direction === "ja2en" && <AiGradeToggle compact />}

      {direction === "choice" ? (
        <div className="card question">
          <div className="q-meaning">{w.meaning || "（意味未登録）"}</div>
          {blanked && (
            <div className="q-example" onClick={() => setShowExampleJa((v) => !v)}>
              <div>{phase === "judged" ? example!.en : blanked}</div>
              {showExampleJa ? <div className="example-ja">{example!.ja}</div> : <div className="muted small">タップで訳</div>}
            </div>
          )}
          <div className="choices">
            {choices.map((c) => (
              <button
                key={c.id}
                className={`choice ${phase === "judged" && c.word === w.word ? "ok" : ""} ${
                  phase === "judged" && c.word === picked && c.word !== w.word ? "ng" : ""
                }`}
                onClick={() => choose(c.word)}
                disabled={phase === "judged"}
              >
                {c.word}
                {phase === "judged" && <span className="choice-meaning">{c.meaning}</span>}
              </button>
            ))}
          </div>
          {markButtons}
        </div>
      ) : direction === "ja2en" ? (
        <div className="card question">
          <div className="q-meaning">{w.meaning || "（意味未登録）"}</div>
          <div className="q-hint">
            {hintTokens(w.word).map((t, i) =>
              t.placeholder ? (
                <span key={i} className="q-placeholder">
                  {t.text}
                </span>
              ) : (
                t.text.split("").map((c, j) => (
                  <span key={`${i}-${j}`} className="q-letter">
                    {phase === "judged" || (i === 0 && j === 0) || !/[a-z]/i.test(c) ? c : "＿"}
                  </span>
                ))
              ),
            )}
            <span className="muted">（{answer.replace(/[^a-z]/gi, "").length}文字）</span>
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
          {markButtons}
        </div>
      ) : (
        <div className="card question">
          <div className="row">
            <div className="q-word">{w.word}</div>
            <button className="icon-btn" onClick={() => speak(w.word)} aria-label="発音を聞く">
              🔊
            </button>
          </div>
          {example && (
            <div className="q-example">
              <div>{highlight(example.en, w.word)}</div>
              {phase === "judged" && <div className="example-ja">{example.ja}</div>}
            </div>
          )}
          {phase === "write" && <div className="muted small">意味を思い浮かべてから答えを見てください</div>}
          {markButtons}
        </div>
      )}

      {direction === "ja2en" && <HandwritingCanvas ref={canvas} />}

      {phase === "write" && direction === "ja2en" && (
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
      {phase === "write" && direction !== "choice" && (
        <button className="btn primary big" onClick={check}>
          {direction === "ja2en" ? "答え合わせ" : "答えを見る"}
        </button>
      )}

      {phase === "checking" && <p className="center">🤖 読み取り中…</p>}
      {error && <p className="error">{error}</p>}
      {gradeError && (
        <div className="card grade-error">
          <b>⚠️ 自動採点でエラーが起きました。自動採点をOFFにして利用してください。</b>
          <span className="muted small">{gradeError}</span>
          <div className="row">
            <button
              className="btn small"
              onClick={() => {
                actions.updateSettings({ autoGrade: false });
                setGradeError("");
              }}
            >
              自動採点をOFFにする
            </button>
          </div>
        </div>
      )}

      {phase === "judged" && (
        <div
          ref={verdictRef}
          className={`card verdict ${correct === true ? "ok" : correct === false ? "ng" : ""}`}>
          <div className="verdict-answer">
            {direction !== "en2ja" ? (
              <>
                正解: <b>{w.word}</b>
                <button className="icon-btn" onClick={() => speak(w.word)}>
                  🔊
                </button>
              </>
            ) : (
              <>
                意味: <b>{w.meaning || "（意味未登録）"}</b>
              </>
            )}
          </div>
          {written !== "" && (
            <div>
              読み取り結果: <span className="mono">{written}</span>
              {elapsed !== null && <span className="muted small">（{elapsed.toFixed(1)}秒）</span>}
            </div>
          )}
          {correct === true && <div className="verdict-mark">⭕ 正解！</div>}
          {correct === false && (
            <div className="verdict-mark">{written || picked ? "❌ 不正解" : "❌ わからなかった"}</div>
          )}
          {correct === null && <div>自分の答えと見くらべて、○か×を選んでください。</div>}

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
                {written !== "" && (
                  <button className="btn small" onClick={() => setCorrect(!correct)}>
                    {correct ? "やっぱり不正解にする" : "読み取りミス → 正解にする"}
                  </button>
                )}
                <button className="btn primary grow" onClick={() => next(correct)}>
                  {isLast ? "結果を見る" : "次へ →"}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** ヒント表示用に、~ や one's などの「書かなくてよい部分」を分ける */
function hintTokens(word: string): { text: string; placeholder: boolean }[] {
  const out: { text: string; placeholder: boolean }[] = [];
  word.split(/\s+/).forEach((tok, i) => {
    if (i > 0) out.push({ text: " ", placeholder: true });
    out.push(tok.startsWith("~") ? { text: tok.replace("~", "～"), placeholder: true } : { text: tok, placeholder: false });
  });
  return out;
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
    const items = results.filter((r, i, all) => checked.has(r.wordId) && all.findIndex((x) => x.wordId === r.wordId) === i);
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
        {results.map((r, i) => (
          <label key={`${r.wordId}-${i}`} className={`result-row ${r.correct ? "ok" : "ng"}`}>
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

/** 手書きテストの自動採点 ON/OFF */
function AiGradeToggle({ compact = false }: { compact?: boolean }) {
  const autoGrade = useAppState((s) => s.settings.autoGrade);
  return (
    <div className={compact ? "ai-toggle compact" : "ai-toggle"}>
      <button className={`chip ${autoGrade ? "active" : ""}`} onClick={() => actions.updateSettings({ autoGrade: !autoGrade })}>
        🤖 自動採点 {autoGrade ? "ON" : "OFF"}
      </button>
    </div>
  );
}

const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** 記録：今日の問題数・正解数。タップでグラフ（直近30日・1週間）と日別の一覧 */
function StatsCard() {
  const stats = useAppState((s) => s.stats);
  const [open, setOpen] = useState(false);
  const today = stats[dayKey(new Date())] ?? { total: 0, correct: 0 };
  return (
    <>
      <button className="card stats-card" onClick={() => setOpen(true)}>
        <span>📊 記録</span>
        <span>
          今日 <b>{today.total}</b>問・正解 <b>{today.correct}</b>問 <span className="stats-link">グラフ ›</span>
        </span>
      </button>
      {open && <StatsModal onClose={() => setOpen(false)} />}
    </>
  );
}

function StatsModal({ onClose }: { onClose: () => void }) {
  const stats = useAppState((s) => s.stats);
  const [view, setView] = useState<"30" | "7" | "day">("30");
  const days = Object.keys(stats).sort().reverse();
  const rangeDays = (n: number) =>
    Array.from({ length: n }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (n - 1 - i));
      const k = dayKey(d);
      return { key: k, label: `${d.getMonth() + 1}/${d.getDate()}`, ...(stats[k] ?? { total: 0, correct: 0 }) };
    });
  const data = view === "day" ? [] : rangeDays(view === "30" ? 30 : 7);
  const sum = (view === "day" ? days.map((k) => stats[k]) : data).reduce(
    (a, x) => ({ total: a.total + x.total, correct: a.correct + x.correct }),
    { total: 0, correct: 0 },
  );
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="row">
          <h2 className="grow">📊 記録</h2>
          <button className="icon-btn small" onClick={onClose} aria-label="閉じる">
            ✕
          </button>
        </div>
        <div className="segmented">
          <button className={view === "30" ? "active" : ""} onClick={() => setView("30")}>
            直近30日
          </button>
          <button className={view === "7" ? "active" : ""} onClick={() => setView("7")}>
            1週間
          </button>
          <button className={view === "day" ? "active" : ""} onClick={() => setView("day")}>
            日別
          </button>
        </div>
        <div className="stats-total">
          {view === "day" ? "合計" : view === "30" ? "30日間" : "7日間"}　<b>{sum.total}</b>問・正解 <b>{sum.correct}</b>問
          {sum.total > 0 && <span className="muted">（{Math.round((sum.correct / sum.total) * 100)}%）</span>}
        </div>
        {view === "day" ? (
          days.length === 0 ? (
            <p className="muted small">まだ記録はありません。テストを解くと、1問ごとに記録されます。</p>
          ) : (
            <table className="stats-table">
              <thead>
                <tr>
                  <th>日付</th>
                  <th>問題数</th>
                  <th>正解数</th>
                </tr>
              </thead>
              <tbody>
                {days.map((k) => (
                  <tr key={k}>
                    <td>{k.slice(5).replace("-", "/")}</td>
                    <td>{stats[k].total}</td>
                    <td>{stats[k].correct}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        ) : (
          <StatsChart data={data} />
        )}
      </div>
    </div>
  );
}

/** 日ごとの積み上げ棒グラフ（正解＋不正解＝問題数）。棒をタップするとその日の数を表示 */
function StatsChart({ data }: { data: { key: string; label: string; total: number; correct: number }[] }) {
  const [sel, setSel] = useState<number | null>(null);
  const W = 340;
  const H = 180;
  const padL = 28;
  const padB = 22;
  const padT = 10;
  const padR = 14;
  const max = Math.max(10, ...data.map((d) => d.total));
  const niceMax = Math.ceil(max / 10) * 10;
  const slot = (W - padL - padR) / data.length;
  const bw = Math.max(3, Math.min(22, slot - 3));
  const y = (v: number) => padT + (H - padB - padT) * (1 - v / niceMax);
  const labelEvery = data.length > 10 ? 5 : 1;
  const picked = sel !== null ? data[sel] : null;
  return (
    <div className="stats-chart">
      <div className="chart-legend">
        <span>
          <i className="sw ok" />
          正解
        </span>
        <span>
          <i className="sw ng" />
          不正解
        </span>
        <span className="muted small">棒の高さ＝問題数</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="日ごとの問題数と正解数のグラフ">
        {[0, 0.5, 1].map((t) => (
          <g key={t}>
            <line className="grid" x1={padL} x2={W - padR} y1={y(niceMax * t)} y2={y(niceMax * t)} />
            <text className="axis" x={padL - 4} y={y(niceMax * t) + 4} textAnchor="end">
              {Math.round(niceMax * t)}
            </text>
          </g>
        ))}
        {data.map((d, i) => {
          const x = padL + slot * i + (slot - bw) / 2;
          const wrong = d.total - d.correct;
          return (
            <g key={d.key} onClick={() => setSel(sel === i ? null : i)} className={sel === i ? "sel" : ""}>
              <rect className="hit" x={padL + slot * i} y={0} width={slot} height={H - padB} />
              {d.correct > 0 && (
                <rect className="bar ok" x={x} y={y(d.correct)} width={bw} height={y(0) - y(d.correct)} rx={2} />
              )}
              {wrong > 0 && (
                <rect className="bar ng" x={x} y={y(d.total)} width={bw} height={Math.max(0, y(d.correct) - y(d.total) - 1.5)} rx={2} />
              )}
              {(i % labelEvery === (data.length - 1) % labelEvery || i === data.length - 1) && (
                <text className="axis" x={x + bw / 2} y={H - 6} textAnchor="middle">
                  {d.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <div className="chart-detail">
        {picked ? (
          <>
            {picked.label}：<b>{picked.total}</b>問・正解 <b>{picked.correct}</b>問
          </>
        ) : (
          <span className="muted small">棒をタップすると、その日の数が出ます</span>
        )}
      </div>
    </div>
  );
}

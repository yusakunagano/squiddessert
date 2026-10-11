import { useMemo, useRef, useState } from "react";
import { HandwritingCanvas, type HandwritingHandle } from "../components/HandwritingCanvas";
import { eikenWordsByGrade } from "../data/eiken";
import { speak } from "../lib/speech";
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
  // 出題数（0 = 全部、-1 = ランダム♾️）
  const [count, setCount] = useState(10);
  const [direction, setDirection] = useState<Direction>(() => {
    try {
      return localStorage.getItem("eitango-test-direction") === "en2ja" ? "en2ja" : "ja2en";
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

  const random = count === -1;
  const begin = () => {
    if (random) {
      if (pool.length) onStart({ source, label: `${label}（ランダム）`, words: pool, random: true, direction });
      return;
    }
    const n = count === 0 ? pool.length : count;
    const words = pool.slice(start, start + n);
    if (words.length === 0) return;
    if (ordered) saveProgress(source, start + words.length >= pool.length ? 0 : start + words.length);
    onStart({ source, label, words, random: false, direction });
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
        <div className="field">出題の向き</div>
        <div className="segmented">
          <button className={direction === "ja2en" ? "active" : ""} onClick={() => chooseDirection("ja2en")}>
            日本語 → 英語（手書き）
          </button>
          <button className={direction === "en2ja" ? "active" : ""} onClick={() => chooseDirection("en2ja")}>
            英語 → 日本語
          </button>
        </div>

        <div className="field">出題数</div>
        <div className="chips">
          {[10, 20, 30, 0, -1].map((n) => (
            <button key={n} className={`chip ${count === n ? "active" : ""}`} onClick={() => setCount(n)}>
              {n === 0 ? "全部" : n === -1 ? "ランダム♾️" : `${n}問`}
            </button>
          ))}
        </div>
        {random && <p className="hint">♾️ 範囲の中からランダムに出題し続けます。直近20問の成績が表示されます。「■ 終了」で結果を見られます。</p>}

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

        <p className="hint">
          {direction === "ja2en" ? "✍️ 手書きしたあと、答えを見て自分で○×をつけます。" : "💭 英単語を見て意味を思い浮かべ、答えを見て自分で○×をつけます。"}
        </p>
        <button className="btn primary big" disabled={pool.length === 0} onClick={begin}>
          テスト開始
        </button>
        {pool.length === 0 && <p className="empty">この範囲には単語がありません。</p>}
      </div>
    </div>
  );
}

export type Direction = "ja2en" | "en2ja";

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
  // 速さを優先して、テストではAIを使わず自己採点にする
  const [phase, setPhase] = useState<"write" | "judged">("write");
  const [correct, setCorrect] = useState<boolean | null>(null);
  const [showExampleJa, setShowExampleJa] = useState(false);
  const canvas = useRef<HandwritingHandle>(null);

  const w = words[index];
  const example = w.examples[0];
  const blanked = example ? maskSentence(example.en, w.word) : null;
  const answer = answerOf(w.word);
  const recent = results.slice(-20);
  const recentOk = recent.filter((r) => r.correct).length;
  const isLast = !random && index + 1 >= words.length;

  const check = () => {
    setCorrect(null); // 自己採点
    setPhase("judged");
  };

  const giveUp = () => {
    setCorrect(false);
    setPhase("judged");
  };

  const next = (isCorrect: boolean) => {
    const r = [...results, { wordId: w.id, word: w.word, meaning: w.meaning, written: "", correct: isCorrect }];
    if (isLast) return onFinish(r);
    setResults(r);
    setIndex(random ? pickRandom(index) : index + 1);
    setPhase("write");
    setCorrect(null);
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

      {direction === "ja2en" ? (
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
          {phase === "write" && <div className="muted small">意味を思い浮かべてから「答えを見る」を押してください</div>}
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
      {phase === "write" && (
        <button className="btn primary big" onClick={check}>
          {direction === "ja2en" ? "答え合わせ" : "答えを見る"}
        </button>
      )}

      {phase === "judged" && (
        <div className={`card verdict ${correct === true ? "ok" : correct === false ? "ng" : ""}`}>
          <div className="verdict-answer">
            {direction === "ja2en" ? (
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
          {correct === false && <div className="verdict-mark">❌ わからなかった</div>}
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
              <button className="btn primary grow" onClick={() => next(false)}>
                {isLast ? "結果を見る" : "次へ →"}
              </button>
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

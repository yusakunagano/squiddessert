import { useSyncExternalStore } from "react";
import type { ChatMessage, MissEntry, Settings, TestItemResult, TestRecord, Word } from "./types";
import { EIKEN_WORDS } from "./data/eiken";

/** アプリ全体の保存データ。すべてブラウザの localStorage に保存する。 */
export interface AppState {
  words: Word[];
  misses: MissEntry[];
  history: TestRecord[];
  chat: ChatMessage[];
  settings: Settings;
}

const STORAGE_KEY = "eitango-app-v1";

const DEFAULT_STATE: AppState = {
  words: [],
  misses: [],
  history: [],
  chat: [],
  settings: { provider: "claude", apiKey: "", model: "claude-opus-5-5", geminiKey: "", geminiModel: "gemini-flash-latest", aiGrade: false, speechRate: 0.9, voiceURI: "", speechEngine: "auto" },
};

function load(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_STATE;
    const parsed = JSON.parse(raw) as Partial<AppState>;
    return {
      ...DEFAULT_STATE,
      ...parsed,
      settings: { ...DEFAULT_STATE.settings, ...parsed.settings },
    };
  } catch {
    return DEFAULT_STATE;
  }
}

let state: AppState = load();
const listeners = new Set<() => void>();

function setState(update: (s: AppState) => AppState) {
  state = update(state);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // 容量オーバーなどは無視（メモリ上の状態は更新される）
  }
  listeners.forEach((l) => l());
}

export function useAppState<T>(selector: (s: AppState) => T): T {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => selector(state),
  );
}

export const getState = () => state;

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

/** 自分の単語と英検単語の両方から探す */
export function findWord(id: string): Word | undefined {
  return state.words.find((w) => w.id === id) ?? EIKEN_WORDS.find((w) => w.id === id);
}

export const actions = {
  addWord(word: Omit<Word, "id" | "createdAt" | "source">) {
    setState((s) => ({
      ...s,
      words: [{ ...word, id: uid(), source: "user", createdAt: Date.now() }, ...s.words],
    }));
  },
  updateWord(id: string, patch: Partial<Word>) {
    setState((s) => ({ ...s, words: s.words.map((w) => (w.id === id ? { ...w, ...patch } : w)) }));
  },
  deleteWord(id: string) {
    setState((s) => ({ ...s, words: s.words.filter((w) => w.id !== id) }));
  },

  saveTest(label: string, items: TestItemResult[]) {
    const record: TestRecord = { id: uid(), label, date: Date.now(), items };
    setState((s) => ({ ...s, history: [record, ...s.history].slice(0, 50) }));
  },

  /** チェックした単語を「できなかった単語一覧」に追加する */
  addMisses(items: { wordId: string; word: string; meaning: string }[], retest: boolean) {
    setState((s) => {
      const misses = [...s.misses];
      for (const it of items) {
        const i = misses.findIndex((m) => m.wordId === it.wordId);
        if (i >= 0) {
          misses[i] = {
            ...misses[i],
            missCount: misses[i].missCount + 1,
            lastMissedAt: Date.now(),
            retest: misses[i].retest || retest,
          };
        } else {
          misses.unshift({ ...it, missCount: 1, lastMissedAt: Date.now(), retest });
        }
      }
      return { ...s, misses };
    });
  },
  /** テスト中などに、間違えていなくても再テスト項目にする／外す */
  toggleRetest(item: { wordId: string; word: string; meaning: string }) {
    setState((s) => {
      const m = s.misses.find((x) => x.wordId === item.wordId);
      if (m) return { ...s, misses: s.misses.map((x) => (x.wordId === item.wordId ? { ...x, retest: !x.retest } : x)) };
      return { ...s, misses: [{ ...item, missCount: 0, lastMissedAt: Date.now(), retest: true }, ...s.misses] };
    });
  },
  /** 英検単語などをマイ単語に入れる／外す（同じつづりの単語があれば外す） */
  toggleMyWord(word: Word) {
    setState((s) => {
      const key = word.word.toLowerCase();
      if (s.words.some((w) => w.word.toLowerCase() === key))
        return { ...s, words: s.words.filter((w) => w.word.toLowerCase() !== key) };
      const copy: Word = { id: uid(), word: word.word, meaning: word.meaning, examples: word.examples, source: "user", createdAt: Date.now() };
      return { ...s, words: [copy, ...s.words] };
    });
  },
  setRetest(wordIds: string[], retest: boolean) {
    const ids = new Set(wordIds);
    setState((s) => ({
      ...s,
      misses: s.misses.map((m) => (ids.has(m.wordId) ? { ...m, retest } : m)),
    }));
  },
  removeMisses(wordIds: string[]) {
    const ids = new Set(wordIds);
    setState((s) => ({ ...s, misses: s.misses.filter((m) => !ids.has(m.wordId)) }));
  },

  setChat(chat: ChatMessage[]) {
    setState((s) => ({ ...s, chat }));
  },

  updateSettings(patch: Partial<Settings>) {
    setState((s) => ({ ...s, settings: { ...s.settings, ...patch } }));
  },
};

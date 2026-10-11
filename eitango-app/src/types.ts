export type GradeId = "5" | "4" | "3" | "p2" | "2" | "p1" | "1";

export const GRADES: { id: GradeId; label: string }[] = [
  { id: "5", label: "5級" },
  { id: "4", label: "4級" },
  { id: "3", label: "3級" },
  { id: "p2", label: "準2級" },
  { id: "2", label: "2級" },
  { id: "p1", label: "準1級" },
  { id: "1", label: "1級" },
];

export const gradeLabel = (id?: GradeId) => GRADES.find((g) => g.id === id)?.label ?? "";

export interface Example {
  en: string;
  ja: string;
}

export interface Word {
  id: string;
  word: string;
  meaning: string;
  examples: Example[];
  source: "user" | "eiken";
  grade?: GradeId;
  createdAt: number;
}

/** テストで間違えた（またはチェックした）単語の一覧。 */
export interface MissEntry {
  wordId: string;
  /** 単語データのスナップショット（英検単語・削除済み単語でも表示できるように） */
  word: string;
  meaning: string;
  missCount: number;
  lastMissedAt: number;
  /** 再テスト項目に入っているか */
  retest: boolean;
}

export interface TestItemResult {
  wordId: string;
  word: string;
  meaning: string;
  written: string;
  correct: boolean;
}

export interface TestRecord {
  id: string;
  label: string;
  date: number;
  items: TestItemResult[];
}

export interface ChatMessage {
  role: "user" | "assistant";
  text: string;
}

export interface Settings {
  apiKey: string;
  model: string;
  speechRate: number;
  voiceURI: string;
}

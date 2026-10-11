import { getState } from "../store";

/** ブラウザ標準の音声合成 (Web Speech API) で英語を読み上げる */
export function speak(text: string, lang = "en-US") {
  if (!("speechSynthesis" in window)) {
    alert("このブラウザは音声読み上げに対応していません。");
    return;
  }
  const { speechRate, voiceURI } = getState().settings;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang;
  u.rate = speechRate;
  const voice = window.speechSynthesis.getVoices().find((v) => v.voiceURI === voiceURI);
  if (voice && lang.startsWith("en")) u.voice = voice;
  window.speechSynthesis.speak(u);
}

export function englishVoices(): SpeechSynthesisVoice[] {
  if (!("speechSynthesis" in window)) return [];
  return window.speechSynthesis.getVoices().filter((v) => v.lang.startsWith("en"));
}

// 音声入力 (対応ブラウザのみ: Chrome / Safari)
type Recognition = {
  lang: string;
  interimResults: boolean;
  onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void;
  onerror: () => void;
  onend: () => void;
  start: () => void;
  stop: () => void;
};

export function createRecognition(): Recognition | null {
  const w = window as unknown as Record<string, unknown>;
  const Ctor = (w.SpeechRecognition ?? w.webkitSpeechRecognition) as (new () => Recognition) | undefined;
  if (!Ctor) return null;
  const r = new Ctor();
  r.lang = "en-US";
  r.interimResults = false;
  return r;
}

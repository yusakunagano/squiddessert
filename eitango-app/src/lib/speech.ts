import { getState } from "../store";

// 英語の読み上げ。
// 1. 端末の音声合成 (Web Speech API)
// 2. オンライン音声（音声ファイルを再生。iPhoneのマナーモードや、音声合成が使えないブラウザでも鳴る）
// 設定の「音声の種類」が「自動」のときは、端末に英語の声があれば 1、なければ 2 を使い、
// 1 が鳴らなかったときも 2 に切り替える。

const hasSynth = () => typeof window !== "undefined" && "speechSynthesis" in window;

// 声の一覧は非同期で読み込まれるので、起動時に読み込みを始めておく
let voices: SpeechSynthesisVoice[] = [];
if (hasSynth()) {
  const load = () => (voices = window.speechSynthesis.getVoices());
  load();
  window.speechSynthesis.addEventListener?.("voiceschanged", load);
}

export function englishVoices(): SpeechSynthesisVoice[] {
  if (!hasSynth()) return [];
  if (!voices.length) voices = window.speechSynthesis.getVoices();
  return voices.filter((v) => v.lang.toLowerCase().startsWith("en"));
}

function pickVoice(): SpeechSynthesisVoice | undefined {
  const list = englishVoices();
  const { voiceURI } = getState().settings;
  return (
    list.find((v) => v.voiceURI === voiceURI) ??
    list.find((v) => v.lang.replace("_", "-") === "en-US" && v.localService) ??
    list.find((v) => v.lang.replace("_", "-") === "en-US") ??
    list[0]
  );
}

// 再生中の音声（Chrome では参照を持っていないと途中で止まることがある）
let currentUtterance: SpeechSynthesisUtterance | null = null;
let currentAudio: HTMLAudioElement | null = null;
let fallbackTimer: number | undefined;

export function stopSpeaking() {
  window.clearTimeout(fallbackTimer);
  currentAudio?.pause();
  currentAudio = null;
  if (hasSynth() && (window.speechSynthesis.speaking || window.speechSynthesis.pending)) {
    window.speechSynthesis.cancel();
    return true;
  }
  return false;
}

/** 英語を読み上げる */
export function speak(text: string) {
  text = text.replace(/\s+/g, " ").trim();
  if (!text) return;
  const engine = getState().settings.speechEngine;
  const wasSpeaking = stopSpeaking();

  const useDevice = hasSynth() && (engine === "device" || (engine === "auto" && !!pickVoice()));
  if (!useDevice) {
    speakOnline(text);
    return;
  }
  const run = () => speakDevice(text, engine === "auto");
  // cancel() の直後に speak() すると鳴らないブラウザがあるので少し待つ
  // （iPhone は操作の直後でないと鳴らないため、止めたときだけ待つ）
  if (wasSpeaking) window.setTimeout(run, 80);
  else run();
}

function speakDevice(text: string, fallback: boolean) {
  const synth = window.speechSynthesis;
  const u = new SpeechSynthesisUtterance(text);
  const voice = pickVoice();
  u.lang = voice?.lang ?? "en-US";
  if (voice) u.voice = voice;
  u.rate = getState().settings.speechRate;
  let started = false;
  u.onstart = () => {
    started = true;
    window.clearTimeout(fallbackTimer);
  };
  u.onerror = (e) => {
    if (!started && fallback && e.error !== "interrupted" && e.error !== "canceled") speakOnline(text);
  };
  currentUtterance = u;
  synth.resume(); // 一時停止状態のまま固まっていることがあるため
  synth.speak(u);
  if (fallback) {
    // しばらくしても話し始めなければオンライン音声に切り替える
    fallbackTimer = window.setTimeout(() => {
      if (!started && currentUtterance === u) {
        synth.cancel();
        speakOnline(text);
      }
    }, 2000);
  }
}

/** 文章を200文字以内のかたまりに分ける（オンライン音声の上限対策） */
function chunks(text: string): string[] {
  const parts = text.match(/[^.!?]+[.!?]*\s*/g) ?? [text];
  const out: string[] = [];
  let cur = "";
  for (const p of parts) {
    if ((cur + p).length > 180 && cur) {
      out.push(cur.trim());
      cur = "";
    }
    cur += p;
  }
  if (cur.trim()) out.push(cur.trim());
  return out.flatMap((c) => (c.length > 200 ? (c.match(/.{1,200}(\s|$)/g) ?? [c]) : [c]));
}

function speakOnline(text: string) {
  const queue = chunks(text);
  const rate = getState().settings.speechRate;
  const playNext = () => {
    const part = queue.shift();
    if (!part) return;
    const audio = new Audio(
      `https://translate.google.com/translate_tts?ie=UTF-8&tl=en-US&client=tw-ob&q=${encodeURIComponent(part)}`,
    );
    audio.playbackRate = rate;
    audio.onended = playNext;
    currentAudio = audio;
    audio.play().catch(() => {
      if (currentAudio === audio) {
        alert(
          "音声を再生できませんでした。\n・音量やマナーモードを確認してください\n・インターネット接続を確認してください\n・「設定」の「音声の種類」を変えると鳴ることがあります",
        );
      }
    });
  };
  playNext();
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

import { useEffect, useState } from "react";
import { MODEL_OPTIONS } from "../lib/ai";
import { englishVoices, speak } from "../lib/speech";
import { actions, getState, useAppState } from "../store";

export function SettingsPage() {
  const settings = useAppState((s) => s.settings);
  const [key, setKey] = useState(settings.apiKey);
  const [saved, setSaved] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>(englishVoices());

  useEffect(() => {
    if (!("speechSynthesis" in window)) return;
    const update = () => setVoices(englishVoices());
    window.speechSynthesis.addEventListener("voiceschanged", update);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", update);
  }, []);

  const exportData = () => {
    const blob = new Blob([JSON.stringify({ ...getState(), settings: { ...getState().settings, apiKey: "" } }, null, 2)], {
      type: "application/json",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `eitango-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
  };

  return (
    <div className="page">
      <div className="card">
        <h2>🤖 AI（Claude）の設定</h2>
        <p className="muted small">
          APIキーを入れると「手書き文字のAI採点」「例文の自動作成」「AIとの英会話」が使えます。キーは
          <a href="https://console.anthropic.com/" target="_blank" rel="noreferrer">
            Anthropic Console
          </a>
          で発行できます。キーはこの端末のブラウザ内にだけ保存されます。
        </p>
        <label className="field">
          APIキー
          <input
            className="input"
            type="password"
            value={key}
            onChange={(e) => {
              setKey(e.target.value);
              setSaved(false);
            }}
            placeholder="sk-ant-..."
            autoComplete="off"
          />
        </label>
        <div className="row">
          <button
            className="btn primary"
            onClick={() => {
              actions.updateSettings({ apiKey: key.trim() });
              setSaved(true);
            }}
          >
            保存
          </button>
          {saved && <span className="success">保存しました</span>}
        </div>
        <label className="field">
          使うモデル
          <select className="input" value={settings.model} onChange={(e) => actions.updateSettings({ model: e.target.value })}>
            {MODEL_OPTIONS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="card">
        <h2>🔊 読み上げの設定</h2>
        <label className="field">
          話す速さ: {settings.speechRate.toFixed(1)}
          <input
            type="range"
            min={0.5}
            max={1.5}
            step={0.1}
            value={settings.speechRate}
            onChange={(e) => actions.updateSettings({ speechRate: Number(e.target.value) })}
          />
        </label>
        <label className="field">
          声
          <select className="input" value={settings.voiceURI} onChange={(e) => actions.updateSettings({ voiceURI: e.target.value })}>
            <option value="">自動</option>
            {voices.map((v) => (
              <option key={v.voiceURI} value={v.voiceURI}>
                {v.name} ({v.lang})
              </option>
            ))}
          </select>
        </label>
        <button className="btn" onClick={() => speak("Hello! Let's study English together.")}>
          ▶ 試しに聞く
        </button>
      </div>

      <div className="card">
        <h2>💾 データ</h2>
        <p className="muted small">登録した単語やテスト結果はこの端末のブラウザに保存されています。</p>
        <div className="row wrap">
          <button className="btn" onClick={exportData}>
            バックアップを書き出す
          </button>
          <label className="btn">
            バックアップから復元
            <input
              type="file"
              accept="application/json"
              hidden
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                try {
                  const data = JSON.parse(await file.text());
                  localStorage.setItem("eitango-app-v1", JSON.stringify({ ...data, settings: getState().settings }));
                  location.reload();
                } catch {
                  alert("ファイルを読み込めませんでした。");
                }
              }}
            />
          </label>
        </div>
      </div>
    </div>
  );
}

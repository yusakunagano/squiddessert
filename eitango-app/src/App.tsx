import { useState } from "react";
import { WordsPage } from "./pages/WordsPage";
import { TestPage } from "./pages/TestPage";
import { ReviewPage } from "./pages/ReviewPage";
import { ChatPage } from "./pages/ChatPage";
import { SettingsPage } from "./pages/SettingsPage";
import { useAppState } from "./store";

type Tab = "words" | "test" | "review" | "chat" | "settings";

const TABS: { id: Tab; icon: string; label: string }[] = [
  { id: "words", icon: "📘", label: "単語帳" },
  { id: "test", icon: "✍️", label: "テスト" },
  { id: "review", icon: "📋", label: "復習" },
  { id: "chat", icon: "💬", label: "AI会話" },
  { id: "settings", icon: "⚙️", label: "設定" },
];

export function App() {
  const [tab, setTab] = useState<Tab>("words");
  // テスト画面を「再テスト」から開いたときに範囲を指定するため、key で作り直す
  const [testKey, setTestKey] = useState(0);
  const [testSource, setTestSource] = useState<string | undefined>();
  const retestCount = useAppState((s) => s.misses.filter((m) => m.retest).length);

  const go = (t: Tab) => {
    if (t === "test") {
      setTestSource(undefined);
      setTestKey((k) => k + 1);
    }
    setTab(t);
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>📘 えいたんご</h1>
        <span className="muted small">{TABS.find((t) => t.id === tab)?.label}</span>
      </header>

      <main>
        {tab === "words" && <WordsPage />}
        {tab === "test" && <TestPage key={testKey} initialSource={testSource} />}
        {tab === "review" && (
          <ReviewPage
            onStartRetest={() => {
              setTestSource("retest");
              setTestKey((k) => k + 1);
              setTab("test");
            }}
            onChat={() => setTab("chat")}
          />
        )}
        {tab === "chat" && <ChatPage onOpenSettings={() => setTab("settings")} />}
        {tab === "settings" && <SettingsPage />}
      </main>

      <nav className="tabbar">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? "active" : ""} onClick={() => go(t.id)}>
            <span className="tab-icon">{t.icon}</span>
            <span>{t.label}</span>
            {t.id === "review" && retestCount > 0 && <span className="dot">{retestCount}</span>}
          </button>
        ))}
      </nav>
    </div>
  );
}

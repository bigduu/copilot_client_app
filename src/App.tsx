import { useEffect, useState } from "react";
import { ConfigProvider, theme } from "antd";
import "./App.css";
import { ChatProvider } from "./contexts/ChatContext";
import { MainLayout } from "./layouts/MainLayout";
import { SystemSettingsModal } from "./components/SystemSettingsModal";

const DARK_MODE_KEY = "copilot_dark_mode";

function App() {
  const [themeMode, setThemeMode] = useState<"light" | "dark">(() => {
    return (localStorage.getItem(DARK_MODE_KEY) as "light" | "dark") || "light";
  });
  useEffect(() => {
    document.body.setAttribute("data-theme", themeMode);
  }, [themeMode]);

  // Control the display of settings modal (can be adjusted according to actual project logic)
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <ConfigProvider
      theme={{
        token: {
          colorPrimary: "#1677ff",
          borderRadius: 6,
        },
        algorithm:
          themeMode === "dark" ? theme.darkAlgorithm : theme.defaultAlgorithm,
      }}
    >
      <ChatProvider>
        <div style={{ position: "relative" }}>
          <MainLayout themeMode={themeMode} onThemeModeChange={setThemeMode} />
          <SystemSettingsModal
            open={settingsOpen}
            onClose={() => setSettingsOpen(false)}
            themeMode={themeMode}
            onThemeModeChange={setThemeMode}
          />
        </div>
      </ChatProvider>
    </ConfigProvider>
  );
}

export default App;

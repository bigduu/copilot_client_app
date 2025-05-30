import { useEffect, useState } from "react";
import { ConfigProvider, theme } from "antd";
import "./App.css";
import { MainLayout } from "./layouts/MainLayout";
import { ChatProvider, MessageProcessorProvider } from "./contexts/ChatView";
import { SystemSettingsModal } from "./components/Shared";

const DARK_MODE_KEY = "copilot_dark_mode";

function App() {
  const [themeMode, setThemeMode] = useState<"light" | "dark">(() => {
    return (localStorage.getItem(DARK_MODE_KEY) as "light" | "dark") || "light";
  });
  useEffect(() => {
    document.body.setAttribute("data-theme", themeMode);
  }, [themeMode]);

  // 控制设置弹窗的显示（可根据实际项目已有逻辑调整）
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
      <MessageProcessorProvider>
        <ChatProvider>
          <div style={{ position: "relative" }}>
            <MainLayout
              themeMode={themeMode}
              onThemeModeChange={setThemeMode}
            />
            <SystemSettingsModal
              open={settingsOpen}
              onClose={() => setSettingsOpen(false)}
              themeMode={themeMode}
              onThemeModeChange={setThemeMode}
            />
          </div>
        </ChatProvider>
      </MessageProcessorProvider>
    </ConfigProvider>
  );
}

export default App;

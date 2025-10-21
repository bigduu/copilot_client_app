import { useEffect, useState } from "react";
import { App as AntApp, ConfigProvider, theme } from "antd";
import "./App.css";
import { MainLayout } from "./layouts/MainLayout";
import { SystemSettingsModal } from "./components/SystemSettingsModal";
import { ChatControllerProvider } from "./contexts/ChatControllerContext";
import { useAppStore } from "./store";
import { SystemPromptService } from "./services/SystemPromptService";
import { StorageService } from "./services/StorageService";
import { UserSystemPrompt } from "./types/chat";

const DARK_MODE_KEY = "copilot_dark_mode";

function App() {
  const [themeMode, setThemeMode] = useState<"light" | "dark">(() => {
    return (localStorage.getItem(DARK_MODE_KEY) as "light" | "dark") || "light";
  });
  const loadSystemPrompts = useAppStore((state) => state.loadSystemPrompts);

  useEffect(() => {
    document.body.setAttribute("data-theme", themeMode);
  }, [themeMode]);

  // Synchronize backend prompts to local storage on startup
  useEffect(() => {
    const syncPrompts = async () => {
      const systemPromptService = SystemPromptService.getInstance();
      const storageService = new StorageService();

      try {
        const backendPrompts =
          await systemPromptService.getSystemPromptPresets();
        const localPrompts = await storageService.getSystemPrompts();

        const promptMap = new Map<string, UserSystemPrompt>();

        // Add local prompts first
        localPrompts.forEach((p) => promptMap.set(p.id, p));

        // Overwrite with backend prompts if IDs match, or add if new
        backendPrompts.forEach((p) => promptMap.set(p.id, p));

        const mergedPrompts = Array.from(promptMap.values());

        await storageService.saveSystemPrompts(mergedPrompts);
        console.log("System prompts synchronized with backend.");

        // Reload prompts in the store
        await loadSystemPrompts();
      } catch (error) {
        console.error("Failed to synchronize system prompts:", error);
        // Even if sync fails, load local prompts
        await loadSystemPrompts();
      }
    };

    syncPrompts();
  }, [loadSystemPrompts]);

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
      <AntApp>
        <ChatControllerProvider>
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
        </ChatControllerProvider>
      </AntApp>
    </ConfigProvider>
  );
}

export default App;

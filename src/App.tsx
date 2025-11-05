import { Profiler, useCallback, useEffect, useState } from "react";
import type { ProfilerOnRenderCallback } from "react";
import { App as AntApp, ConfigProvider, theme } from "antd";
import "./App.css";
import { MainLayout } from "./layouts/MainLayout";
import { SystemSettingsModal } from "./components/SystemSettingsModal";
import { ChatControllerProvider } from "./contexts/ChatControllerContext";
import { useAppStore } from "./store";
// Migration disabled per user request - not migrating historical data
// import { MigrationBanner } from "./components/MigrationBanner";
// import { localStorageMigrator } from "./utils/migration/LocalStorageMigrator";
// import { cleanupLegacyStorage } from "./utils/migration/cleanupLegacyStorage";

const DARK_MODE_KEY = "copilot_dark_mode";

function App() {
  const [themeMode, setThemeMode] = useState<"light" | "dark">(() => {
    return (localStorage.getItem(DARK_MODE_KEY) as "light" | "dark") || "light";
  });
  const loadSystemPrompts = useAppStore((state) => state.loadSystemPrompts);

  // Dev-only instrumentation to surface expensive renders during the ongoing
  // UI/UX refactor. Console output is gated behind the DEV flag to avoid
  // polluting production logs.
  const handleProfilerRender = useCallback<ProfilerOnRenderCallback>(
    (id, phase, actualDuration, baseDuration, startTime, commitTime) => {
      if (!import.meta.env.DEV) {
        return;
      }

      const frameBudgetMs = 16;
      if (actualDuration > frameBudgetMs) {
        // eslint-disable-next-line no-console -- Development-only performance trace
        console.info(
          `[Profiler:${id}] phase=${phase} actual=${actualDuration.toFixed(
            2,
          )}ms base=${baseDuration.toFixed(2)}ms start=${startTime.toFixed(
            2,
          )}ms commit=${commitTime.toFixed(2)}ms`,
        );
      }
    },
    [],
  );

  useEffect(() => {
    document.body.setAttribute("data-theme", themeMode);
  }, [themeMode]);

  // Migration disabled per user request - starting fresh without historical data
  // Users will create new chats using the backend Context Manager
  // useEffect(() => {
  //   const runMigration = async () => {
  //     try {
  //       const needed = await localStorageMigrator.needsMigration();
  //       if (!needed) return;
  //       const result = await localStorageMigrator.migrateAll();
  //       console.log("LocalStorage migration completed:", result);
  //       const cleanup = cleanupLegacyStorage();
  //       console.log("Legacy LocalStorage cleaned:", cleanup);
  //     } catch (err) {
  //       console.error("LocalStorage migration failed:", err);
  //     }
  //   };
  //   runMigration();
  // }, []);

  // Load prompts from backend via store on startup
  useEffect(() => {
    loadSystemPrompts();
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
            {import.meta.env.DEV ? (
              <Profiler id="MainLayout" onRender={handleProfilerRender}>
                <MainLayout
                  themeMode={themeMode}
                  onThemeModeChange={setThemeMode}
                />
              </Profiler>
            ) : (
              <MainLayout
                themeMode={themeMode}
                onThemeModeChange={setThemeMode}
              />
            )}
            {/* MigrationBanner removed - migration disabled per user request */}
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

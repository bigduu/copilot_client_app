import { Profiler, useCallback, useEffect, useState } from "react";
import type { ProfilerOnRenderCallback } from "react";
import { App as AntApp, ConfigProvider, theme } from "antd";
import { invoke } from "@tauri-apps/api/core";
import "./App.css";
import { MainLayout } from "./MainLayout";
import { SetupPage } from "../pages/SetupPage";
import { useAppStore, initializeStore } from "../pages/ChatPage/store";

const DARK_MODE_KEY = "copilot_dark_mode";
interface SetupStatus {
  is_complete: boolean;
  has_proxy_config: boolean;
  has_proxy_env: boolean;
  message: string;
}

function App() {
  const [themeMode, setThemeMode] = useState<"light" | "dark">(() => {
    return (localStorage.getItem(DARK_MODE_KEY) as "light" | "dark") || "light";
  });
  const [isSetupComplete, setIsSetupComplete] = useState<boolean | null>(null);
  const loadSystemPrompts = useAppStore((state) => state.loadSystemPrompts);

  useEffect(() => {
    const checkSetupStatus = async () => {
      try {
        const status = await invoke<SetupStatus>("get_setup_status");
        setIsSetupComplete(status.is_complete);
      } catch (error) {
        console.error("Failed to check setup status:", error);
        setIsSetupComplete(false);
      }
    };

    void checkSetupStatus();
  }, []);

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

  useEffect(() => {
    if (isSetupComplete) {
      loadSystemPrompts();
      initializeStore();
    }
  }, [isSetupComplete, loadSystemPrompts]);

  if (isSetupComplete === null) {
    return <div style={{ padding: 40, textAlign: "center" }}>Loading...</div>;
  }

  const appContent = isSetupComplete ? (
    import.meta.env.DEV ? (
      <Profiler id="MainLayout" onRender={handleProfilerRender}>
        <MainLayout themeMode={themeMode} onThemeModeChange={setThemeMode} />
      </Profiler>
    ) : (
      <MainLayout themeMode={themeMode} onThemeModeChange={setThemeMode} />
    )
  ) : (
    <SetupPage />
  );

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
        <div style={{ position: "relative" }}>{appContent}</div>
      </AntApp>
    </ConfigProvider>
  );
}

export default App;

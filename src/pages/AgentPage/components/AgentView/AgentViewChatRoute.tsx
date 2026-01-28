import React, { useCallback } from "react";
import { Alert, Flex, Layout } from "antd";

import type { ClaudeStreamMessage } from "../ClaudeStream";
import { AgentChatView } from "../AgentChatView";
import { ClaudeStreamPanel } from "../ClaudeStream";
import {
  extractTextFromParts,
  inferRole,
  isSystemInitEntry,
  isToolResultOnlyUserEntry,
  normalizeContentParts,
} from "../AgentChatView/agentChatViewUtils";
import { AgentHeader } from "./AgentHeader";
import type { QueuedPrompt } from "./AgentInputPanel";
import { AgentInputPanel } from "./AgentInputPanel";
import { AgentToolsDrawer } from "./AgentToolsDrawer";

const { Content } = Layout;

type AgentViewChatRouteProps = {
  token: any;
  resolvedProjectPath: string | null;
  runSessionId: string | null;
  selectedSessionId: string | null;
  queuedPrompts: QueuedPrompt[];
  view: "chat" | "debug";
  onViewChange: (next: "chat" | "debug") => void;
  onOpenTools: () => void;
  sessionTabs: Array<{
    key: string;
    label: string;
    running: boolean;
    isProject?: boolean;
  }>;
  activeSessionTab: string;
  onSessionTabChange: (key: string) => void;
  onReloadHistory: () => Promise<number>;
  onCancelRun: () => Promise<void>;
  canReloadHistory: boolean;
  isRunning: boolean;
  projectPathStatus: { valid: boolean | null; message?: string };
  error: string | null;
  history: ClaudeStreamMessage[];
  liveEntries: ClaudeStreamMessage[];
  outputText: string;
  mergedEntries: ClaudeStreamMessage[];
  liveTick: number;
  onAskUserAnswer: (payload: { prompt: string; sessionId?: string }) => void;
  model: string;
  thinkingMode: string;
  promptDraft: string;
  onModelChange: (value: string) => void;
  onThinkingModeChange: (value: string) => void;
  onPromptChange: (value: string) => void;
  onSendPrompt: () => void;
  onRemoveQueuedPrompt: (id: string) => void;
  toolsOpen: boolean;
  toolsTab: string;
  onCloseTools: () => void;
  onToolsTabChange: (next: string) => void;
  selectedProjectId: string | null;
  deriveProjectId: (path?: string | null) => string;
};

export const AgentViewChatRoute: React.FC<AgentViewChatRouteProps> = ({
  token,
  resolvedProjectPath,
  runSessionId,
  selectedSessionId,
  queuedPrompts,
  view,
  onViewChange,
  onOpenTools,
  sessionTabs,
  activeSessionTab,
  onSessionTabChange,
  onReloadHistory,
  onCancelRun,
  canReloadHistory,
  isRunning,
  projectPathStatus,
  error,
  history,
  liveEntries,
  outputText,
  mergedEntries,
  liveTick,
  onAskUserAnswer,
  model,
  thinkingMode,
  promptDraft,
  onModelChange,
  onThinkingModeChange,
  onPromptChange,
  onSendPrompt,
  onRemoveQueuedPrompt,
  toolsOpen,
  toolsTab,
  onCloseTools,
  onToolsTabChange,
  selectedProjectId,
  deriveProjectId,
}) => {
  const buildConversationText = useCallback(() => {
    const lines: string[] = [];
    mergedEntries.forEach((entry) => {
      if (isSystemInitEntry(entry)) return;
      if (isToolResultOnlyUserEntry(entry)) return;
      const parts = normalizeContentParts(entry.message?.content);
      const text = extractTextFromParts(parts).join("\n").trim();
      if (!text) return;
      lines.push(`${inferRole(entry)}: ${text}`);
    });
    return lines.join("\n\n");
  }, [mergedEntries]);

  const handleCopyConversation = useCallback(async () => {
    const text = buildConversationText();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    }
  }, [buildConversationText]);

  return (
    <Content
      style={{
        height: "100vh",
        overflow: "hidden",
        background: token.colorBgContainer,
      }}
    >
      <Flex
        vertical
        style={{
          height: "100%",
          padding: token.padding,
          gap: token.padding,
          overflow: "hidden",
        }}
      >
        <AgentHeader
          token={token}
          resolvedProjectPath={resolvedProjectPath}
          runSessionId={runSessionId}
          selectedSessionId={selectedSessionId}
          queuedCount={queuedPrompts.length}
          view={view}
          onViewChange={onViewChange}
          onOpenTools={onOpenTools}
          sessionTabs={sessionTabs}
          activeSessionTab={activeSessionTab}
          onSessionTabChange={onSessionTabChange}
          onReloadHistory={onReloadHistory}
          onCancelRun={onCancelRun}
          canReloadHistory={canReloadHistory}
          isRunning={isRunning}
        />

        {projectPathStatus.valid === false ? (
          <Alert
            type="warning"
            message={projectPathStatus.message || "Project path not found"}
            showIcon
          />
        ) : null}

        {error ? <Alert type="error" message={error} showIcon /> : null}

        <div style={{ minHeight: 0, flex: 1, overflow: "hidden" }}>
          {view === "debug" ? (
            <Flex style={{ gap: token.padding, minHeight: 0, height: "100%" }}>
              <ClaudeStreamPanel
                title="Session History"
                entries={history}
                rawText={history.length ? JSON.stringify(history, null, 2) : ""}
              />

              <ClaudeStreamPanel
                title="Live Output"
                entries={liveEntries}
                rawText={outputText}
                autoScroll
              />
            </Flex>
          ) : (
            <AgentChatView
              entries={mergedEntries}
              autoScrollToken={`${selectedSessionId ?? "none"}-${liveTick}`}
              onAskUserAnswer={onAskUserAnswer}
              isRunning={isRunning}
            />
          )}
        </div>

        <AgentInputPanel
          token={token}
          model={model}
          thinkingMode={thinkingMode}
          promptDraft={promptDraft}
          queuedPrompts={queuedPrompts}
          isRunning={isRunning}
          projectPathValid={projectPathStatus.valid === true}
          onModelChange={onModelChange}
          onThinkingModeChange={onThinkingModeChange}
          onPromptChange={onPromptChange}
          onSendPrompt={onSendPrompt}
          onRemoveQueuedPrompt={onRemoveQueuedPrompt}
          onOpenTools={onOpenTools}
          onToolsTabChange={onToolsTabChange}
          onCopyConversation={handleCopyConversation}
        />

        <AgentToolsDrawer
          open={toolsOpen}
          activeTab={toolsTab}
          onClose={onCloseTools}
          onTabChange={onToolsTabChange}
          sessionId={selectedSessionId}
          projectId={
            selectedProjectId ??
            deriveProjectId(resolvedProjectPath ?? undefined)
          }
          projectPath={resolvedProjectPath}
        />
      </Flex>
    </Content>
  );
};

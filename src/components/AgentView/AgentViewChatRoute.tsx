import React from "react";
import { Alert, Flex, Layout } from "antd";

import type { ClaudeStreamMessage } from "../ClaudeStream";
import { AgentChatView } from "../AgentChatView";
import { ClaudeStreamPanel } from "../ClaudeStream";
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
  onReloadHistory: () => Promise<number>;
  onCancelRun: () => Promise<void>;
  canReloadHistory: boolean;
  isRunning: boolean;
  onGoProjects: () => void;
  onGoSessions?: () => void;
  projectLabel: string | null;
  projectPathStatus: { valid: boolean | null; message?: string };
  error: string | null;
  history: ClaudeStreamMessage[];
  liveEntries: ClaudeStreamMessage[];
  outputText: string;
  mergedEntries: ClaudeStreamMessage[];
  liveTick: number;
  onAskUserAnswer: (payload: { prompt: string; sessionId?: string }) => void;
  model: string;
  promptDraft: string;
  onModelChange: (value: string) => void;
  onPromptChange: (value: string) => void;
  onSendPrompt: () => void;
  onStartRun: () => Promise<void>;
  onContinueRun: () => Promise<void>;
  onResumeRun: () => Promise<void>;
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
  onReloadHistory,
  onCancelRun,
  canReloadHistory,
  isRunning,
  onGoProjects,
  onGoSessions,
  projectLabel,
  projectPathStatus,
  error,
  history,
  liveEntries,
  outputText,
  mergedEntries,
  liveTick,
  onAskUserAnswer,
  model,
  promptDraft,
  onModelChange,
  onPromptChange,
  onSendPrompt,
  onStartRun,
  onContinueRun,
  onResumeRun,
  onRemoveQueuedPrompt,
  toolsOpen,
  toolsTab,
  onCloseTools,
  onToolsTabChange,
  selectedProjectId,
  deriveProjectId,
}) => {
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
          onReloadHistory={onReloadHistory}
          onCancelRun={onCancelRun}
          canReloadHistory={canReloadHistory}
          isRunning={isRunning}
          onGoProjects={onGoProjects}
          onGoSessions={onGoSessions}
          projectLabel={projectLabel}
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
          promptDraft={promptDraft}
          queuedPrompts={queuedPrompts}
          isRunning={isRunning}
          projectPathValid={projectPathStatus.valid === true}
          selectedSessionId={selectedSessionId}
          onModelChange={onModelChange}
          onPromptChange={onPromptChange}
          onSendPrompt={onSendPrompt}
          onStartRun={onStartRun}
          onContinueRun={onContinueRun}
          onResumeRun={onResumeRun}
          onRemoveQueuedPrompt={onRemoveQueuedPrompt}
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

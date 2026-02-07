import React, { useState, useMemo, useEffect, lazy, Suspense } from "react";
import { Space, theme, Tag, Alert, message as antdMessage, Spin } from "antd";
import { ToolOutlined, RobotOutlined } from "@ant-design/icons";
import { MessageInput } from "../MessageInput";
import InputPreview from "./InputPreview";
import { useChatStreaming } from "../../hooks/useChatManager/useChatStreaming";
import { selectCurrentChat, useAppStore } from "../../store";
import { useSystemPrompt } from "../../hooks/useSystemPrompt";
import { useChatInputHistory } from "../../hooks/useChatInputHistory";
import { useInputContainerWorkflow } from "./useInputContainerWorkflow";
import { useInputContainerFileReferences } from "./useInputContainerFileReferences";
import { useInputContainerAttachments } from "./useInputContainerAttachments";
import { useInputContainerSubmit } from "./useInputContainerSubmit";
import { useInputContainerHistory } from "./useInputContainerHistory";
import { getInputContainerPlaceholder } from "./inputContainerPlaceholder";

const FilePreview = lazy(() => import("../FilePreview"));
const WorkflowSelector = lazy(() => import("../WorkflowSelector"));
const WorkspacePathModal = lazy(() => import("../WorkspacePathModal"));
const FileReferenceSelector = lazy(() => import("../FileReferenceSelector"));

const { useToken } = theme;
const CHAT_SEND_MESSAGE_EVENT = "chat-send-message";

type ChatSendMessageEventDetail = {
  content: string;
  handled?: boolean;
  resolve?: () => void;
  reject?: (error: unknown) => void;
};

export type WorkflowDraft = {
  id: string;
  name: string;
  content: string;
  createdAt: string;
};

interface InputContainerProps {
  isCenteredLayout?: boolean;
  onWorkflowDraftChange?: (workflow: WorkflowDraft | null) => void;
}

export const InputContainer: React.FC<InputContainerProps> = ({
  isCenteredLayout = false,
  onWorkflowDraftChange,
}) => {
  const [content, setContent] = useState("");
  const [referenceText, setReferenceText] = useState<string | null>(null);
  const { token } = useToken();
  const currentChatId = useAppStore((state) => state.currentChatId);
  const currentChat = useAppStore(selectCurrentChat);
  const currentMessages = currentChat?.messages || [];
  const addMessage = useAppStore((state) => state.addMessage);
  const updateChat = useAppStore((state) => state.updateChat);
  const deleteMessage = useAppStore((state) => state.deleteMessage);
  const isProcessing = useAppStore((state) => state.isProcessing);
  const setProcessing = useAppStore((state) => state.setProcessing);

  const { sendMessage, cancel: cancelMessage, agentAvailable } = useChatStreaming({
    currentChat,
    addMessage,
    setProcessing,
    updateChat,
  });

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const handleExternalSend = (event: Event) => {
      const customEvent = event as CustomEvent<ChatSendMessageEventDetail>;
      if (!customEvent.detail) {
        return;
      }
      customEvent.detail.handled = true;
      const contentValue = customEvent.detail?.content;

      if (typeof contentValue !== "string" || contentValue.trim().length === 0) {
        customEvent.detail?.reject?.(
          new Error("External send message content is empty"),
        );
        return;
      }

      sendMessage(contentValue)
        .then(() => {
          customEvent.detail?.resolve?.();
        })
        .catch((error) => {
          customEvent.detail?.reject?.(error);
        });
    };

    window.addEventListener(CHAT_SEND_MESSAGE_EVENT, handleExternalSend as EventListener);

    return () => {
      window.removeEventListener(
        CHAT_SEND_MESSAGE_EVENT,
        handleExternalSend as EventListener,
      );
    };
  }, [sendMessage]);

  const isStreaming = isProcessing;
  const [messageApi, contextHolder] = antdMessage.useMessage();

  const systemPromptId = currentChat?.config.systemPromptId || null;
  useSystemPrompt(systemPromptId);

  const isToolSpecificMode = false;
  const isRestrictConversation = false;
  const allowedTools: string[] = [];
  const autoToolPrefix = undefined;

  const { recordEntry, navigate, acknowledgeManualInput } =
    useChatInputHistory(currentChatId);

  const {
    attachments,
    setAttachments,
    handleAttachmentsAdded,
    handleAttachmentRemove,
    handleClearAttachments,
  } = useInputContainerAttachments();

  const workflowState = useInputContainerWorkflow({
    setContent,
    onWorkflowDraftChange,
    acknowledgeManualInput,
    currentChatId,
  });

  const fileReferenceState = useInputContainerFileReferences({
    content,
    setContent,
    currentChatId,
    currentChat,
    updateChat,
    messageApi,
  });

  const { setShowFileSelector } = fileReferenceState;

  useEffect(() => {
    if (workflowState.showWorkflowSelector) {
      setShowFileSelector(false);
    }
  }, [workflowState.showWorkflowSelector, setShowFileSelector]);

  const { handleSubmit } = useInputContainerSubmit({
    attachments,
    selectedWorkflow: workflowState.selectedWorkflow,
    matchesWorkflowToken: workflowState.matchesWorkflowToken,
    fileReferences: fileReferenceState.fileReferences,
    sendMessage,
    recordEntry,
    clearWorkflowDraft: workflowState.clearWorkflowDraft,
    setContent,
    setReferenceText,
    setAttachments,
    setFileReferences: fileReferenceState.setFileReferences,
  });

  const { retryLastMessage, handleHistoryNavigate } = useInputContainerHistory({
    currentChatId,
    currentChat,
    currentMessages,
    deleteMessage,
    sendMessage,
    navigate,
  });

  // Agent status indicator config
  const agentStatusConfig = useMemo(() => {
    if (agentAvailable === null) {
      return { color: "default", icon: <RobotOutlined />, text: "Checking..." };
    }
    if (agentAvailable) {
      return { color: "success", icon: <RobotOutlined />, text: "Agent Mode" };
    }
    return { color: "red", icon: <RobotOutlined />, text: "Agent Unavailable" };
  }, [agentAvailable]);

  const handleCloseReferencePreview = () => setReferenceText(null);

  const placeholder = useMemo(() => {
    return getInputContainerPlaceholder({
      referenceText,
      isToolSpecificMode,
      isRestrictConversation,
      allowedTools,
      autoToolPrefix,
    });
  }, [
    referenceText,
    isToolSpecificMode,
    isRestrictConversation,
    allowedTools,
    autoToolPrefix,
  ]);

  return (
    <div
      style={{
        padding: `${token.paddingLG}px ${token.paddingMD}px`,
        minHeight: "80px",
        background: token.colorBgContainer,
        borderTop: isCenteredLayout
          ? "none"
          : `1px solid ${token.colorBorderSecondary}`,
        boxShadow: isCenteredLayout ? "none" : "0 -2px 8px rgba(0,0,0,0.06)",
        width: "100%",
        position: "relative",
        overflow: "visible",
      }}
    >
      {contextHolder}

      {/* Agent Status Indicator */}
      <div style={{ marginBottom: token.marginXS, display: "flex", justifyContent: "flex-end" }}>
        <Tag
          color={agentStatusConfig.color}
          icon={agentStatusConfig.icon}
          style={{ fontSize: "11px" }}
        >
          {agentStatusConfig.text}
        </Tag>
      </div>

      {isToolSpecificMode && (
        <Alert
          type={isRestrictConversation ? "warning" : "info"}
          showIcon
          style={{ marginBottom: token.marginSM }}
          message={
            <Space wrap>
              <span>
                {isRestrictConversation
                  ? "Strict Mode: Tool calls only"
                  : "Tool-specific Mode"}
              </span>
              {autoToolPrefix && (
                <Tag color="blue">
                  <ToolOutlined /> Auto-prefix: {autoToolPrefix}
                </Tag>
              )}
            </Space>
          }
          description={
            allowedTools.length > 0 && (
              <Space wrap>
                <span>Allowed tools:</span>
                {allowedTools.map((tool: string) => (
                  <Tag key={tool} color="green">
                    /{tool}
                  </Tag>
                ))}
              </Space>
            )
          }
        />
      )}

      {referenceText && (
        <InputPreview
          text={referenceText}
          onClose={handleCloseReferencePreview}
        />
      )}
      {attachments.length > 0 && (
        <Suspense fallback={<Spin size="small" />}>
          <FilePreview
            files={attachments}
            onRemove={handleAttachmentRemove}
            onClear={handleClearAttachments}
          />
        </Suspense>
      )}
      <MessageInput
        value={content}
        onChange={workflowState.handleInputChange}
        onSubmit={handleSubmit}
        placeholder={placeholder}
        allowImages={true}
        isWorkflowSelectorVisible={workflowState.showWorkflowSelector}
        validateMessage={(message) => {
          if (isRestrictConversation && autoToolPrefix) {
            const trimmed = message.trim();
            if (!trimmed.startsWith(autoToolPrefix)) {
              return {
                isValid: false,
                errorMessage: `Messages must start with '${autoToolPrefix}'.`,
              };
            }
          }
          return { isValid: true };
        }}
        onAttachmentsAdded={handleAttachmentsAdded}
        onWorkflowCommandChange={workflowState.handleWorkflowCommandChange}
        onFileReferenceChange={fileReferenceState.handleFileReferenceChange}
        onFileReferenceButtonClick={
          fileReferenceState.handleFileReferenceButtonClick
        }
        maxCharCount={8000}
        interaction={{
          isStreaming,
          hasMessages: currentMessages.length > 0,
          allowRetry: true,
          onRetry: retryLastMessage,
          onCancel: cancelMessage,
          onHistoryNavigate: handleHistoryNavigate,
        }}
      />

      <Suspense fallback={null}>
        <WorkflowSelector
          visible={workflowState.showWorkflowSelector}
          onSelect={workflowState.handleWorkflowSelect}
          onCancel={workflowState.handleWorkflowSelectorCancel}
          onAutoComplete={workflowState.handleAutoComplete}
          searchText={workflowState.workflowSearchText}
        />
      </Suspense>

      {fileReferenceState.showFileSelector && (
        <Suspense fallback={<Spin size="small" />}>
          <FileReferenceSelector
            visible={fileReferenceState.showFileSelector}
            files={fileReferenceState.workspaceFiles}
            searchText={fileReferenceState.fileSearchText}
            loading={fileReferenceState.isWorkspaceLoading}
            error={fileReferenceState.workspaceError}
            onSelect={fileReferenceState.handleFileReferenceSelect}
            onCancel={fileReferenceState.handleFileSelectorCancel}
            onChangeWorkspace={() => {
              fileReferenceState.setWorkspacePathInput(
                currentChat?.config.workspacePath ?? "",
              );
              fileReferenceState.setIsWorkspaceModalVisible(true);
            }}
          />
        </Suspense>
      )}

      <Suspense fallback={null}>
        <WorkspacePathModal
          open={fileReferenceState.isWorkspaceModalVisible}
          initialPath={fileReferenceState.workspacePathInput}
          loading={fileReferenceState.isSavingWorkspace}
          onSubmit={fileReferenceState.handleWorkspaceModalSubmit}
          onCancel={fileReferenceState.handleWorkspaceModalCancel}
        />
      </Suspense>
    </div>
  );
};

export default InputContainer;

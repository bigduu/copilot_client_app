import React, { useState, useMemo, useEffect, lazy, Suspense } from "react";
import { Space, theme, Tag, Alert, message as antdMessage, Spin } from "antd";
import { ToolOutlined } from "@ant-design/icons";
import { MessageInput } from "../MessageInput";
import InputPreview from "./InputPreview";
import { useChatOpenAIStreaming } from "../../hooks/useChatManager/useChatOpenAIStreaming";
import { useAppStore } from "../../store";
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
  const currentChat = useAppStore(
    (state) =>
      state.chats.find((chat) => chat.id === state.currentChatId) || null,
  );
  const currentMessages = useMemo(
    () => currentChat?.messages || [],
    [currentChat],
  );
  const updateChat = useAppStore((state) => state.updateChat);
  const addMessage = useAppStore((state) => state.addMessage);
  const deleteMessage = useAppStore((state) => state.deleteMessage);
  const setProcessing = useAppStore((state) => state.setProcessing);
  const isProcessing = useAppStore((state) => state.isProcessing);
  const { sendMessage, cancel } = useChatOpenAIStreaming({
    currentChat,
    addMessage,
    setProcessing,
  });
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
    content,
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
          onCancel: cancel,
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

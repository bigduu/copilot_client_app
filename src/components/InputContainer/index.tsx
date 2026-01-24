import React, {
  useState,
  useMemo,
  useCallback,
  useRef,
  useEffect,
  lazy,
  Suspense,
} from "react";
import { Space, theme, Tag, Alert, message as antdMessage, Spin } from "antd";
import { ToolOutlined } from "@ant-design/icons";
import { MessageInput } from "../MessageInput";
import InputPreview from "./InputPreview";
import { useChatOpenAIStreaming } from "../../hooks/useChatManager/useChatOpenAIStreaming";
import { useAppStore } from "../../store";
import { useSystemPrompt } from "../../hooks/useSystemPrompt";
import { WorkflowManagerService } from "../../services/WorkflowManagerService";
import { ImageFile } from "../../utils/imageUtils";
import { ProcessedFile, summarizeAttachments } from "../../utils/fileUtils";
import {
  FileReferenceInfo,
  WorkflowCommandInfo,
} from "../../utils/inputHighlight";
import { useChatInputHistory } from "../../hooks/useChatInputHistory";
import { WorkspaceFileEntry } from "../../types/workspace";
import type { UserFileReferenceMessage } from "../../types/chat";

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
  const [showWorkflowSelector, setShowWorkflowSelector] = useState(false);
  const [workflowSearchText, setWorkflowSearchText] = useState("");
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

  // TODO: selectedSystemPromptPresetId needs to be retrieved from the new store
  const selectedSystemPromptPresetId = null;

  // Use system prompt hook instead of direct service
  const systemPromptId =
    currentChat?.config.systemPromptId || selectedSystemPromptPresetId;
  // Note: currentSystemPromptInfo is fetched but not used in simplified version
  useSystemPrompt(systemPromptId);

  // Simplified: No longer using tool-specific mode restrictions
  // All tool management is now handled by backend categories
  const isToolSpecificMode = false;
  const isRestrictConversation = false;
  const allowedTools: string[] = [];
  const autoToolPrefix = undefined;

  // Removed lock functionality since everything is controlled by categories

  // Use the new chat input hook for state management
  // State management for the input itself
  const [content, setContent] = useState("");
  const [selectedWorkflow, setSelectedWorkflow] =
    useState<WorkflowDraft | null>(null);
  const [referenceText, setReferenceText] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<ProcessedFile[]>([]);
  const [workspaceFiles, setWorkspaceFiles] = useState<WorkspaceFileEntry[]>(
    [],
  );
  const [isWorkspaceModalVisible, setIsWorkspaceModalVisible] = useState(false);
  const [workspacePathInput, setWorkspacePathInput] = useState("");
  const [isWorkspaceLoading, setIsWorkspaceLoading] = useState(false);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [showFileSelector, setShowFileSelector] = useState(false);
  const [fileSearchText, setFileSearchText] = useState("");
  const [isSavingWorkspace, setIsSavingWorkspace] = useState(false);
  const lastWorkspacePathRef = useRef<string | null>(null);
  const { recordEntry, navigate, acknowledgeManualInput } =
    useChatInputHistory(currentChatId);

  const retryLastMessage = useCallback(async () => {
    if (!currentChatId || !currentChat) return;
    const history = [...currentMessages];
    if (history.length === 0) return;

    const lastMessage = history[history.length - 1];
    let trimmedHistory = history;
    if (lastMessage?.role === "assistant") {
      deleteMessage(currentChatId, lastMessage.id);
      trimmedHistory = history.slice(0, -1);
    }

    const lastUser = [...trimmedHistory]
      .reverse()
      .find((msg) => msg.role === "user");
    if (!lastUser) return;

    const content =
      "content" in lastUser
        ? lastUser.content
        : (lastUser as UserFileReferenceMessage).displayText;
    if (typeof content !== "string") return;

    await sendMessage(content);
  }, [currentChat, currentChatId, currentMessages, deleteMessage, sendMessage]);

  const handleCancel = useCallback(() => {
    cancel();
  }, [cancel]);

  // Track file references: map from @token in text to actual file info
  const [fileReferences, setFileReferences] = useState<
    Map<string, WorkspaceFileEntry>
  >(new Map());

  useEffect(() => {
    if (isWorkspaceModalVisible) {
      setWorkspacePathInput(currentChat?.config.workspacePath ?? "");
    }
  }, [isWorkspaceModalVisible, currentChat?.config.workspacePath]);

  useEffect(() => {
    setShowFileSelector(false);
    setFileSearchText("");
    setWorkspaceFiles([]);
    setFileReferences(new Map()); // Clear file references when chat changes
    lastWorkspacePathRef.current = currentChat?.config.workspacePath ?? null;
    setSelectedWorkflow(null);
    onWorkflowDraftChange?.(null);
  }, [currentChatId, currentChat?.config.workspacePath, onWorkflowDraftChange]);

  useEffect(() => {
    if (showWorkflowSelector) {
      setShowFileSelector(false);
    }
  }, [showWorkflowSelector]);

  const clearWorkflowDraft = useCallback(() => {
    setSelectedWorkflow(null);
    onWorkflowDraftChange?.(null);
  }, [onWorkflowDraftChange]);

  const matchesWorkflowToken = (value: string, workflowName: string) => {
    const trimmedValue = value.trimStart();
    const token = `/${workflowName}`;
    if (!trimmedValue.startsWith(token)) {
      return false;
    }
    const nextChar = trimmedValue.charAt(token.length);
    return !nextChar || /\s/.test(nextChar);
  };

  // Create a new handleSubmit that uses our new hook
  const handleSubmit = (message: string, images?: ImageFile[]) => {
    const trimmedInput = message.trim();
    const attachmentSummary = summarizeAttachments(attachments);
    let composedInput = trimmedInput;

    if (selectedWorkflow?.content) {
      const token = `/${selectedWorkflow.name}`;
      const hasToken = matchesWorkflowToken(
        trimmedInput,
        selectedWorkflow.name,
      );
      if (hasToken) {
        const extraInput = trimmedInput.slice(token.length).trim();
        composedInput = [selectedWorkflow.content, extraInput]
          .filter(Boolean)
          .join("\n\n");
      }
    }

    if (
      !composedInput &&
      !attachmentSummary &&
      (!images || images.length === 0)
    ) {
      return;
    }

    const composedMessage = [composedInput, attachmentSummary]
      .filter(Boolean)
      .join("\n\n");

    recordEntry(composedMessage);

    if (fileReferences.size > 0) {
      // Check if message contains file references (@filename)
      const fileRefMatches = Array.from(composedMessage.matchAll(/@([^\s]+)/g));

      if (fileRefMatches.length > 0) {
        // ✅ Collect all referenced files
        const referencedFiles: WorkspaceFileEntry[] = [];
        for (const match of fileRefMatches) {
          const fileName = match[1];
          const fileEntry = fileReferences.get(fileName);
          if (fileEntry) {
            referencedFiles.push(fileEntry);
          }
        }

        if (referencedFiles.length > 0) {
          // Send structured file reference message with multiple paths
          const structuredMessage = JSON.stringify({
            type: "file_reference",
            paths: referencedFiles.map((f) => f.path), // ✅ Array of paths
            display_text: composedMessage,
          });
          sendMessage(structuredMessage, images);
        } else {
          // Fallback to plain text if no valid references found
          sendMessage(composedMessage, images);
        }
      } else {
        // No file references, send as plain text
        sendMessage(composedMessage, images);
      }
    } else {
      // No special handling, send as plain text
      sendMessage(composedMessage, images);
    }

    setContent("");
    clearWorkflowDraft();
    setReferenceText(null); // Clear reference after sending
    setAttachments([]);
    setFileReferences(new Map()); // Clear file references
  };

  const handleAttachmentsAdded = useCallback((files: ProcessedFile[]) => {
    setAttachments((prev) => [...prev, ...files]);
  }, []);

  const handleAttachmentRemove = useCallback((fileId: string) => {
    setAttachments((prev) => prev.filter((file) => file.id !== fileId));
  }, []);

  const handleClearAttachments = useCallback(() => {
    setAttachments([]);
  }, []);

  // Dummy functions to satisfy props, will be cleaned up
  const handleCloseReferencePreview = () => setReferenceText(null);

  // Handle input changes to detect workflow selector trigger
  const handleInputChange = (value: string) => {
    acknowledgeManualInput();
    if (
      selectedWorkflow &&
      !matchesWorkflowToken(value, selectedWorkflow.name)
    ) {
      clearWorkflowDraft();
    }
    setContent(value);
  };

  const fetchWorkspaceFiles = useCallback(
    async (_chatId: string, workspacePath: string) => {
      setIsWorkspaceLoading(true);
      setWorkspaceFiles([]);
      setWorkspaceError("Workspace file browsing is unavailable.");
      lastWorkspacePathRef.current = workspacePath;
      setIsWorkspaceLoading(false);
    },
    [],
  );

  const handleFileReferenceChange = useCallback(
    (info: FileReferenceInfo) => {
      setFileSearchText(info.searchText);

      if (!info.isTriggerActive) {
        setShowFileSelector(false);
        return;
      }

      if (!currentChatId || !currentChat) {
        setShowFileSelector(false);
        return;
      }

      const workspacePath = currentChat.config.workspacePath;

      if (!workspacePath) {
        setWorkspacePathInput("");
        setIsWorkspaceModalVisible(true);
        setShowFileSelector(false);
        return;
      }

      setShowFileSelector(true);

      if (
        lastWorkspacePathRef.current !== workspacePath ||
        workspaceFiles.length === 0
      ) {
        fetchWorkspaceFiles(currentChatId, workspacePath);
      }
    },
    [currentChat, currentChatId, fetchWorkspaceFiles, workspaceFiles.length],
  );

  const handleWorkflowCommandChange = useCallback(
    (info: WorkflowCommandInfo) => {
      setShowWorkflowSelector(info.isTriggerActive);
      setWorkflowSearchText(info.isTriggerActive ? info.searchText : "");
    },
    [],
  );

  const handleHistoryNavigate = useCallback(
    (direction: "previous" | "next", currentValue: string): string | null => {
      const result = navigate(direction, currentValue);
      if (!result.applied) {
        return null;
      }
      return result.value;
    },
    [navigate],
  );

  const handleWorkflowSelect = useCallback(
    (workflow: { name: string; content: string }) => {
      setShowWorkflowSelector(false);
      const nextContent = workflow.content?.trim();
      setContent(`/${workflow.name} `);
      if (nextContent) {
        const draft: WorkflowDraft = {
          id: `workflow-draft-${workflow.name}`,
          name: workflow.name,
          content: nextContent,
          createdAt: new Date().toISOString(),
        };
        setSelectedWorkflow(draft);
        onWorkflowDraftChange?.(draft);
      } else {
        clearWorkflowDraft();
      }
    },
    [clearWorkflowDraft, onWorkflowDraftChange],
  );

  const handleWorkflowSelectorCancel = useCallback(() => {
    setShowWorkflowSelector(false);
  }, []);

  const handleAutoComplete = useCallback(
    async (workflowName: string) => {
      setShowWorkflowSelector(false);
      try {
        const workflowService = WorkflowManagerService.getInstance();
        const workflow = await workflowService.getWorkflow(workflowName);
        const nextContent = workflow.content?.trim();
        setContent(`/${workflow.name} `);
        if (nextContent) {
          const draft: WorkflowDraft = {
            id: `workflow-draft-${workflow.name}`,
            name: workflow.name,
            content: nextContent,
            createdAt: new Date().toISOString(),
          };
          setSelectedWorkflow(draft);
          onWorkflowDraftChange?.(draft);
        } else {
          clearWorkflowDraft();
        }
      } catch (error) {
        console.error(
          `[InputContainer] Failed to load workflow '${workflowName}' in auto-complete:`,
          error,
        );
        setContent(`/${workflowName} `);
        clearWorkflowDraft();
      }
    },
    [clearWorkflowDraft, onWorkflowDraftChange],
  );

  const handleFileReferenceSelect = useCallback(
    (file: WorkspaceFileEntry) => {
      // 检查是否有 @ 符号，如果有则替换，如果没有则添加到末尾
      const atIndex = content.lastIndexOf("@");
      let newContent: string;

      if (
        atIndex >= 0 &&
        content.substring(atIndex).match(/^@[a-zA-Z0-9._\-\/\\]*$/)
      ) {
        // 如果输入框以 @token 结尾，则替换它
        const before = content.slice(0, atIndex);
        newContent = `${before}@${file.name} `;
      } else {
        // 如果没有 @token，则在末尾添加 @文件名
        newContent = content.trim()
          ? `${content.trim()} @${file.name} `
          : `@${file.name} `;
      }

      setContent(newContent);

      // Store the file reference mapping
      setFileReferences((prev) => {
        const newMap = new Map(prev);
        newMap.set(file.name, file);
        return newMap;
      });

      setShowFileSelector(false);
      setFileSearchText("");
    },
    [content],
  );

  const handleFileSelectorCancel = useCallback(() => {
    setShowFileSelector(false);
  }, []);

  const handleFileReferenceButtonClick = useCallback(() => {
    if (!currentChatId || !currentChat) {
      return;
    }

    const workspacePath = currentChat.config.workspacePath;

    if (!workspacePath) {
      // 如果没有设置 workspace，显示设置对话框
      setWorkspacePathInput("");
      setIsWorkspaceModalVisible(true);
      setShowFileSelector(false);
      return;
    }

    // 如果有 workspace，直接显示文件选择器
    setFileSearchText("");
    setShowFileSelector(true);

    // 加载 workspace 文件列表（如果需要）
    if (
      lastWorkspacePathRef.current !== workspacePath ||
      workspaceFiles.length === 0
    ) {
      fetchWorkspaceFiles(currentChatId, workspacePath);
    }
  }, [currentChat, currentChatId, fetchWorkspaceFiles, workspaceFiles.length]);

  const handleWorkspaceModalCancel = useCallback(() => {
    setIsWorkspaceModalVisible(false);
    setWorkspacePathInput("");
  }, []);

  const handleWorkspaceModalSubmit = useCallback(
    async (path: string) => {
      if (!currentChat || !currentChatId) return;
      const trimmedPath = path.trim();
      if (!trimmedPath) {
        messageApi.error("Workspace 路径不能为空");
        return;
      }

      setIsSavingWorkspace(true);
      try {
        updateChat(currentChatId, {
          config: {
            ...currentChat.config,
            workspacePath: trimmedPath,
          },
        });

        setIsWorkspaceModalVisible(false);
        setWorkspacePathInput("");
        setShowFileSelector(false);
        setWorkspaceError(null);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "无法保存 workspace 路径";
        messageApi.error(errorMessage);
      } finally {
        setIsSavingWorkspace(false);
      }
    },
    [currentChat, currentChatId, fetchWorkspaceFiles, messageApi, updateChat],
  );

  const placeholder = useMemo(() => {
    if (referenceText) {
      return "Send a message (includes reference)";
    }

    if (isToolSpecificMode) {
      if (isRestrictConversation) {
        return `Tool calls only (allowed tools: ${allowedTools.join(", ")})`;
      } else if (autoToolPrefix) {
        return `Auto-prefix mode: ${autoToolPrefix} (type '/' to select tools)`;
      } else {
        return `Tool-specific mode (allowed tools: ${allowedTools.join(", ")})`;
      }
    }

    return "Send a message... (type '/' for workflows)";
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
      {/* Ant Design message context holder */}
      {contextHolder}

      {/* Agent Role Selector removed - now only shown in ChatView header */}

      {/* Tool-specific mode alert */}
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
        onChange={handleInputChange}
        onSubmit={handleSubmit}
        placeholder={placeholder}
        allowImages={true}
        isWorkflowSelectorVisible={showWorkflowSelector}
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
        onWorkflowCommandChange={handleWorkflowCommandChange}
        onFileReferenceChange={handleFileReferenceChange}
        onFileReferenceButtonClick={handleFileReferenceButtonClick}
        maxCharCount={8000}
        interaction={{
          isStreaming,
          hasMessages: currentMessages.length > 0,
          allowRetry: true,
          onRetry: retryLastMessage,
          onCancel: handleCancel,
          onHistoryNavigate: handleHistoryNavigate,
        }}
      />

      <Suspense fallback={null}>
        <WorkflowSelector
          visible={showWorkflowSelector}
          onSelect={handleWorkflowSelect}
          onCancel={handleWorkflowSelectorCancel}
          onAutoComplete={handleAutoComplete}
          searchText={workflowSearchText}
        />
      </Suspense>

      {showFileSelector && (
        <Suspense fallback={<Spin size="small" />}>
          <FileReferenceSelector
            visible={showFileSelector}
            files={workspaceFiles}
            searchText={fileSearchText}
            loading={isWorkspaceLoading}
            error={workspaceError}
            onSelect={handleFileReferenceSelect}
            onCancel={handleFileSelectorCancel}
            onChangeWorkspace={() => {
              setWorkspacePathInput(currentChat?.config.workspacePath ?? "");
              setIsWorkspaceModalVisible(true);
            }}
          />
        </Suspense>
      )}

      <Suspense fallback={null}>
        <WorkspacePathModal
          open={isWorkspaceModalVisible}
          initialPath={workspacePathInput}
          loading={isSavingWorkspace}
          onSubmit={handleWorkspaceModalSubmit}
          onCancel={handleWorkspaceModalCancel}
        />
      </Suspense>
    </div>
  );
};

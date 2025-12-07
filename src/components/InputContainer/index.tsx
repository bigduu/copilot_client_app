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
import { useChatController } from "../../contexts/ChatControllerContext";
import { useSystemPrompt } from "../../hooks/useSystemPrompt";
import { WorkflowManagerService } from "../../services/WorkflowManagerService";
import {
  BackendContextService,
  WorkspaceFileEntry,
} from "../../services/BackendContextService";
import { ImageFile } from "../../utils/imageUtils";
import { ProcessedFile, summarizeAttachments } from "../../utils/fileUtils";
import {
  WorkflowCommandInfo,
  FileReferenceInfo,
} from "../../utils/inputHighlight";
import { useChatInputHistory } from "../../hooks/useChatInputHistory";

const FilePreview = lazy(() => import("../FilePreview"));
const WorkflowSelector = lazy(() => import("../WorkflowSelector"));
const WorkspacePathModal = lazy(() => import("../WorkspacePathModal"));
const FileReferenceSelector = lazy(() => import("../FileReferenceSelector"));

const { useToken } = theme;

interface InputContainerProps {
  isCenteredLayout?: boolean;
}

export const InputContainer: React.FC<InputContainerProps> = ({
  isCenteredLayout = false,
}) => {
  const [showWorkflowSelector, setShowWorkflowSelector] = useState(false);
  const [workflowSearchText, setWorkflowSearchText] = useState("");
  const [currentWorkflow, setCurrentWorkflow] = useState<{
    name: string;
    content: string;
  } | null>(null);
  const { token } = useToken();
  const {
    currentMessages,
    currentChat,
    currentChatId,
    interactionState,
    sendMessage,
    retryLastMessage,
    send,
    updateChat,
  } = useChatController();

  const isStreaming = interactionState.matches("THINKING");
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
  const [referenceText, setReferenceText] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<ProcessedFile[]>([]);
  const [workspaceFiles, setWorkspaceFiles] = useState<WorkspaceFileEntry[]>(
    []
  );
  const [isWorkspaceModalVisible, setIsWorkspaceModalVisible] = useState(false);
  const [workspacePathInput, setWorkspacePathInput] = useState("");
  const [isWorkspaceLoading, setIsWorkspaceLoading] = useState(false);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [showFileSelector, setShowFileSelector] = useState(false);
  const [fileSearchText, setFileSearchText] = useState("");
  const [isSavingWorkspace, setIsSavingWorkspace] = useState(false);
  const backendServiceRef = useMemo(() => new BackendContextService(), []);
  const lastWorkspacePathRef = useRef<string | null>(null);
  const { recordEntry, navigate, acknowledgeManualInput } =
    useChatInputHistory(currentChatId);

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
  }, [currentChatId, currentChat?.config.workspacePath]);

  useEffect(() => {
    if (showWorkflowSelector) {
      setShowFileSelector(false);
    }
  }, [showWorkflowSelector]);

  // Create a new handleSubmit that uses our new hook
  const handleSubmit = (message: string, images?: ImageFile[]) => {
    const trimmedContent = message.trim();
    const attachmentSummary = summarizeAttachments(attachments);
    if (
      !trimmedContent &&
      !attachmentSummary &&
      (!images || images.length === 0)
    ) {
      return;
    }

    const composedMessage = [trimmedContent, attachmentSummary]
      .filter(Boolean)
      .join("\n\n");

    recordEntry(composedMessage);

    // Check if this is a workflow message
    if (currentWorkflow) {
      console.log("[InputContainer] Sending workflow message:", currentWorkflow.name);
      // Send workflow message with full content (not just the name shown in input)
      const structuredMessage = JSON.stringify({
        type: "workflow",
        workflow: currentWorkflow.name,  // Backend expects "workflow", not "workflow_name"
        content: currentWorkflow.content,  // Use full workflow content
        display_text: currentWorkflow.content,
      });
      console.log("[InputContainer] Workflow payload:", structuredMessage);
      sendMessage(structuredMessage, images);
      setCurrentWorkflow(null); // Clear workflow after sending
      console.log("[InputContainer] currentWorkflow cleared after send");
    } else if (fileReferences.size > 0) {
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
    setContent(value);
  };

  const fetchWorkspaceFiles = useCallback(
    async (chatId: string, workspacePath: string) => {
      setIsWorkspaceLoading(true);
      try {
        const response = await backendServiceRef.getWorkspaceFiles(chatId);
        setWorkspaceFiles(response.files);
        setWorkspaceError(null);
        lastWorkspacePathRef.current = workspacePath;
      } catch (error) {
        const messageText =
          error instanceof Error ? error.message : "Unknown error";
        setWorkspaceError(messageText);
        setWorkspaceFiles([]);
      } finally {
        setIsWorkspaceLoading(false);
      }
    },
    []
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
    [currentChat, currentChatId, fetchWorkspaceFiles, workspaceFiles.length]
  );

  const handleWorkflowCommandChange = useCallback(
    (info: WorkflowCommandInfo) => {
      setShowWorkflowSelector(info.isTriggerActive);
      setWorkflowSearchText(info.isTriggerActive ? info.searchText : "");
    },
    []
  );

  const handleHistoryNavigate = useCallback(
    (direction: "previous" | "next", currentValue: string): string | null => {
      const result = navigate(direction, currentValue);
      if (!result.applied) {
        return null;
      }
      return result.value;
    },
    [navigate]
  );

  // Handle workflow selection
  const handleWorkflowSelect = async (workflow: {
    name: string;
    content: string;
  }) => {
    console.log("[InputContainer] Workflow selected:", workflow.name);
    setShowWorkflowSelector(false);

    // Only show workflow name in input, not full content
    setContent(`/${workflow.name}`);

    // Store workflow metadata (including full content) for message submission
    setCurrentWorkflow({
      name: workflow.name,
      content: workflow.content,
    });
    
    console.log("[InputContainer] currentWorkflow set to:", workflow.name);
  };


  // Monitor content changes - reset workflow if user deletes the workflow name
  useEffect(() => {
    if (currentWorkflow) {
      const contentTrimmed = content.trim();
      const workflowPrefix = `/${currentWorkflow.name}`;
      
      // Only clear workflow if:
      // 1. Content is completely empty, OR
      // 2. User removed the workflow name (doesn't start with /workflowname anymore)
      if (!contentTrimmed || !contentTrimmed.startsWith(workflowPrefix)) {
        console.log("[InputContainer] Workflow name removed, clearing currentWorkflow");
        setCurrentWorkflow(null);
      }
    }
  }, [content, currentWorkflow]);


  // Handle workflow selector cancel
  const handleWorkflowSelectorCancel = () => {
    setShowWorkflowSelector(false);
  };

  // Handle auto-completion (space/tab key) - should also select the workflow
  const handleAutoComplete = async (workflowName: string) => {
    console.log("[InputContainer] Auto-complete triggered for workflow:", workflowName);
    setShowWorkflowSelector(false);

    try {
      // Fetch workflow content
      const workflowService = WorkflowManagerService.getInstance();
      const workspacePath = currentChat?.config.workspacePath;
      const workflow = await workflowService.getWorkflow(
        workflowName,
        workspacePath
      );

      // Only show workflow name in input, not full content
      setContent(`/${workflow.name}`);

      // Store workflow metadata (including full content) for message submission
      setCurrentWorkflow({
        name: workflow.name,
        content: workflow.content,
      });

      console.log("[InputContainer] Auto-complete: currentWorkflow set to:", workflow.name);
    } catch (error) {
      console.error(
        `[InputContainer] Failed to load workflow '${workflowName}' in auto-complete:`,
        error
      );
      // Fallback: just insert the workflow name
      const slashIndex = content.lastIndexOf("/");
      const beforeSlash = content.substring(0, slashIndex);
      setContent(`${beforeSlash}/${workflowName}`);
    }
  };



  const handleFileReferenceSelect = useCallback(
    (file: WorkspaceFileEntry) => {
      // 检查是否有 @ 符号，如果有则替换，如果没有则添加到末尾
      const atIndex = content.lastIndexOf("@");
      let newContent: string;

      if (atIndex >= 0 && content.substring(atIndex).match(/^@[a-zA-Z0-9._\-\/\\]*$/)) {
        // 如果输入框以 @token 结尾，则替换它
        const before = content.slice(0, atIndex);
        newContent = `${before}@${file.name} `;
      } else {
        // 如果没有 @token，则在末尾添加 @文件名
        newContent = content.trim() ? `${content.trim()} @${file.name} ` : `@${file.name} `;
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
    [content]
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
        const response = await backendServiceRef.setWorkspacePath(
          currentChatId,
          trimmedPath
        );
        const normalizedPath = response.workspace_path || trimmedPath;

        updateChat(currentChatId, {
          config: {
            ...currentChat.config,
            workspacePath: normalizedPath,
          },
        });

        setIsWorkspaceModalVisible(false);
        setWorkspacePathInput("");
        await fetchWorkspaceFiles(currentChatId, normalizedPath);
        setShowFileSelector(true);
        setWorkspaceError(null);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "无法保存 workspace 路径";
        messageApi.error(errorMessage);
      } finally {
        setIsSavingWorkspace(false);
      }
    },
    [currentChat, currentChatId, fetchWorkspaceFiles, messageApi, updateChat]
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
          onCancel: () => send({ type: "CANCEL" }),
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

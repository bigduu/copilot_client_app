import { useCallback, useEffect, useRef, useState } from "react";
import type { MessageInstance } from "antd/es/message/interface";
import type { FileReferenceInfo } from "../../utils/inputHighlight";
import type { WorkspaceFileEntry } from "../../types/workspace";
import { workspaceApiService } from "../../services/WorkspaceApiService";

interface UseInputContainerFileReferencesProps {
  content: string;
  setContent: (value: string) => void;
  currentChatId: string | null;
  currentChat: any | null;
  updateChat: (chatId: string, update: any) => void;
  messageApi: MessageInstance;
}

export const useInputContainerFileReferences = ({
  content,
  setContent,
  currentChatId,
  currentChat,
  updateChat,
  messageApi,
}: UseInputContainerFileReferencesProps) => {
  const [fileReferences, setFileReferences] = useState<
    Map<string, WorkspaceFileEntry>
  >(new Map());
  const [workspaceFiles, setWorkspaceFiles] = useState<WorkspaceFileEntry[]>(
    [],
  );
  const [showFileSelector, setShowFileSelector] = useState(false);
  const [fileSearchText, setFileSearchText] = useState("");
  const [isWorkspaceModalVisible, setIsWorkspaceModalVisible] = useState(false);
  const [workspacePathInput, setWorkspacePathInput] = useState("");
  const [isWorkspaceLoading, setIsWorkspaceLoading] = useState(false);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [isSavingWorkspace, setIsSavingWorkspace] = useState(false);
  const lastWorkspacePathRef = useRef<string | null>(null);

  useEffect(() => {
    if (isWorkspaceModalVisible) {
      setWorkspacePathInput(currentChat?.config.workspacePath ?? "");
    }
  }, [isWorkspaceModalVisible, currentChat?.config.workspacePath]);

  useEffect(() => {
    setShowFileSelector(false);
    setFileSearchText("");
    setWorkspaceFiles([]);
    setFileReferences(new Map());
    lastWorkspacePathRef.current = currentChat?.config.workspacePath ?? null;
  }, [currentChatId, currentChat?.config.workspacePath]);

  const fetchWorkspaceFiles = useCallback(
    async (_chatId: string, workspacePath: string) => {
      setIsWorkspaceLoading(true);
      setWorkspaceFiles([]);
      setWorkspaceError(null);
      try {
        const files = await workspaceApiService.listWorkspaceFiles(
          workspacePath,
        );
        setWorkspaceFiles(files);
        lastWorkspacePathRef.current = workspacePath;
      } catch (error) {
        console.error("Failed to load workspace files:", error);
        setWorkspaceError(
          error instanceof Error
            ? error.message
            : "Workspace file browsing is unavailable.",
        );
      } finally {
        setIsWorkspaceLoading(false);
      }
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

  const handleFileReferenceSelect = useCallback(
    (file: WorkspaceFileEntry) => {
      const atIndex = content.lastIndexOf("@");
      let newContent: string;

      if (
        atIndex >= 0 &&
        content.substring(atIndex).match(/^@[a-zA-Z0-9._\\-\\/\\\\]*$/)
      ) {
        const before = content.slice(0, atIndex);
        newContent = `${before}@${file.name} `;
      } else {
        newContent = content.trim()
          ? `${content.trim()} @${file.name} `
          : `@${file.name} `;
      }

      setContent(newContent);

      setFileReferences((prev) => {
        const newMap = new Map(prev);
        newMap.set(file.name, file);
        return newMap;
      });

      setShowFileSelector(false);
      setFileSearchText("");
    },
    [content, setContent],
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
      setWorkspacePathInput("");
      setIsWorkspaceModalVisible(true);
      setShowFileSelector(false);
      return;
    }

    setFileSearchText("");
    setShowFileSelector(true);

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
        messageApi.error("Workspace path cannot be empty");
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
          error instanceof Error ? error.message : "Unable to save workspace path";
        messageApi.error(errorMessage);
      } finally {
        setIsSavingWorkspace(false);
      }
    },
    [currentChat, currentChatId, messageApi, updateChat],
  );

  return {
    fileReferences,
    setFileReferences,
    workspaceFiles,
    showFileSelector,
    setShowFileSelector,
    fileSearchText,
    isWorkspaceLoading,
    workspaceError,
    isWorkspaceModalVisible,
    workspacePathInput,
    isSavingWorkspace,
    setWorkspacePathInput,
    setIsWorkspaceModalVisible,
    handleFileReferenceChange,
    handleFileReferenceSelect,
    handleFileSelectorCancel,
    handleFileReferenceButtonClick,
    handleWorkspaceModalCancel,
    handleWorkspaceModalSubmit,
    fetchWorkspaceFiles,
  };
};

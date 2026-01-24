import { useCallback, useEffect, useRef, useState } from "react";
import { message } from "antd";
import {
  workspaceValidator,
  type WorkspaceValidationResult,
} from "../../utils/workspaceValidator";
import {
  recentWorkspacesManager,
  type WorkspaceInfo,
} from "../../services/RecentWorkspacesManager";
import {
  workspaceApiService,
  type PathSuggestion,
} from "../../services/WorkspaceApiService";

interface ValidationStatus {
  isValidating: boolean;
  result: WorkspaceValidationResult | null;
}

interface UseWorkspacePickerStateProps {
  value?: string;
  onChange?: (path: string) => void;
  showRecentWorkspaces: boolean;
  showSuggestions: boolean;
  onValidationChange?: (result: WorkspaceValidationResult | null) => void;
}

export const useWorkspacePickerState = ({
  value = "",
  onChange,
  showRecentWorkspaces,
  showSuggestions,
  onValidationChange,
}: UseWorkspacePickerStateProps) => {
  const [path, setPath] = useState(value);
  const [validationStatus, setValidationStatus] = useState<ValidationStatus>({
    isValidating: false,
    result: null,
  });
  const [recentWorkspaces, setRecentWorkspaces] = useState<WorkspaceInfo[]>([]);
  const [folderBrowserVisible, setFolderBrowserVisible] = useState(false);
  const [suggestions, setSuggestions] = useState<PathSuggestion[]>([]);
  const [isLoadingRecent, setIsLoadingRecent] = useState(false);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);

  const abortControllerRef = useRef<AbortController | null>(null);
  const debouncedValidateRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    setPath(value);
  }, [value]);

  useEffect(() => {
    if (showRecentWorkspaces) {
      loadRecentWorkspaces();
    }
    if (showSuggestions) {
      loadSuggestions();
    }

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (debouncedValidateRef.current) {
        debouncedValidateRef.current();
      }
    };
  }, [showRecentWorkspaces, showSuggestions]);

  const loadRecentWorkspaces = useCallback(async () => {
    setIsLoadingRecent(true);
    try {
      const workspaces = await recentWorkspacesManager.getRecentWorkspaces();
      setRecentWorkspaces(workspaces.slice(0, 5));
    } catch (error) {
      console.error("Failed to load recent workspaces:", error);
      setRecentWorkspaces([]);
    } finally {
      setIsLoadingRecent(false);
    }
  }, []);

  const loadSuggestions = useCallback(async () => {
    setIsLoadingSuggestions(true);
    try {
      const suggestionsData = await workspaceApiService.getPathSuggestions();
      setSuggestions(suggestionsData.suggestions.slice(0, 8));
    } catch (error) {
      console.error("Failed to load suggestions:", error);
      setSuggestions([]);
    } finally {
      setIsLoadingSuggestions(false);
    }
  }, []);

  const handlePathChange = useCallback(
    (newPath: string) => {
      setPath(newPath);

      if (onChange) {
        onChange(newPath);
      }

      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (debouncedValidateRef.current) {
        debouncedValidateRef.current();
      }

      if (newPath.trim()) {
        setValidationStatus({ isValidating: true, result: null });

        debouncedValidateRef.current =
          workspaceValidator.validateWorkspaceDebounced(
            newPath.trim(),
            (result) => {
              setValidationStatus({ isValidating: false, result });
              if (onValidationChange) {
                onValidationChange(result);
              }
            },
          );
      } else {
        setValidationStatus({ isValidating: false, result: null });
        if (onValidationChange) {
          onValidationChange(null);
        }
      }
    },
    [onChange, onValidationChange],
  );

  const handleBrowseClick = useCallback(() => {
    setFolderBrowserVisible(true);
  }, []);

  const handleFolderSelect = useCallback(
    (selectedPath: string) => {
      handlePathChange(selectedPath);
      message.success("文件夹选择成功");
    },
    [handlePathChange],
  );

  const handleWorkspaceSelect = useCallback(
    (workspacePath: string) => {
      handlePathChange(workspacePath);
    },
    [handlePathChange],
  );

  return {
    path,
    validationStatus,
    recentWorkspaces,
    suggestions,
    isLoadingRecent,
    isLoadingSuggestions,
    folderBrowserVisible,
    setFolderBrowserVisible,
    handlePathChange,
    handleBrowseClick,
    handleFolderSelect,
    handleWorkspaceSelect,
  };
};

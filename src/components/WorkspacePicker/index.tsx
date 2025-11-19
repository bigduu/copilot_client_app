import React, { useEffect, useState, useCallback, useRef } from "react";
import {
  Input,
  Button,
  List,
  Typography,
  Space,
  Divider,
  Spin,
  Empty,
  Alert,
  Tooltip,
  message,
} from "antd";
import {
  FolderOutlined,
  HistoryOutlined,
  HomeOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  LoadingOutlined,
} from "@ant-design/icons";
import {
  workspaceValidator,
  WorkspaceValidationResult,
} from "../../utils/workspaceValidator";
import {
  recentWorkspacesManager,
  WorkspaceInfo,
} from "../../services/RecentWorkspacesManager";
import { FolderBrowser } from "../FolderBrowser";
import {
  workspaceApiService,
  PathSuggestion,
} from "../../services/WorkspaceApiService";

const { Text } = Typography;

export interface WorkspacePickerProps {
  value?: string;
  onChange?: (path: string) => void;
  placeholder?: string;
  disabled?: boolean;
  allowBrowse?: boolean;
  showRecentWorkspaces?: boolean;
  showSuggestions?: boolean;
  onValidationChange?: (result: WorkspaceValidationResult | null) => void;
  className?: string;
  style?: React.CSSProperties;
}

interface ValidationStatus {
  isValidating: boolean;
  result: WorkspaceValidationResult | null;
}

const WorkspacePicker: React.FC<WorkspacePickerProps> = ({
  value = "",
  onChange,
  placeholder = "例如 /Users/alice/Workspace/MyProject",
  disabled = false,
  allowBrowse = true,
  showRecentWorkspaces = true,
  showSuggestions = true,
  onValidationChange,
  className,
  style,
}) => {
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

  // Sync with parent value
  useEffect(() => {
    setPath(value);
  }, [value]);

  // Load recent workspaces and suggestions on mount
  useEffect(() => {
    if (showRecentWorkspaces) {
      loadRecentWorkspaces();
    }
    if (showSuggestions) {
      loadSuggestions();
    }

    return () => {
      // Cleanup any pending validations
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (debouncedValidateRef.current) {
        debouncedValidateRef.current();
      }
    };
  }, [showRecentWorkspaces, showSuggestions]);

  // Load recent workspaces
  const loadRecentWorkspaces = useCallback(async () => {
    setIsLoadingRecent(true);
    try {
      const workspaces = await recentWorkspacesManager.getRecentWorkspaces();
      setRecentWorkspaces(workspaces.slice(0, 5)); // Show only the 5 most recent
    } catch (error) {
      console.error("Failed to load recent workspaces:", error);
      // Gracefully handle error - just don't show recent workspaces
      setRecentWorkspaces([]);
    } finally {
      setIsLoadingRecent(false);
    }
  }, []);

  // Load path suggestions
  const loadSuggestions = useCallback(async () => {
    setIsLoadingSuggestions(true);
    try {
      const suggestionsData = await workspaceApiService.getPathSuggestions();
      setSuggestions(suggestionsData.suggestions.slice(0, 8)); // Show only 8 suggestions
    } catch (error) {
      console.error("Failed to load suggestions:", error);
      // Gracefully handle error - just don't show suggestions
      setSuggestions([]);
    } finally {
      setIsLoadingSuggestions(false);
    }
  }, []);

  // Handle path change with debounced validation
  const handlePathChange = useCallback(
    (newPath: string) => {
      setPath(newPath);

      if (onChange) {
        onChange(newPath);
      }

      // Cancel any pending validation
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (debouncedValidateRef.current) {
        debouncedValidateRef.current();
      }

      // Start debounced validation
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
            }
          );
      } else {
        setValidationStatus({ isValidating: false, result: null });
        if (onValidationChange) {
          onValidationChange(null);
        }
      }
    },
    [onChange, onValidationChange]
  );

  // Handle browse button click - Open unified folder browser
  const handleBrowseClick = useCallback(() => {
    setFolderBrowserVisible(true);
  }, []);

  const handleFolderSelect = useCallback(
    (selectedPath: string) => {
      handlePathChange(selectedPath);
      message.success("文件夹选择成功");
    },
    [handlePathChange]
  );

  // Handle workspace selection from recent/suggestions
  const handleWorkspaceSelect = useCallback(
    (workspacePath: string) => {
      handlePathChange(workspacePath);
    },
    [handlePathChange]
  );

  // Get validation status icon
  const getValidationIcon = () => {
    if (validationStatus.isValidating) {
      return <LoadingOutlined style={{ color: "#1890ff" }} />;
    }

    if (validationStatus.result) {
      if (validationStatus.result.is_valid) {
        return <CheckCircleOutlined style={{ color: "#52c41a" }} />;
      } else {
        return <ExclamationCircleOutlined style={{ color: "#ff4d4f" }} />;
      }
    }

    return null;
  };

  // Get suggestion icon
  const getSuggestionIcon = (suggestion: PathSuggestion) => {
    switch (suggestion.suggestion_type) {
      case "home":
        return <HomeOutlined style={{ color: "#1890ff" }} />;
      case "documents":
      case "desktop":
      case "downloads":
        return <FolderOutlined style={{ color: "#52c41a" }} />;
      case "recent":
        return <HistoryOutlined style={{ color: "#faad14" }} />;
      default:
        return <FolderOutlined />;
    }
  };

  // Render workspace validation status
  const renderValidationStatus = () => {
    if (!validationStatus.result) return null;

    const { result } = validationStatus;

    return (
      <div style={{ marginTop: 8 }}>
        {result.is_valid ? (
          <Alert
            type="success"
            message={
              <Space>
                <span>有效的工作区</span>
                {result.workspace_name && (
                  <Text type="secondary">({result.workspace_name})</Text>
                )}
                {result.file_count !== undefined && (
                  <Text type="secondary">- {result.file_count} 个文件</Text>
                )}
              </Space>
            }
            showIcon
          />
        ) : (
          <Alert
            type="error"
            message={result.error_message || "无效的工作区路径"}
            showIcon
          />
        )}
      </div>
    );
  };

  // Render recent workspaces
  const renderRecentWorkspaces = () => {
    if (!showRecentWorkspaces) return null;

    return (
      <div style={{ marginTop: 16 }}>
        <div style={{ marginBottom: 8 }}>
          <Space>
            <HistoryOutlined />
            <Text strong>最近使用的工作区</Text>
          </Space>
        </div>

        {isLoadingRecent ? (
          <div style={{ textAlign: "center", padding: 16 }}>
            <Spin size="small" />
          </div>
        ) : recentWorkspaces.length === 0 ? (
          <Empty
            description="暂无最近使用的工作区"
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            style={{ padding: 16 }}
          />
        ) : (
          <List
            size="small"
            dataSource={recentWorkspaces}
            renderItem={(workspace) => (
              <List.Item
                style={{
                  cursor: "pointer",
                  padding: "8px 12px",
                  borderRadius: 6,
                  transition: "background-color 0.2s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = "#f5f5f5";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "transparent";
                }}
                onClick={() => handleWorkspaceSelect(workspace.path)}
              >
                <Space>
                  <FolderOutlined style={{ color: "#faad14" }} />
                  <div>
                    <div style={{ fontWeight: 500 }}>
                      {workspace.workspace_name ||
                        workspace.path.split("/").pop() ||
                        "工作区"}
                    </div>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {workspace.path}
                    </Text>
                  </div>
                </Space>
              </List.Item>
            )}
          />
        )}
      </div>
    );
  };

  // Render suggestions
  const renderSuggestions = () => {
    if (!showSuggestions) return null;

    return (
      <div style={{ marginTop: 16 }}>
        <div style={{ marginBottom: 8 }}>
          <Space>
            <FolderOutlined />
            <Text strong>建议的工作区</Text>
          </Space>
        </div>

        {isLoadingSuggestions ? (
          <div style={{ textAlign: "center", padding: 16 }}>
            <Spin size="small" />
          </div>
        ) : suggestions.length === 0 ? (
          <Empty
            description="暂无建议"
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            style={{ padding: 16 }}
          />
        ) : (
          <List
            size="small"
            dataSource={suggestions}
            renderItem={(suggestion) => (
              <List.Item
                style={{
                  cursor: "pointer",
                  padding: "8px 12px",
                  borderRadius: 6,
                  transition: "background-color 0.2s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = "#f5f5f5";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "transparent";
                }}
                onClick={() => handleWorkspaceSelect(suggestion.path)}
              >
                <Space>
                  {getSuggestionIcon(suggestion)}
                  <div>
                    <div style={{ fontWeight: 500 }}>{suggestion.name}</div>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {suggestion.path}
                    </Text>
                  </div>
                </Space>
              </List.Item>
            )}
          />
        )}
      </div>
    );
  };

  return (
    <div className={className} style={style}>
      <Space.Compact style={{ width: "100%" }}>
        <Input
          value={path}
          onChange={(e) => handlePathChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          suffix={getValidationIcon()}
          addonBefore={
            <Space>
              <FolderOutlined />
              <Text>工作区</Text>
            </Space>
          }
        />
        {allowBrowse && (
          <Tooltip title="浏览文件夹">
            <Button
              icon={<FolderOutlined />}
              onClick={handleBrowseClick}
              disabled={disabled}
            />
          </Tooltip>
        )}
      </Space.Compact>

      {renderValidationStatus()}

      {(showRecentWorkspaces || showSuggestions) && (
        <>
          <Divider style={{ margin: "16px 0 12px 0" }} />
          {renderRecentWorkspaces()}
          {renderSuggestions()}
        </>
      )}

      <FolderBrowser
        visible={folderBrowserVisible}
        onClose={() => setFolderBrowserVisible(false)}
        onSelect={handleFolderSelect}
      />
    </div>
  );
};

export default WorkspacePicker;

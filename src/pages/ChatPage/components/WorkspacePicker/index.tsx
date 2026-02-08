import React from "react";
import { Button, Divider, Input, Space, Typography, theme } from "antd";
import { FolderOutlined } from "@ant-design/icons";
import type { WorkspaceValidationResult } from "../../utils/workspaceValidator";
import { FolderBrowser } from "../FolderBrowser";
import { useWorkspacePickerState } from "./useWorkspacePickerState";
import WorkspacePickerRecentList from "./WorkspacePickerRecentList";
import WorkspacePickerSuggestionsList from "./WorkspacePickerSuggestionsList";
import WorkspacePickerValidationIcon from "./WorkspacePickerValidationIcon";
import WorkspacePickerValidationStatus from "./WorkspacePickerValidationStatus";

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

const WorkspacePicker: React.FC<WorkspacePickerProps> = ({
  value = "",
  onChange,
  placeholder = "e.g. /Users/alice/Workspace/MyProject",
  disabled = false,
  allowBrowse = true,
  showRecentWorkspaces = true,
  showSuggestions = true,
  onValidationChange,
  className,
  style,
}) => {
  const { token } = theme.useToken();
  const {
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
  } = useWorkspacePickerState({
    value,
    onChange,
    showRecentWorkspaces,
    showSuggestions,
    onValidationChange,
  });

  return (
    <div className={className} style={style}>
      <Input
        value={path}
        onChange={(e) => handlePathChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        size="middle"
        style={{ width: "100%" }}
        suffix={
          <WorkspacePickerValidationIcon
            isValidating={validationStatus.isValidating}
            result={validationStatus.result}
            token={token}
          />
        }
        addonBefore={
          <Space>
            <FolderOutlined />
            <Text>Workspace</Text>
          </Space>
        }
        addonAfter={
          allowBrowse ? (
            <Button
              aria-label="Browse folder"
              title="Browse folder"
              icon={<FolderOutlined />}
              onClick={handleBrowseClick}
              disabled={disabled}
              type="text"
              size="middle"
              style={{ display: "inline-flex", alignItems: "center" }}
            />
          ) : undefined
        }
      />

      <WorkspacePickerValidationStatus
        result={validationStatus.result}
        token={token}
      />

      {(showRecentWorkspaces || showSuggestions) && (
        <>
          <Divider style={{ margin: "16px 0 12px 0" }} />
          <WorkspacePickerRecentList
            show={showRecentWorkspaces}
            isLoading={isLoadingRecent}
            recentWorkspaces={recentWorkspaces}
            onSelect={handleWorkspaceSelect}
            token={token}
          />
          <WorkspacePickerSuggestionsList
            show={showSuggestions}
            isLoading={isLoadingSuggestions}
            suggestions={suggestions}
            onSelect={handleWorkspaceSelect}
            token={token}
          />
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

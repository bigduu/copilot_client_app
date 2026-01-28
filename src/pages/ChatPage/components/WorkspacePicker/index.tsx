import React from "react";
import {
  Button,
  Divider,
  Input,
  Space,
  Tooltip,
  Typography,
  theme,
} from "antd";
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
  placeholder = "例如 /Users/alice/Workspace/MyProject",
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
      <Space.Compact style={{ width: "100%" }}>
        <Input
          value={path}
          onChange={(e) => handlePathChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
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

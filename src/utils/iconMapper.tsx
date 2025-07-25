import React from "react";
import {
  FileTextOutlined,
  PlayCircleOutlined,
  ToolOutlined,
  RobotOutlined,
  FolderOutlined,
  CodeOutlined,
  SettingOutlined,
  DatabaseOutlined,
  CloudOutlined,
  ApiOutlined,
  BugOutlined,
  BuildOutlined,
  FileSearchOutlined,
  EditOutlined,
  DeleteOutlined,
  CopyOutlined,
  SaveOutlined,
  UploadOutlined,
  DownloadOutlined,
  SyncOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  InfoCircleOutlined,
  QuestionCircleOutlined,
} from "@ant-design/icons";

/**
 * Icon mapping from string names to React components
 * Maps backend icon names to actual Ant Design icon components
 */
const ICON_MAP: Record<string, React.ReactNode> = {
  // Category icons
  FileTextOutlined: <FileTextOutlined />,
  PlayCircleOutlined: <PlayCircleOutlined />,
  ToolOutlined: <ToolOutlined />,
  RobotOutlined: <RobotOutlined />,
  FolderOutlined: <FolderOutlined />,
  CodeOutlined: <CodeOutlined />,
  SettingOutlined: <SettingOutlined />,
  DatabaseOutlined: <DatabaseOutlined />,
  CloudOutlined: <CloudOutlined />,
  ApiOutlined: <ApiOutlined />,
  BugOutlined: <BugOutlined />,
  BuildOutlined: <BuildOutlined />,

  // File operation icons
  FileSearchOutlined: <FileSearchOutlined />,
  EditOutlined: <EditOutlined />,
  DeleteOutlined: <DeleteOutlined />,
  CopyOutlined: <CopyOutlined />,
  SaveOutlined: <SaveOutlined />,
  UploadOutlined: <UploadOutlined />,
  DownloadOutlined: <DownloadOutlined />,

  // Status icons
  SyncOutlined: <SyncOutlined />,
  CheckCircleOutlined: <CheckCircleOutlined />,
  ExclamationCircleOutlined: <ExclamationCircleOutlined />,
  InfoCircleOutlined: <InfoCircleOutlined />,
  QuestionCircleOutlined: <QuestionCircleOutlined />,
};

/**
 * Convert icon name string to React icon component
 * @param iconName - The icon name from backend (e.g., "FileTextOutlined")
 * @param fallback - Fallback icon if the name is not found
 * @returns React icon component
 */
export const getIconComponent = (
  iconName: string,
  fallback: React.ReactNode = <ToolOutlined />
): React.ReactNode => {
  // If it's already a React component or emoji, return as is
  if (
    React.isValidElement(iconName) ||
    /^[\u{1F000}-\u{1F9FF}]/u.test(iconName)
  ) {
    return iconName;
  }

  // Look up in the icon map
  const iconComponent = ICON_MAP[iconName];

  if (iconComponent) {
    return iconComponent;
  }

  // If not found, check if it's an emoji or other valid display string
  if (iconName && iconName.length <= 4) {
    return <span>{iconName}</span>;
  }

  // Return fallback icon
  return fallback;
};

/**
 * Check if an icon name is supported
 * @param iconName - The icon name to check
 * @returns true if the icon is supported
 */
export const isIconSupported = (iconName: string): boolean => {
  return iconName in ICON_MAP;
};

/**
 * Get all supported icon names
 * @returns Array of supported icon names
 */
export const getSupportedIconNames = (): string[] => {
  return Object.keys(ICON_MAP);
};

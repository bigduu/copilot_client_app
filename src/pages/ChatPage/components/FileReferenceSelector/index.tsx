import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Card,
  List,
  Typography,
  Space,
  Button,
  Empty,
  Spin,
  theme,
  Alert,
} from "antd";
import {
  FileTextOutlined,
  FolderOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import { WorkspaceFileEntry } from "../../types/workspace";

const { Text } = Typography;
const { useToken } = theme;

interface FileReferenceSelectorProps {
  visible: boolean;
  files: WorkspaceFileEntry[];
  searchText: string;
  loading: boolean;
  error?: string | null;
  onSelect: (file: WorkspaceFileEntry) => void;
  onCancel: () => void;
  onChangeWorkspace?: () => void;
}

const FileReferenceSelector: React.FC<FileReferenceSelectorProps> = ({
  visible,
  files,
  searchText,
  loading,
  error,
  onSelect,
  onCancel,
  onChangeWorkspace,
}) => {
  const { token } = useToken();
  const [activeIndex, setActiveIndex] = useState(0);
  const listContainerRef = useRef<HTMLDivElement>(null);
  const activeItemRef = useRef<HTMLDivElement>(null);

  const filteredFiles = useMemo(() => {
    const term = searchText.trim().toLowerCase();
    if (!term) return files;
    return files.filter((file) => file.name.toLowerCase().startsWith(term));
  }, [files, searchText]);

  useEffect(() => {
    setActiveIndex(0);
  }, [searchText, files]);

  useEffect(() => {
    if (!visible) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!visible) return;
      if (event.key === "ArrowDown" || (event.key === "n" && event.ctrlKey)) {
        event.preventDefault();
        setActiveIndex((prev) =>
          filteredFiles.length === 0 ? 0 : (prev + 1) % filteredFiles.length,
        );
      } else if (
        event.key === "ArrowUp" ||
        (event.key === "p" && event.ctrlKey)
      ) {
        event.preventDefault();
        setActiveIndex((prev) =>
          filteredFiles.length === 0
            ? 0
            : (prev - 1 + filteredFiles.length) % filteredFiles.length,
        );
      } else if (event.key === "Enter") {
        if (filteredFiles[activeIndex]) {
          event.preventDefault();
          onSelect(filteredFiles[activeIndex]);
        }
      } else if (event.key === "Tab") {
        if (filteredFiles[activeIndex]) {
          event.preventDefault();
          onSelect(filteredFiles[activeIndex]);
        }
      } else if (event.key === "Escape") {
        event.preventDefault();
        onCancel();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [visible, filteredFiles, activeIndex, onSelect, onCancel]);

  useEffect(() => {
    if (!visible) return;
    const activeItem = activeItemRef.current;
    if (!activeItem) return;

    activeItem.scrollIntoView({ block: "nearest" });
  }, [activeIndex, visible]);

  if (!visible) {
    return null;
  }

  return (
    <div
      style={{
        position: "absolute",
        bottom: "100%",
        left: 0,
        right: 0,
        zIndex: 1000,
        marginBottom: token.marginXS,
      }}
    >
      <Card
        size="small"
        style={{
          borderRadius: token.borderRadius,
          border: `1px solid ${token.colorBorderSecondary}`,
          boxShadow: token.boxShadowSecondary,
        }}
        bodyStyle={{
          padding: token.paddingXS,
          maxHeight: 240,
          overflowY: "auto",
        }}
        title={
          <Space align="center" size={token.marginXS}>
            <Text strong>@ File Reference</Text>
            {loading && <Spin size="small" />}
          </Space>
        }
        extra={
          <Space size={token.marginXS}>
            {onChangeWorkspace && (
              <Button
                type="text"
                size="small"
                icon={<ReloadOutlined />}
                onClick={onChangeWorkspace}
              >
                Set Workspace
              </Button>
            )}
            <Button type="text" size="small" onClick={onCancel}>
              Close
            </Button>
          </Space>
        }
      >
        {error ? (
          <Alert type="error" message={error} showIcon />
        ) : filteredFiles.length === 0 && !loading ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={searchText ? "No matching files found" : "Directory is empty"}
          />
        ) : (
          <div ref={listContainerRef}>
            <List
              dataSource={filteredFiles}
              renderItem={(file, index) => (
                <List.Item
                  key={file.path}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => onSelect(file)}
                  ref={index === activeIndex ? activeItemRef : undefined}
                  style={{
                    cursor: "pointer",
                    backgroundColor:
                      index === activeIndex
                        ? token.colorPrimaryBg
                        : "transparent",
                    borderRadius: token.borderRadiusSM,
                    padding: `${token.paddingXXS}px ${token.paddingXS}px`,
                  }}
                >
                  <Space size={token.marginXS} align="center">
                    {file.is_directory ? (
                      <FolderOutlined />
                    ) : (
                      <FileTextOutlined />
                    )}
                    <div>
                      <Text>{file.name}</Text>
                      <div>
                        <Text
                          type="secondary"
                          style={{ fontSize: token.fontSizeSM }}
                        >
                          {file.is_directory ? "Directory" : "File"}
                        </Text>
                      </div>
                    </div>
                  </Space>
                </List.Item>
              )}
            />
          </div>
        )}
      </Card>
    </div>
  );
};

export default FileReferenceSelector;

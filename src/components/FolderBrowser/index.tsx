import React, { useState, useEffect } from "react";
import { Modal, List, Breadcrumb, Spin, message, Button, Space } from "antd";
import {
  FolderOutlined,
  HomeOutlined,
  ArrowLeftOutlined,
  CheckOutlined,
} from "@ant-design/icons";
import "./styles.css";

interface FolderItem {
  name: string;
  path: string;
}

interface BrowseFolderResponse {
  current_path: string;
  parent_path?: string;
  folders: FolderItem[];
}

interface FolderBrowserProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (path: string) => void;
}

export const FolderBrowser: React.FC<FolderBrowserProps> = ({
  visible,
  onClose,
  onSelect,
}) => {
  const [loading, setLoading] = useState(false);
  const [currentPath, setCurrentPath] = useState("");
  const [parentPath, setParentPath] = useState<string | undefined>();
  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [pathHistory, setPathHistory] = useState<string[]>([]);

  // Load initial directory (home)
  useEffect(() => {
    if (visible) {
      loadDirectory();
    }
  }, [visible]);

  const loadDirectory = async (path?: string) => {
    setLoading(true);
    try {
      const response = await fetch(
        "http://localhost:8080/v1/workspace/browse-folder",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ path }),
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result: BrowseFolderResponse = await response.json();
      setCurrentPath(result.current_path);
      setParentPath(result.parent_path);
      setFolders(result.folders);
    } catch (error) {
      console.error("Failed to load directory:", error);
      message.error("无法读取文件夹");
    } finally {
      setLoading(false);
    }
  };

  const handleFolderClick = (folder: FolderItem) => {
    setPathHistory([...pathHistory, currentPath]);
    loadDirectory(folder.path);
  };

  const handleGoBack = () => {
    if (parentPath) {
      setPathHistory(pathHistory.slice(0, -1));
      loadDirectory(parentPath);
    }
  };

  const handleGoHome = () => {
    setPathHistory([]);
    loadDirectory();
  };

  const handleSelectCurrent = () => {
    onSelect(currentPath);
    onClose();
  };

  const getPathSegments = () => {
    if (!currentPath) return [];
    const segments = currentPath.split(/[/\\]/).filter(Boolean);

    // For Unix paths, add root
    if (currentPath.startsWith("/")) {
      segments.unshift("/");
    }

    return segments;
  };

  const handleBreadcrumbClick = (index: number) => {
    const segments = getPathSegments();
    const targetPath = segments.slice(0, index + 1).join("/");
    const normalizedPath = currentPath.startsWith("/")
      ? targetPath
      : targetPath;
    loadDirectory(normalizedPath);
  };

  return (
    <Modal
      title="选择工作区文件夹"
      open={visible}
      onCancel={onClose}
      width={700}
      footer={null}
    >
      <div className="folder-browser">
        {/* Toolbar */}
        <Space style={{ marginBottom: 16 }}>
          <Button icon={<HomeOutlined />} onClick={handleGoHome} size="small">
            主目录
          </Button>
          <Button
            icon={<ArrowLeftOutlined />}
            onClick={handleGoBack}
            disabled={!parentPath}
            size="small"
          >
            上一级
          </Button>
          <Button
            type="primary"
            icon={<CheckOutlined />}
            onClick={handleSelectCurrent}
            size="small"
          >
            选择当前文件夹
          </Button>
        </Space>

        {/* Breadcrumb */}
        <Breadcrumb style={{ marginBottom: 16 }}>
          {getPathSegments().map((segment, index) => (
            <Breadcrumb.Item key={index}>
              <span
                onClick={() => handleBreadcrumbClick(index)}
                style={{ cursor: "pointer" }}
              >
                {segment === "/" ? <HomeOutlined /> : segment}
              </span>
            </Breadcrumb.Item>
          ))}
        </Breadcrumb>

        {/* Current path display */}
        <div
          style={{
            padding: "8px 12px",
            background: "#f5f5f5",
            borderRadius: "4px",
            marginBottom: 16,
            fontFamily: "monospace",
            fontSize: "13px",
          }}
        >
          当前路径: {currentPath}
        </div>

        {/* Folder list */}
        <Spin spinning={loading}>
          <div
            style={{
              maxHeight: "400px",
              overflowY: "auto",
              border: "1px solid #d9d9d9",
              borderRadius: "4px",
            }}
          >
            {folders.length === 0 && !loading ? (
              <div
                style={{
                  padding: "40px",
                  textAlign: "center",
                  color: "#999",
                }}
              >
                📂 此文件夹为空
              </div>
            ) : (
              <List
                dataSource={folders}
                renderItem={(folder) => (
                  <List.Item
                    style={{
                      padding: "12px 16px",
                      cursor: "pointer",
                      transition: "background 0.2s",
                    }}
                    onClick={() => handleFolderClick(folder)}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = "#f0f0f0";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "transparent";
                    }}
                  >
                    <Space>
                      <FolderOutlined
                        style={{ fontSize: "18px", color: "#1890ff" }}
                      />
                      <span style={{ fontSize: "14px" }}>{folder.name}</span>
                    </Space>
                  </List.Item>
                )}
              />
            )}
          </div>
        </Spin>

        {/* Help text */}
        <div
          style={{
            marginTop: 16,
            fontSize: "12px",
            color: "#666",
          }}
        >
          💡 提示：点击文件夹进入，点击"选择当前文件夹"确认选择
        </div>
      </div>
    </Modal>
  );
};

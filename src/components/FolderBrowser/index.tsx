import React, { useState, useEffect } from "react";
import {
  Modal,
  List,
  Breadcrumb,
  Spin,
  message,
  Button,
  Space,
  Card,
  Empty,
  Typography,
  theme,
} from "antd";
import {
  FolderOutlined,
  HomeOutlined,
  ArrowLeftOutlined,
  CheckOutlined,
} from "@ant-design/icons";
import {
  workspaceApiService,
  BrowseFolderResponse,
} from "../../services/WorkspaceApiService";

interface FolderItem {
  name: string;
  path: string;
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
  const { token } = theme.useToken();
  const { Text } = Typography;
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
      const result: BrowseFolderResponse =
        await workspaceApiService.browseFolder(path);
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
      <Space direction="vertical" size="middle" style={{ width: "100%" }}>
        <Space>
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

        <Breadcrumb>
          {getPathSegments().map((segment, index) => (
            <Breadcrumb.Item key={index}>
              <Button
                type="link"
                size="small"
                onClick={() => handleBreadcrumbClick(index)}
                style={{ padding: 0 }}
              >
                {segment === "/" ? <HomeOutlined /> : segment}
              </Button>
            </Breadcrumb.Item>
          ))}
        </Breadcrumb>

        <Card
          size="small"
          styles={{ body: { padding: token.paddingXS } }}
        >
          <Text type="secondary" style={{ fontSize: 12 }}>
            当前路径：
          </Text>{" "}
          <Text code>{currentPath}</Text>
        </Card>

        <Spin spinning={loading}>
          {folders.length === 0 && !loading ? (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={<Text type="secondary">此文件夹为空</Text>}
            />
          ) : (
            <List
              dataSource={folders}
              style={{ maxHeight: 400, overflowY: "auto" }}
              renderItem={(folder) => (
                <List.Item style={{ padding: 0 }}>
                  <Button
                    type="text"
                    icon={<FolderOutlined />}
                    onClick={() => handleFolderClick(folder)}
                    style={{
                      width: "100%",
                      textAlign: "left",
                      padding: `${token.paddingXS}px ${token.paddingSM}px`,
                    }}
                  >
                    {folder.name}
                  </Button>
                </List.Item>
              )}
            />
          )}
        </Spin>

        <Text type="secondary" style={{ fontSize: 12 }}>
          💡 提示：点击文件夹进入，点击"选择当前文件夹"确认选择
        </Text>
      </Space>
    </Modal>
  );
};

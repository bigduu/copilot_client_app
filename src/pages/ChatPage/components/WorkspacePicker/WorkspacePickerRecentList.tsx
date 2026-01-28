import React from "react";
import { Button, Empty, Flex, List, Space, Spin, Typography } from "antd";
import { FolderOutlined, HistoryOutlined } from "@ant-design/icons";
import type { WorkspaceInfo } from "../../services/RecentWorkspacesManager";

const { Text } = Typography;

interface WorkspacePickerRecentListProps {
  show: boolean;
  isLoading: boolean;
  recentWorkspaces: WorkspaceInfo[];
  onSelect: (path: string) => void;
  token: any;
}

const WorkspacePickerRecentList: React.FC<WorkspacePickerRecentListProps> = ({
  show,
  isLoading,
  recentWorkspaces,
  onSelect,
  token,
}) => {
  if (!show) return null;

  return (
    <Flex vertical gap={token.marginXS} style={{ marginTop: token.marginMD }}>
      <Space>
        <HistoryOutlined />
        <Text strong>最近使用的工作区</Text>
      </Space>

      {isLoading ? (
        <Flex justify="center" style={{ padding: token.paddingSM }}>
          <Spin size="small" />
        </Flex>
      ) : recentWorkspaces.length === 0 ? (
        <Empty
          description="暂无最近使用的工作区"
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          style={{ padding: token.paddingSM }}
        />
      ) : (
        <List
          size="small"
          dataSource={recentWorkspaces}
          renderItem={(workspace) => (
            <List.Item style={{ padding: 0 }}>
              <Button
                type="text"
                onClick={() => onSelect(workspace.path)}
                style={{
                  width: "100%",
                  textAlign: "left",
                  padding: `${token.paddingXS}px ${token.paddingSM}px`,
                }}
              >
                <Space>
                  <FolderOutlined style={{ color: token.colorWarning }} />
                  <Space direction="vertical" size={0}>
                    <Text strong>
                      {workspace.workspace_name ||
                        workspace.path.split("/").pop() ||
                        "工作区"}
                    </Text>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {workspace.path}
                    </Text>
                  </Space>
                </Space>
              </Button>
            </List.Item>
          )}
        />
      )}
    </Flex>
  );
};

export default WorkspacePickerRecentList;

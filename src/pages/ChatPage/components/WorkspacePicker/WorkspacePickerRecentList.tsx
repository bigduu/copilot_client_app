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
      <Space style={{ paddingInline: token.paddingSM }}>
        <HistoryOutlined />
        <Text strong>Recent Workspaces</Text>
      </Space>

      {isLoading ? (
        <Flex justify="center" style={{ padding: token.paddingSM }}>
          <Spin size="small" />
        </Flex>
      ) : recentWorkspaces.length === 0 ? (
        <Empty
          description="No recent workspaces"
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          style={{ padding: token.paddingSM }}
        />
      ) : (
        <List
          size="small"
          dataSource={recentWorkspaces}
          style={{ paddingInline: token.paddingSM }}
          renderItem={(workspace) => (
            <List.Item style={{ padding: 0 }}>
              <Button
                type="text"
                onClick={() => onSelect(workspace.path)}
                style={{
                  width: "100%",
                  textAlign: "left",
                  padding: `${token.paddingXS}px 0`,
                  height: "auto",
                }}
              >
                <Flex justify="space-between" align="center" style={{ width: "100%" }}>
                  <Space>
                    <FolderOutlined style={{ color: token.colorWarning }} />
                    <Text strong>
                      {workspace.workspace_name ||
                        workspace.path.split("/").pop() ||
                        "Workspace"}
                    </Text>
                  </Space>
                  <Text
                    type="secondary"
                    ellipsis={{ tooltip: workspace.path }}
                    style={{
                      fontSize: 12,
                      maxWidth: "55%",
                      textAlign: "right",
                    }}
                  >
                    {workspace.path}
                  </Text>
                </Flex>
              </Button>
            </List.Item>
          )}
        />
      )}
    </Flex>
  );
};

export default WorkspacePickerRecentList;

import React, { useState, useEffect } from "react";
import {
  List,
  Switch,
  Typography,
  Space,
  Card,
  message,
  Spin,
  Alert,
  Tooltip,
  Tag,
} from "antd";
import {
  ToolOutlined,
  SecurityScanOutlined,
  InfoCircleOutlined,
} from "@ant-design/icons";
import { invoke } from "@tauri-apps/api/core";
import { theme } from "../../styles/theme";

const { Text, Title } = Typography;

interface ToolInfo {
  name: string;
  description: string;
  enabled: boolean;
  required_approval: boolean;
}

const ToolManagement: React.FC = () => {
  const [tools, setTools] = useState<ToolInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [msgApi, contextHolder] = message.useMessage();

  // 加载工具信息
  const loadTools = async () => {
    try {
      setLoading(true);
      setError(null);
      const toolsInfo = await invoke<ToolInfo[]>("get_tools_info");
      setTools(toolsInfo);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Unknown error";
      setError(`Failed to load tools: ${errorMsg}`);
      msgApi.error("Failed to load tools");
    } finally {
      setLoading(false);
    }
  };

  // 切换工具启用状态
  const toggleTool = async (toolName: string, enabled: boolean) => {
    try {
      await invoke("set_tool_enabled", {
        toolName,
        enabled,
      });

      // 更新本地状态
      setTools((prev) =>
        prev.map((tool) =>
          tool.name === toolName ? { ...tool, enabled } : tool
        )
      );

      msgApi.success(`Tool "${toolName}" ${enabled ? "enabled" : "disabled"}`);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Unknown error";
      msgApi.error(`Failed to update tool: ${errorMsg}`);
      // 重新加载以确保状态一致
      loadTools();
    }
  };

  useEffect(() => {
    loadTools();
  }, []);

  if (loading) {
    return (
      <div style={{ textAlign: "center", padding: theme.spacing.xl }}>
        <Spin size="large" />
        <div style={{ marginTop: theme.spacing.md }}>
          <Text type="secondary">Loading tools...</Text>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <Alert
        message="Error Loading Tools"
        description={error}
        type="error"
        showIcon
        action={
          <Space>
            <button
              onClick={loadTools}
              style={{
                background: "none",
                border: "none",
                color: theme.colors.primary,
                cursor: "pointer",
                textDecoration: "underline",
              }}
            >
              Retry
            </button>
          </Space>
        }
      />
    );
  }

  return (
    <div>
      {contextHolder}

      <div style={{ marginBottom: theme.spacing.lg }}>
        <Space align="center" style={{ marginBottom: theme.spacing.sm }}>
          <ToolOutlined style={{ color: theme.colors.primary }} />
          <Title level={5} style={{ margin: 0 }}>
            Tool Management
          </Title>
          <Tooltip title="Manage which tools are available for AI assistance">
            <InfoCircleOutlined style={{ color: theme.colors.textSecondary }} />
          </Tooltip>
        </Space>
        <Text type="secondary">
          Control which tools the AI can use during conversations. Disabled
          tools will not be available for execution.
        </Text>
      </div>

      <Card
        style={{
          borderRadius: theme.borderRadius.lg,
          border: `1px solid ${theme.colors.border}`,
        }}
      >
        <List
          dataSource={tools}
          renderItem={(tool) => (
            <List.Item
              style={{
                padding: `${theme.spacing.md} 0`,
                borderBottom: `1px solid ${theme.colors.borderSecondary}`,
              }}
              extra={
                <Switch
                  checked={tool.enabled}
                  onChange={(enabled) => toggleTool(tool.name, enabled)}
                />
              }
            >
              <List.Item.Meta
                avatar={
                  <div
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: theme.borderRadius.base,
                      background: tool.enabled
                        ? theme.colors.primaryHover
                        : theme.colors.fillTertiary,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: tool.enabled ? "#fff" : theme.colors.textDisabled,
                    }}
                  >
                    <ToolOutlined />
                  </div>
                }
                title={
                  <Space>
                    <Text
                      strong
                      style={{
                        color: tool.enabled
                          ? theme.colors.text
                          : theme.colors.textDisabled,
                      }}
                    >
                      {tool.name}
                    </Text>
                    {tool.required_approval && (
                      <Tooltip title="This tool requires user approval before execution">
                        <Tag icon={<SecurityScanOutlined />} color="orange">
                          Approval Required
                        </Tag>
                      </Tooltip>
                    )}
                  </Space>
                }
                description={
                  <Text
                    type="secondary"
                    style={{
                      color: tool.enabled
                        ? theme.colors.textSecondary
                        : theme.colors.textDisabled,
                      fontSize: theme.fontSize.sm,
                    }}
                  >
                    {tool.description}
                  </Text>
                }
              />
            </List.Item>
          )}
        />
      </Card>

      <div
        style={{
          marginTop: theme.spacing.md,
          padding: theme.spacing.md,
          background: theme.colors.bgContainer,
          borderRadius: theme.borderRadius.base,
          border: `1px solid ${theme.colors.borderSecondary}`,
        }}
      >
        <Space>
          <InfoCircleOutlined style={{ color: theme.colors.info }} />
          <Text type="secondary" style={{ fontSize: theme.fontSize.sm }}>
            Changes take effect immediately. Tools marked with "Approval
            Required" will prompt for confirmation before execution.
          </Text>
        </Space>
      </div>
    </div>
  );
};

export { ToolManagement };

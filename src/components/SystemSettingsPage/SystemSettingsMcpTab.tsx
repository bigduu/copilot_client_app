import React from "react";
import { Button, Card, Flex, Input, Space, Typography, theme } from "antd";
import type { McpStatusResponse } from "./useSystemSettingsMcp";

const { Text } = Typography;
const { useToken } = theme;

interface SystemSettingsMcpTabProps {
  mcpConfigJson: string;
  mcpConfigError: string | null;
  mcpStatuses: Record<string, McpStatusResponse | null>;
  isLoadingMcp: boolean;
  onReload: () => void;
  onSave: () => void;
  onChange: (value: string) => void;
  formatMcpStatus: (status: McpStatusResponse | null) => string;
}

const SystemSettingsMcpTab: React.FC<SystemSettingsMcpTabProps> = ({
  mcpConfigJson,
  mcpConfigError,
  mcpStatuses,
  isLoadingMcp,
  onReload,
  onSave,
  onChange,
  formatMcpStatus,
}) => {
  const { token } = useToken();

  return (
    <Card size="small">
      <Space
        direction="vertical"
        size={token.marginXS}
        style={{ width: "100%" }}
      >
        <Flex justify="space-between" align="center">
          <Text strong>MCP Server Configuration</Text>
          <Space size={token.marginSM}>
            <Button onClick={onReload} disabled={isLoadingMcp}>
              Reload
            </Button>
            <Button type="primary" onClick={onSave} disabled={isLoadingMcp}>
              Save
            </Button>
          </Space>
        </Flex>
        <Input.TextArea
          rows={10}
          value={mcpConfigJson}
          onChange={(event) => onChange(event.target.value)}
          placeholder='{\"mcpServers\":{}}'
        />
        {mcpConfigError && <Text type="danger">{mcpConfigError}</Text>}
        {Object.keys(mcpStatuses).length > 0 && (
          <Space
            direction="vertical"
            size={token.marginXS}
            style={{ width: "100%" }}
          >
            {Object.entries(mcpStatuses).map(([name, status]) => (
              <Flex key={name} justify="space-between" align="center">
                <Text code>{name}</Text>
                <Text
                  type={status?.status === "error" ? "danger" : "secondary"}
                >
                  {formatMcpStatus(status)}
                </Text>
              </Flex>
            ))}
          </Space>
        )}
        <Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
          Edit <Text code>~/.bodhi/mcp_servers.json</Text> directly or use this
          editor. The UI refreshes periodically; use Reload to apply file
          changes or Save to persist edits.
        </Text>
      </Space>
    </Card>
  );
};

export default SystemSettingsMcpTab;

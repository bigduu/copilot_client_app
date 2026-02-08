import React from "react";
import { Card, Space, Typography, theme } from "antd";
import { ClaudeInstallPanel } from "../../../../services/agent/ClaudeInstallPanel";

const { Text } = Typography;
const { useToken } = theme;

const SystemSettingsAgentTab: React.FC = () => {
  const { token } = useToken();

  return (
    <Card size="small">
      <Space direction="vertical" size={token.marginXS} style={{ width: "100%" }}>
        <Text strong>Claude Installer</Text>
        <ClaudeInstallPanel />
      </Space>
    </Card>
  );
};

export default SystemSettingsAgentTab;

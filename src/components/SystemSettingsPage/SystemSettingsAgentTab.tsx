import React from "react";
import { Card, Flex, Space, Typography, theme } from "antd";
import { ClaudeInstallPanel } from "../ClaudeInstallPanel";
import { ClaudeEnvironmentPanel } from "../ClaudeEnvironmentPanel";

const { Text } = Typography;
const { useToken } = theme;

const SystemSettingsAgentTab: React.FC = () => {
  const { token } = useToken();
  const tabGap = token.marginLG;

  return (
    <Flex vertical gap={tabGap}>
      <Card size="small">
        <Space
          direction="vertical"
          size={token.marginXS}
          style={{ width: "100%" }}
        >
          <Text strong>Claude Installer</Text>
          <ClaudeInstallPanel />
        </Space>
      </Card>
      <ClaudeEnvironmentPanel />
    </Flex>
  );
};

export default SystemSettingsAgentTab;

import React from "react";
import { Button, Card, Flex, Input, Space, Typography, theme } from "antd";

const { Text } = Typography;
const { useToken } = theme;

interface SystemSettingsConfigTabProps {
  bodhiConfigJson: string;
  bodhiConfigError: string | null;
  isLoadingBodhiConfig: boolean;
  onReload: () => void;
  onSave: () => void;
  onChange: (value: string) => void;
}

const SystemSettingsConfigTab: React.FC<SystemSettingsConfigTabProps> = ({
  bodhiConfigJson,
  bodhiConfigError,
  isLoadingBodhiConfig,
  onReload,
  onSave,
  onChange,
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
          <Text strong>Bodhi Config</Text>
          <Space size={token.marginSM}>
            <Button onClick={onReload} disabled={isLoadingBodhiConfig}>
              Reload
            </Button>
            <Button
              type="primary"
              onClick={onSave}
              disabled={isLoadingBodhiConfig}
            >
              Save
            </Button>
          </Space>
        </Flex>
        <Input.TextArea
          rows={10}
          value={bodhiConfigJson}
          onChange={(event) => onChange(event.target.value)}
          placeholder="{}"
        />
        {bodhiConfigError && <Text type="danger">{bodhiConfigError}</Text>}
        <Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
          Edit <Text code>~/.bodhi/config.json</Text> directly or use this
          editor. The UI refreshes periodically; use Reload to apply file
          changes or Save to persist edits.
        </Text>
      </Space>
    </Card>
  );
};

export default SystemSettingsConfigTab;

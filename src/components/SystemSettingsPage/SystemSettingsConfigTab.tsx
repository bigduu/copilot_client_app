import React from "react";
import { Button, Card, Flex, Input, Space, Typography, theme } from "antd";

const { Text } = Typography;
const { useToken } = theme;

const BODHI_CONFIG_DEMO = `{
  "http_proxy": "http://proxy.example.com:8080",
  "https_proxy": "http://proxy.example.com:8080",
  "http_proxy_auth": { "username": "user", "password": "pass" },
  "https_proxy_auth": { "username": "user", "password": "pass" },
  "api_key": "ghu_xxx",
  "api_base": "https://api.githubcopilot.com",
  "model": "gpt-5-mini",
  "headless_auth": false
}`;

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
          placeholder='{"http_proxy":"","https_proxy":"","http_proxy_auth":{"username":"","password":""},"https_proxy_auth":{"username":"","password":""},"api_key":null,"api_base":null,"model":null,"headless_auth":false}'
        />
        {bodhiConfigError && <Text type="danger">{bodhiConfigError}</Text>}
        <Space
          direction="vertical"
          size={token.marginXXS}
          style={{ width: "100%" }}
        >
          <Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
            Supported keys: <Text code>http_proxy</Text>,{" "}
            <Text code>https_proxy</Text>, <Text code>http_proxy_auth</Text>,{" "}
            <Text code>https_proxy_auth</Text>, <Text code>api_key</Text>,{" "}
            <Text code>api_base</Text>, <Text code>model</Text>,{" "}
            <Text code>headless_auth</Text>
          </Text>
          <Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
            Proxy auth is stored separately and masked after save; keep{" "}
            <Text code>***</Text> to preserve the existing password.
          </Text>
          <pre
            style={{
              margin: 0,
              padding: token.paddingXS,
              borderRadius: token.borderRadiusSM,
              background: token.colorFillSecondary,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              fontSize: token.fontSizeSM,
            }}
          >
            {BODHI_CONFIG_DEMO}
          </pre>
        </Space>
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

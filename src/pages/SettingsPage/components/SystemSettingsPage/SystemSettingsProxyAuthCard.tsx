import React from "react";
import { Button, Card, Flex, Input, Space, Typography, theme } from "antd";

const { Text } = Typography;
const { useToken } = theme;

interface SystemSettingsProxyAuthCardProps {
  username: string;
  password: string;
  onUsernameChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onSave: () => void;
  onClear: () => void;
  isSaving: boolean;
  lastError: string | null;
}

const SystemSettingsProxyAuthCard: React.FC<
  SystemSettingsProxyAuthCardProps
> = ({
  username,
  password,
  onUsernameChange,
  onPasswordChange,
  onSave,
  onClear,
  isSaving,
  lastError,
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
          <Text strong>Proxy Auth</Text>
          <Space size={token.marginSM}>
            <Button onClick={onClear} disabled={isSaving}>
              Clear
            </Button>
            <Button type="primary" onClick={onSave} loading={isSaving}>
              Save
            </Button>
          </Space>
        </Flex>
        <Space
          direction="vertical"
          size={token.marginSM}
          style={{ width: "100%" }}
        >
          <Input
            style={{ width: "100%" }}
            value={username}
            onChange={(event) => onUsernameChange(event.target.value)}
            placeholder="Username"
          />
          <Input.Password
            style={{ width: "100%" }}
            value={password}
            onChange={(event) => onPasswordChange(event.target.value)}
            placeholder="Password"
          />
        </Space>
        {lastError && <Text type="danger">{lastError}</Text>}
        <Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
          Stored in browser local storage only and applied to both HTTP and HTTPS
          proxy requests via headers. If your password includes special
          characters, prefer header-based auth instead of putting credentials in
          the proxy URL. These values are not written to config.json.
        </Text>
      </Space>
    </Card>
  );
};

export default SystemSettingsProxyAuthCard;

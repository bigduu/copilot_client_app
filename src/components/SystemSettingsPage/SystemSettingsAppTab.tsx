import React from "react";
import {
  Button,
  Card,
  Flex,
  Popconfirm,
  Space,
  Switch,
  Typography,
  theme,
} from "antd";
import { DeleteOutlined } from "@ant-design/icons";

const { Text } = Typography;
const { useToken } = theme;

interface SystemSettingsAppTabProps {
  autoGenerateTitles: boolean;
  isUpdatingAutoTitlePreference: boolean;
  onAutoTitleToggle: (checked: boolean) => void;
  themeMode: "light" | "dark";
  onThemeModeChange: (mode: "light" | "dark") => void;
  onDeleteAll: () => void;
  onDeleteEmpty: () => void;
  onClearLocalStorage: () => void;
  darkModeKey: string;
}

const SystemSettingsAppTab: React.FC<SystemSettingsAppTabProps> = ({
  autoGenerateTitles,
  isUpdatingAutoTitlePreference,
  onAutoTitleToggle,
  themeMode,
  onThemeModeChange,
  onDeleteAll,
  onDeleteEmpty,
  onClearLocalStorage,
  darkModeKey,
}) => {
  const { token } = useToken();

  return (
    <Card size="small">
      <Space
        direction="vertical"
        size={token.marginSM}
        style={{ width: "100%" }}
      >
        <Flex align="center" gap={token.marginSM}>
          <Text strong>Auto-generate Chat Titles</Text>
          <Switch
            checked={autoGenerateTitles}
            loading={isUpdatingAutoTitlePreference}
            onChange={onAutoTitleToggle}
            checkedChildren="ON"
            unCheckedChildren="OFF"
          />
        </Flex>
        <Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
          When enabled, the app generates a descriptive title after the first
          assistant response.
        </Text>
        <Flex align="center" gap={token.marginSM}>
          <Text strong>Dark Mode</Text>
          <Switch
            checked={themeMode === "dark"}
            onChange={(checked) => {
              const mode = checked ? "dark" : "light";
              onThemeModeChange(mode);
              localStorage.setItem(darkModeKey, mode);
            }}
            checkedChildren="Dark"
            unCheckedChildren="Light"
          />
        </Flex>
        <Popconfirm
          title="Delete all chats"
          description="Are you sure? This will delete all chats except pinned."
          onConfirm={onDeleteAll}
          okText="Yes, delete all"
          cancelText="Cancel"
          placement="top"
        >
          <Button danger block icon={<DeleteOutlined />}>
            Delete All Chats
          </Button>
        </Popconfirm>
        <Popconfirm
          title="Delete empty chats"
          description="Are you sure? This will delete all chats with no messages (except pinned)."
          onConfirm={onDeleteEmpty}
          okText="Yes, delete empty"
          cancelText="Cancel"
          placement="top"
        >
          <Button danger block icon={<DeleteOutlined />}>
            Delete Empty Chats
          </Button>
        </Popconfirm>
        <Popconfirm
          title="Clear Local Storage"
          description="Are you sure? This will delete all local storage data and reset the application."
          onConfirm={onClearLocalStorage}
          okText="Yes, clear it"
          cancelText="Cancel"
          placement="top"
        >
          <Button danger block icon={<DeleteOutlined />}>
            Clear Local Storage
          </Button>
        </Popconfirm>
      </Space>
    </Card>
  );
};

export default SystemSettingsAppTab;

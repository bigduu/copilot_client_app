import React, { Suspense, lazy } from "react";
import {
  Button,
  Card,
  Flex,
  Input,
  Space,
  Spin,
  Switch,
  Typography,
  theme,
} from "antd";

const SystemPromptManager = lazy(() => import("../SystemPromptManager"));
const { Text } = Typography;
const { useToken } = theme;

interface SystemSettingsPromptsTabProps {
  promptEnhancement: string;
  onPromptEnhancementChange: (value: string) => void;
  mermaidEnhancementEnabled: boolean;
  todoEnhancementEnabled: boolean;
  onMermaidToggle: (checked: boolean) => void;
  onTodoToggle: (checked: boolean) => void;
  onSaveEnhancement: () => void;
}

const SystemSettingsPromptsTab: React.FC<SystemSettingsPromptsTabProps> = ({
  promptEnhancement,
  onPromptEnhancementChange,
  mermaidEnhancementEnabled,
  todoEnhancementEnabled,
  onMermaidToggle,
  onTodoToggle,
  onSaveEnhancement,
}) => {
  const { token } = useToken();
  const tabGap = token.marginLG;

  return (
    <Flex vertical gap={tabGap}>
      <Card size="small">
        <Suspense fallback={<Spin size="small" />}>
          <SystemPromptManager />
        </Suspense>
      </Card>
      <Card size="small">
        <Space
          direction="vertical"
          size={token.marginXS}
          style={{ width: "100%" }}
        >
          <Text strong>System Prompt Enhancement</Text>
          <Flex align="center" gap={token.marginSM}>
            <Text strong>Mermaid Enhancement</Text>
            <Switch
              checked={mermaidEnhancementEnabled}
              onChange={onMermaidToggle}
              checkedChildren="ON"
              unCheckedChildren="OFF"
            />
          </Flex>
          <Flex align="center" gap={token.marginSM}>
            <Text strong>TODO List Generation</Text>
            <Switch
              checked={todoEnhancementEnabled}
              onChange={onTodoToggle}
              checkedChildren="ON"
              unCheckedChildren="OFF"
            />
          </Flex>
          <Input.TextArea
            rows={6}
            placeholder="Add global enhancement text to append to every system prompt."
            value={promptEnhancement}
            onChange={(event) => onPromptEnhancementChange(event.target.value)}
          />
          <Flex justify="flex-end">
            <Button type="primary" onClick={onSaveEnhancement}>
              Save Enhancement
            </Button>
          </Flex>
          <Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
            This text is appended first, followed by enabled system enhancements
            before each request is sent.
          </Text>
        </Space>
      </Card>
    </Flex>
  );
};

export default SystemSettingsPromptsTab;

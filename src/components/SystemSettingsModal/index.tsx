import { useState } from "react";
import {
  Modal,
  Button,
  Popconfirm,
  message,
  Switch,
  Space,
  Typography,
  Select,
  Divider,
  Spin,
  theme,
  Flex,
} from "antd";
import { DeleteOutlined } from "@ant-design/icons";
import { useChat } from "../../contexts/ChatContext";
import { useModels } from "../../hooks/useModels";
import {
  isMermaidEnhancementEnabled,
  setMermaidEnhancementEnabled,
} from "../../utils/mermaidUtils";

const { Text } = Typography;
const { useToken } = theme;

const DARK_MODE_KEY = "copilot_dark_mode";

const ModelSelection = ({
  isLoadingModels,
  modelsError,
  models,
  selectedModel, // This was correctly changed in the destructuring
  onModelChange,
}: {
  isLoadingModels: boolean;
  modelsError: string | null;
  models: string[];
  selectedModel: string | undefined; // This is the prop name
  onModelChange: (model: string) => void;
}) => {
  const { token } = useToken();
  const fallbackModel = "gpt-4o";
  // Ensure modelOptions always has at least the fallback or the selected model if models array is empty
  const modelOptions =
    models && models.length > 0
      ? models
      : selectedModel
      ? [selectedModel]
      : [fallbackModel]; // Use selectedModel here
  const value = selectedModel || fallbackModel; // And here
  return (
    <Space direction="vertical" size={token.marginXS} style={{ width: "100%" }}>
      <Text strong>Model Selection</Text>
      {isLoadingModels ? (
        <Spin size="small" />
      ) : modelsError ? (
        <Text type="danger">{modelsError}</Text>
      ) : (
        <Select
          style={{ width: "100%" }}
          placeholder="Select a model"
          value={value}
          onChange={onModelChange}
        >
          {modelOptions.map((model) => (
            <Select.Option key={model} value={model}>
              {model}
            </Select.Option>
          ))}
        </Select>
      )}
    </Space>
  );
};

const SystemSettingsModal = ({
  open,
  onClose,
  themeMode,
  onThemeModeChange,
}: {
  open: boolean;
  onClose: () => void;
  themeMode: "light" | "dark";
  onThemeModeChange: (mode: "light" | "dark") => void;
}) => {
  const { token } = useToken();
  const { deleteAllChats, deleteEmptyChats } = useChat();
  const [msgApi, contextHolder] = message.useMessage();
  const [mermaidEnhancementEnabled, setMermaidEnhancementEnabledState] =
    useState<boolean>(() => {
      return isMermaidEnhancementEnabled();
    });
  const {
    models,
    isLoading: isLoadingModels,
    error: modelsError,
    selectedModel,
    setSelectedModel,
  } = useModels();

  const handleDeleteAll = () => {
    deleteAllChats();
    msgApi.success("All chats deleted (except pinned)");
    onClose();
  };

  const handleDeleteEmpty = () => {
    deleteEmptyChats();
    msgApi.success("Empty chats deleted (except pinned)");
  };

  return (
    <Modal
      title="System Settings"
      open={open}
      onCancel={onClose}
      footer={null}
      width={520}
    >
      {contextHolder}

      {/* Model Selection Section */}
      <ModelSelection
        isLoadingModels={isLoadingModels}
        modelsError={modelsError}
        models={models}
        selectedModel={selectedModel}
        onModelChange={setSelectedModel}
      />

      <Divider />

      {/* Settings Section */}
      <Space
        direction="vertical"
        size={token.marginSM}
        style={{ width: "100%" }}
      >
        <Flex align="center" gap={token.marginSM}>
          <Text strong>Dark Mode</Text>
          <Switch
            checked={themeMode === "dark"}
            onChange={(checked) => {
              const mode = checked ? "dark" : "light";
              onThemeModeChange(mode);
              localStorage.setItem(DARK_MODE_KEY, mode);
            }}
            checkedChildren="Dark"
            unCheckedChildren="Light"
          />
        </Flex>
        <Flex align="center" gap={token.marginSM}>
          <Text strong>Mermaid Diagrams Enhancement</Text>
          <Switch
            checked={mermaidEnhancementEnabled}
            onChange={(checked) => {
              setMermaidEnhancementEnabledState(checked);
              setMermaidEnhancementEnabled(checked);
            }}
            checkedChildren="ON"
            unCheckedChildren="OFF"
          />
        </Flex>
        <Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
          When enabled, AI will be encouraged to use Mermaid diagrams for visual
          explanations
        </Text>
        <Popconfirm
          title="Delete all chats"
          description="Are you sure? This will delete all chats except pinned."
          onConfirm={handleDeleteAll}
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
          onConfirm={handleDeleteEmpty}
          okText="Yes, delete empty"
          cancelText="Cancel"
          placement="top"
        >
          <Button danger block icon={<DeleteOutlined />}>
            Delete Empty Chats
          </Button>
        </Popconfirm>
      </Space>
    </Modal>
  );
};

export { SystemSettingsModal };

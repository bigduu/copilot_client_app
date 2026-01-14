import { lazy, Suspense, useEffect, useState } from "react";
import {
  Modal,
  Button,
  Popconfirm,
  message,
  Switch,
  Space,
  Typography,
  Select,
  Spin,
  theme,
  Flex,
  Input,
} from "antd";
import { DeleteOutlined } from "@ant-design/icons";
import { useChatManager } from "../../hooks/useChatManager";
import { useModels } from "../../hooks/useModels";
import {
  getSystemPromptEnhancement,
  setSystemPromptEnhancement,
} from "../../utils/systemPromptEnhancement";
import {
  isMermaidEnhancementEnabled,
  setMermaidEnhancementEnabled,
} from "../../utils/mermaidUtils";
import {
  isTodoEnhancementEnabled,
  setTodoEnhancementEnabled,
} from "../../utils/todoEnhancementUtils";
const SystemPromptManager = lazy(() => import("../SystemPromptManager"));

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
  // Ensure model options always include the currently selected model (if the model list is empty)
  const modelOptions =
    models && models.length > 0 ? models : selectedModel ? [selectedModel] : [];

  // Handle cases where no models are available gracefully
  if (modelOptions.length === 0) {
    return (
      <Space
        direction="vertical"
        size={token.marginXS}
        style={{ width: "100%" }}
      >
        <Text strong>Model Selection</Text>
        <Text type="warning">
          No model options available, please check service connection
        </Text>
      </Space>
    );
  }

  // If no model is selected but models are available, automatically select the first one
  if (!selectedModel && modelOptions.length > 0) {
    onModelChange(modelOptions[0]);
    return (
      <Space
        direction="vertical"
        size={token.marginXS}
        style={{ width: "100%" }}
      >
        <Text strong>Model Selection</Text>
        <Spin size="small" />
      </Space>
    );
  }

  const value = selectedModel;
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
  const {
    deleteAllUnpinnedChats,
    deleteEmptyChats,
    autoGenerateTitles,
    setAutoGenerateTitlesPreference,
    isUpdatingAutoTitlePreference,
  } = useChatManager();
  const [msgApi, contextHolder] = message.useMessage();
  const {
    models,
    isLoading: isLoadingModels,
    error: modelsError,
    selectedModel,
    setSelectedModel,
  } = useModels();
  const [promptEnhancement, setPromptEnhancement] = useState("");
  const [mermaidEnhancementEnabled, setMermaidEnhancementEnabledState] =
    useState(isMermaidEnhancementEnabled());
  const [todoEnhancementEnabled, setTodoEnhancementEnabledState] = useState(
    isTodoEnhancementEnabled()
  );

  useEffect(() => {
    if (open) {
      setPromptEnhancement(getSystemPromptEnhancement());
      setMermaidEnhancementEnabledState(isMermaidEnhancementEnabled());
      setTodoEnhancementEnabledState(isTodoEnhancementEnabled());
    }
  }, [open]);

  const handleDeleteAll = () => {
    deleteAllUnpinnedChats();
    msgApi.success("All chats deleted (except pinned)");
    onClose();
  };

  const handleDeleteEmpty = () => {
    deleteEmptyChats();
    msgApi.success("Empty chats deleted (except pinned)");
  };

  const handleClearLocalStorage = () => {
    localStorage.clear();
    msgApi.success("Local storage has been cleared");
    onClose();
  };

  const handleAutoTitleToggle = async (checked: boolean) => {
    try {
      await setAutoGenerateTitlesPreference(checked);
      msgApi.success(
        checked
          ? "Auto title generation enabled"
          : "Auto title generation disabled"
      );
    } catch (error) {
      msgApi.error("Failed to update auto title preference");
    }
  };

  const handleSaveEnhancement = () => {
    setSystemPromptEnhancement(promptEnhancement);
    msgApi.success("System prompt enhancement saved");
  };

  const handleMermaidToggle = (checked: boolean) => {
    setMermaidEnhancementEnabledState(checked);
    setMermaidEnhancementEnabled(checked);
  };

  const handleTodoToggle = (checked: boolean) => {
    setTodoEnhancementEnabledState(checked);
    setTodoEnhancementEnabled(checked);
  };

  return (
    <Modal
      title="System Settings"
      open={open}
      onCancel={onClose}
      footer={null}
      width="80%"
    >
      {contextHolder}

      <Flex vertical gap="large">
        {/* Model Selection Section */}
        <ModelSelection
          isLoadingModels={isLoadingModels}
          modelsError={modelsError}
          models={models}
          selectedModel={selectedModel}
          onModelChange={setSelectedModel}
        />

        {/* System Prompt Manager Section */}
        <Suspense fallback={<Spin size="small" />}>
          <SystemPromptManager />
        </Suspense>

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
              onChange={handleMermaidToggle}
              checkedChildren="ON"
              unCheckedChildren="OFF"
            />
          </Flex>
          <Flex align="center" gap={token.marginSM}>
            <Text strong>TODO List Generation</Text>
            <Switch
              checked={todoEnhancementEnabled}
              onChange={handleTodoToggle}
              checkedChildren="ON"
              unCheckedChildren="OFF"
            />
          </Flex>
          <Input.TextArea
            rows={6}
            placeholder="Add global enhancement text to append to every system prompt."
            value={promptEnhancement}
            onChange={(event) => setPromptEnhancement(event.target.value)}
          />
          <Flex justify="flex-end">
            <Button type="primary" onClick={handleSaveEnhancement}>
              Save Enhancement
            </Button>
          </Flex>
          <Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
            This text is appended first, followed by enabled system enhancements
            before each request is sent.
          </Text>
        </Space>

        {/* Settings Section */}
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
              onChange={handleAutoTitleToggle}
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
                localStorage.setItem(DARK_MODE_KEY, mode);
              }}
              checkedChildren="Dark"
              unCheckedChildren="Light"
            />
          </Flex>
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
          <Popconfirm
            title="Clear Local Storage"
            description="Are you sure? This will delete all local storage data and reset the application."
            onConfirm={handleClearLocalStorage}
            okText="Yes, clear it"
            cancelText="Cancel"
            placement="top"
          >
            <Button danger block icon={<DeleteOutlined />}>
              Clear Local Storage
            </Button>
          </Popconfirm>
        </Space>
      </Flex>
    </Modal>
  );
};

export { SystemSettingsModal };

import { useState, lazy, Suspense } from "react";
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
} from "antd";
import {
  DeleteOutlined,
  ApiOutlined,
  DesktopOutlined,
} from "@ant-design/icons";
import { useChatManager } from "../../hooks/useChatManager";
import { useModels } from "../../hooks/useModels";
import { useServiceMode } from "../../hooks/useServiceMode";
import {
  isMermaidEnhancementEnabled,
  setMermaidEnhancementEnabled,
} from "../../utils/mermaidUtils";
const SystemPromptManager = lazy(() => import("../SystemPromptManager"));
const TemplateVariableEditor = lazy(() => import("../TemplateVariableEditor"));

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
  const [mermaidEnhancementEnabled, setMermaidEnhancementEnabledState] =
    useState<boolean>(() => {
      return isMermaidEnhancementEnabled();
    });
  const [isTemplateVariableEditorOpen, setIsTemplateVariableEditorOpen] =
    useState(false);
  const {
    models,
    isLoading: isLoadingModels,
    error: modelsError,
    selectedModel,
    setSelectedModel,
  } = useModels();
  const { setServiceMode, isOpenAIMode } = useServiceMode();

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
      msgApi.success(checked ? "自动标题生成已开启" : "自动标题生成已关闭");
    } catch (error) {
      msgApi.error("更新自动标题生成偏好失败");
    }
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

        {/* Template Variables Section */}
        <Space
          direction="vertical"
          size={token.marginSM}
          style={{ width: "100%" }}
        >
          <Flex justify="space-between" align="center">
            <Text strong>Template Variables</Text>
            <Button
              type="primary"
              onClick={() => setIsTemplateVariableEditorOpen(true)}
            >
              Configure Template Variables
            </Button>
          </Flex>
          <Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
            Configure template variables (e.g., preferred_language,
            response_format, tone, detail_level) that can be used in system
            prompts using {`{{variable_name}}`} syntax.
          </Text>
        </Space>

        {/* Settings Section */}
        <Space
          direction="vertical"
          size={token.marginSM}
          style={{ width: "100%" }}
        >
          <Flex align="center" gap={token.marginSM}>
            <Text strong>自动生成聊天标题</Text>
            <Switch
              checked={autoGenerateTitles}
              loading={isUpdatingAutoTitlePreference}
              onChange={handleAutoTitleToggle}
              checkedChildren="ON"
              unCheckedChildren="OFF"
            />
          </Flex>
          <Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
            启用后,在新会话开始时会自动调用 AI 生成更具描述性的聊天标题。
          </Text>
          <Flex align="center" gap={token.marginSM}>
            <Text strong>Service Mode</Text>
            <Switch
              checked={isOpenAIMode}
              onChange={(checked) => {
                const mode = checked ? "openai" : "tauri";
                setServiceMode(mode);
                msgApi.success(
                  `Switched to ${checked ? "OpenAI API" : "Tauri"} mode`
                );
              }}
              checkedChildren={
                <Flex align="center" gap={4}>
                  <ApiOutlined />
                  OpenAI
                </Flex>
              }
              unCheckedChildren={
                <Flex align="center" gap={4}>
                  <DesktopOutlined />
                  Tauri
                </Flex>
              }
            />
          </Flex>
          <Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
            OpenAI mode uses standard HTTP API calls, Tauri mode uses native
            commands
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
            When enabled, AI will be encouraged to use Mermaid diagrams for
            visual explanations
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

      <Suspense fallback={null}>
        <TemplateVariableEditor
          open={isTemplateVariableEditorOpen}
          onClose={() => setIsTemplateVariableEditorOpen(false)}
        />
      </Suspense>
    </Modal>
  );
};

export { SystemSettingsModal };

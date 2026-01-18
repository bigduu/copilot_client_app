import { lazy, Suspense, useEffect, useRef, useState } from "react";
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
import { serviceFactory } from "../../services/ServiceFactory";
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
import {
  clearBackendBaseUrlOverride,
  buildBackendUrl,
  getBackendBaseUrl,
  getDefaultBackendBaseUrl,
  hasBackendBaseUrlOverride,
  normalizeBackendBaseUrl,
  setBackendBaseUrl,
} from "../../utils/backendBaseUrl";
const SystemPromptManager = lazy(() => import("../SystemPromptManager"));

const { Text } = Typography;
const { useToken } = theme;

const DARK_MODE_KEY = "copilot_dark_mode";

interface McpStatusResponse {
  name: string;
  status: string;
  message?: string;
}

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
    refreshModels,
  } = useModels();
  const [promptEnhancement, setPromptEnhancement] = useState("");
  const [mermaidEnhancementEnabled, setMermaidEnhancementEnabledState] =
    useState(isMermaidEnhancementEnabled());
  const [todoEnhancementEnabled, setTodoEnhancementEnabledState] = useState(
    isTodoEnhancementEnabled()
  );
  const [backendBaseUrl, setBackendBaseUrlState] = useState(
    getBackendBaseUrl()
  );
  const [hasBackendOverride, setHasBackendOverride] = useState(
    hasBackendBaseUrlOverride()
  );
  const [mcpConfigJson, setMcpConfigJson] = useState("");
  const [mcpConfigError, setMcpConfigError] = useState<string | null>(null);
  const [mcpStatuses, setMcpStatuses] = useState<
    Record<string, McpStatusResponse | null>
  >({});
  const [isLoadingMcp, setIsLoadingMcp] = useState(false);
  const [mcpConfigDirty, setMcpConfigDirty] = useState(false);
  const mcpPollingRef = useRef<number | null>(null);
  const mcpDirtyRef = useRef(false);
  const mcpLastConfigRef = useRef<string>("");

  useEffect(() => {
    if (open) {
      setPromptEnhancement(getSystemPromptEnhancement());
      setMermaidEnhancementEnabledState(isMermaidEnhancementEnabled());
      setTodoEnhancementEnabledState(isTodoEnhancementEnabled());
      setBackendBaseUrlState(getBackendBaseUrl());
      setHasBackendOverride(hasBackendBaseUrlOverride());
      loadMcpConfig();
      if (!mcpPollingRef.current) {
        mcpPollingRef.current = window.setInterval(() => {
          void pollMcpConfig();
        }, 5000);
      }
    }
    return () => {
      if (mcpPollingRef.current) {
        window.clearInterval(mcpPollingRef.current);
        mcpPollingRef.current = null;
      }
    };
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

  const validateBackendUrl = (value: string): string | null => {
    const normalized = normalizeBackendBaseUrl(value);
    if (!normalized) {
      return "Backend URL cannot be empty";
    }

    try {
      const parsed = new URL(normalized);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        return "Backend URL must start with http:// or https://";
      }
    } catch {
      return "Backend URL is not a valid URL";
    }

    if (!normalized.endsWith("/v1")) {
      return 'Backend URL must end with "/v1"';
    }

    return null;
  };

  const handleSaveBackendBaseUrl = async () => {
    const error = validateBackendUrl(backendBaseUrl);
    if (error) {
      msgApi.error(error);
      return;
    }

    const normalized = normalizeBackendBaseUrl(backendBaseUrl);
    setBackendBaseUrl(normalized);
    setBackendBaseUrlState(normalized);
    setHasBackendOverride(true);
    msgApi.success("Backend URL saved");

    try {
      await refreshModels();
    } catch {
    }
  };

  const handleResetBackendBaseUrl = async () => {
    clearBackendBaseUrlOverride();
    setBackendBaseUrlState(getDefaultBackendBaseUrl());
    setHasBackendOverride(false);
    msgApi.success("Backend URL reset to default");

    try {
      await refreshModels();
    } catch {
    }
  };

  const fetchMcpConfig = async () => {
    const config = await serviceFactory.getMcpServers();
    return config ?? { mcpServers: {} };
  };

  const applyMcpConfig = async (config: any, force = false) => {
    const json = JSON.stringify(config ?? { mcpServers: {} }, null, 2);
    if (force || !mcpDirtyRef.current) {
      setMcpConfigJson(json);
    }
    setMcpConfigDirty(false);
    mcpDirtyRef.current = false;
    mcpLastConfigRef.current = json;
    await refreshMcpStatuses(config);
  };

  const loadMcpConfig = async () => {
    setIsLoadingMcp(true);
    setMcpConfigError(null);
    try {
      const config = await fetchMcpConfig();
      await applyMcpConfig(config, true);
    } catch (error) {
      setMcpConfigError(
        error instanceof Error
          ? error.message
          : "Failed to load MCP configuration"
      );
    } finally {
      setIsLoadingMcp(false);
    }
  };

  const reloadMcpConfig = async () => {
    const response = await fetch(buildBackendUrl("/mcp/reload"), {
      method: "POST",
    });
    if (!response.ok) {
      throw new Error(`Failed to reload MCP config: ${response.status}`);
    }
    return await response.json();
  };

  const pollMcpConfig = async () => {
    if (!open) return;
    try {
      const config = await fetchMcpConfig();
      const json = JSON.stringify(config ?? { mcpServers: {} }, null, 2);
      if (!mcpDirtyRef.current && json !== mcpLastConfigRef.current) {
        const reloaded = await reloadMcpConfig();
        await applyMcpConfig(reloaded, true);
        return;
      }
      await applyMcpConfig(config);
    } catch {
    }
  };

  const refreshMcpStatuses = async (config: any) => {
    const serverNames = Object.keys(config?.mcpServers ?? {});
    if (serverNames.length === 0) {
      setMcpStatuses({});
      return;
    }
    const entries = await Promise.all(
      serverNames.map(async (name) => {
        try {
          const status = await serviceFactory.getMcpClientStatus(name);
          return [name, status as McpStatusResponse] as const;
        } catch {
          return [name, null] as const;
        }
      })
    );
    setMcpStatuses(Object.fromEntries(entries));
  };

  const handleSaveMcpConfig = async () => {
    try {
      const parsed = JSON.parse(mcpConfigJson);
      await serviceFactory.setMcpServers(parsed);
      msgApi.success("MCP configuration saved");
      setMcpConfigDirty(false);
      mcpDirtyRef.current = false;
      mcpLastConfigRef.current = JSON.stringify(parsed, null, 2);
      await loadMcpConfig();
    } catch (error) {
      msgApi.error(
        error instanceof Error
          ? error.message
          : "Failed to save MCP configuration"
      );
    }
  };

  const formatMcpStatus = (status: McpStatusResponse | null) => {
    if (!status) return "unknown";
    if (status.status === "error") {
      return status.message ? `error: ${status.message}` : "error";
    }
    return status.status;
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

        <Space
          direction="vertical"
          size={token.marginXS}
          style={{ width: "100%" }}
        >
          <Text strong>Backend API Base URL</Text>
          <Input
            placeholder={getDefaultBackendBaseUrl()}
            value={backendBaseUrl}
            onChange={(event) => setBackendBaseUrlState(event.target.value)}
          />
          <Flex justify="flex-end" gap={token.marginSM}>
            <Button
              disabled={!hasBackendOverride}
              onClick={handleResetBackendBaseUrl}
            >
              Reset to Default
            </Button>
            <Button type="primary" onClick={handleSaveBackendBaseUrl}>
              Save
            </Button>
          </Flex>
          <Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
            Must be a full base URL including <Text code>/v1</Text> (e.g.
            <Text code>http://127.0.0.1:8080/v1</Text>).
          </Text>
        </Space>

        <Space
          direction="vertical"
          size={token.marginXS}
          style={{ width: "100%" }}
        >
          <Flex justify="space-between" align="center">
            <Text strong>MCP Server Configuration</Text>
            <Space size={token.marginSM}>
              <Button
                onClick={async () => {
                  try {
                    setIsLoadingMcp(true);
                    const reloaded = await reloadMcpConfig();
                    await applyMcpConfig(reloaded, true);
                  } catch (error) {
                    msgApi.error(
                      error instanceof Error
                        ? error.message
                        : "Failed to reload MCP configuration"
                    );
                  } finally {
                    setIsLoadingMcp(false);
                  }
                }}
                disabled={isLoadingMcp}
              >
                Reload
              </Button>
              <Button
                type="primary"
                onClick={handleSaveMcpConfig}
                disabled={isLoadingMcp}
              >
                Save
              </Button>
            </Space>
          </Flex>
          <Input.TextArea
            rows={10}
            value={mcpConfigJson}
            onChange={(event) => {
              setMcpConfigJson(event.target.value);
              setMcpConfigDirty(true);
              mcpDirtyRef.current = true;
            }}
            placeholder='{"mcpServers":{}}'
          />
          {mcpConfigError && <Text type="danger">{mcpConfigError}</Text>}
          {Object.keys(mcpStatuses).length > 0 && (
            <Space
              direction="vertical"
              size={token.marginXS}
              style={{ width: "100%" }}
            >
              {Object.entries(mcpStatuses).map(([name, status]) => (
                <Flex key={name} justify="space-between" align="center">
                  <Text code>{name}</Text>
                  <Text
                    type={status?.status === "error" ? "danger" : "secondary"}
                  >
                    {formatMcpStatus(status)}
                  </Text>
                </Flex>
              ))}
            </Space>
          )}
          <Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
            Edit <Text code>~/.bodhi/mcp_servers.json</Text> directly or use this
            editor. The UI refreshes periodically; use Reload to apply file
            changes or Save to persist edits.
          </Text>
        </Space>

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

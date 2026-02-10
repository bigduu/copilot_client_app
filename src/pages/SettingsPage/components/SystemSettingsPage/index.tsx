import { useEffect, useState } from "react";
import { Button, Flex, Layout, Tabs, Typography, message, theme } from "antd";
import { ArrowLeftOutlined } from "@ant-design/icons";
import { useChatManager } from "../../../ChatPage/hooks/useChatManager";
import { useModels } from "../../hooks/useModels";
import {
  getSystemPromptEnhancement,
  setSystemPromptEnhancement,
} from "../../../../shared/utils/systemPromptEnhancement";
import {
  isMermaidEnhancementEnabled,
  setMermaidEnhancementEnabled,
} from "../../../../shared/utils/mermaidUtils";
import {
  isTodoEnhancementEnabled,
  setTodoEnhancementEnabled,
} from "../../../../shared/utils/todoEnhancementUtils";
import { getDefaultBackendBaseUrl } from "../../../../shared/utils/backendBaseUrl";
import SystemSettingsConfigTab from "./SystemSettingsConfigTab";
import SystemSettingsAgentTab from "./SystemSettingsAgentTab";
import SystemSettingsPromptsTab from "./SystemSettingsPromptsTab";
import SystemSettingsAppTab from "./SystemSettingsAppTab";
import SystemSettingsKeywordMaskingTab from "./SystemSettingsKeywordMaskingTab";
import SystemSettingsWorkflowsTab from "./SystemSettingsWorkflowsTab";
import SystemSettingsMcpTab from "./SystemSettingsMcpTab";
import { useSystemSettingsBodhiConfig } from "./useSystemSettingsBodhiConfig";
import { useSystemSettingsBackend } from "./useSystemSettingsBackend";
import { SkillManager } from "../../../../components/Skill";

const { Text } = Typography;
const { useToken } = theme;

const DARK_MODE_KEY = "copilot_dark_mode";

const SystemSettingsPage = ({
  themeMode,
  onThemeModeChange,
  onBack,
}: {
  themeMode: "light" | "dark";
  onThemeModeChange: (mode: "light" | "dark") => void;
  onBack: () => void;
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
    isTodoEnhancementEnabled(),
  );
  const {
    backendBaseUrl,
    setBackendBaseUrlState,
    hasBackendOverride,
    handleSaveBackendBaseUrl,
    handleResetBackendBaseUrl,
  } = useSystemSettingsBackend({
    msgApi,
    refreshModels,
  });

  const bodhiConfigState = useSystemSettingsBodhiConfig({ msgApi });

  const handleDeleteAll = () => {
    deleteAllUnpinnedChats();
    msgApi.success("All chats deleted (except pinned)");
  };

  const handleDeleteEmpty = () => {
    deleteEmptyChats();
    msgApi.success("Empty chats deleted (except pinned)");
  };

  const handleClearLocalStorage = () => {
    localStorage.clear();
    msgApi.success("Local storage has been cleared");
  };

  const handleAutoTitleToggle = async (checked: boolean) => {
    try {
      await setAutoGenerateTitlesPreference(checked);
      msgApi.success(
        checked
          ? "Auto title generation enabled"
          : "Auto title generation disabled",
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

  useEffect(() => {
    setPromptEnhancement(getSystemPromptEnhancement());
    setMermaidEnhancementEnabledState(isMermaidEnhancementEnabled());
    setTodoEnhancementEnabledState(isTodoEnhancementEnabled());
  }, []);

  return (
    <Flex
      vertical
      style={{
        height: "100vh",
        overflow: "hidden",
        background: token.colorBgContainer,
      }}
    >
      {contextHolder}
      <Flex
        align="center"
        justify="space-between"
        style={{
          padding: token.padding,
          borderBottom: `1px solid ${token.colorBorderSecondary}`,
        }}
      >
        <Flex align="center" gap={token.marginSM}>
          <Button icon={<ArrowLeftOutlined />} onClick={onBack}>
            Back
          </Button>
          <Text strong>System Settings</Text>
        </Flex>
      </Flex>
      <Layout.Content
        style={{
          flex: 1,
          minHeight: 0,
          overflow: "auto",
          padding: token.padding,
        }}
      >
        <Tabs
          tabPosition="left"
          items={[
            {
              key: "config",
              label: "Config",
              children: (
                <SystemSettingsConfigTab
                  bodhiConfigJson={bodhiConfigState.bodhiConfigJson}
                  bodhiConfigError={bodhiConfigState.bodhiConfigError}
                  isLoadingBodhiConfig={bodhiConfigState.isLoadingBodhiConfig}
                  models={models}
                  selectedModel={selectedModel}
                  onModelChange={setSelectedModel}
                  modelsError={modelsError}
                  isLoadingModels={isLoadingModels}
                  backendBaseUrl={backendBaseUrl}
                  onBackendBaseUrlChange={setBackendBaseUrlState}
                  onSaveBackendBaseUrl={handleSaveBackendBaseUrl}
                  onResetBackendBaseUrl={handleResetBackendBaseUrl}
                  hasBackendOverride={hasBackendOverride}
                  defaultBackendBaseUrl={getDefaultBackendBaseUrl()}
                  onReload={async () => {
                    try {
                      await bodhiConfigState.reloadBodhiConfig();
                    } catch (error) {
                      msgApi.error(
                        error instanceof Error
                          ? error.message
                          : "Failed to reload Bodhi config",
                      );
                    }
                  }}
                  onSave={bodhiConfigState.handleSaveBodhiConfig}
                  onChange={(value) => {
                    bodhiConfigState.setBodhiConfigJson(value);
                    bodhiConfigState.bodhiConfigDirtyRef.current = true;
                  }}
                />
              ),
            },
            {
              key: "agent",
              label: "Agent",
              children: <SystemSettingsAgentTab />,
            },
            {
              key: "prompts",
              label: "Prompts",
              children: (
                <SystemSettingsPromptsTab
                  promptEnhancement={promptEnhancement}
                  onPromptEnhancementChange={setPromptEnhancement}
                  mermaidEnhancementEnabled={mermaidEnhancementEnabled}
                  todoEnhancementEnabled={todoEnhancementEnabled}
                  onMermaidToggle={handleMermaidToggle}
                  onTodoToggle={handleTodoToggle}
                  onSaveEnhancement={handleSaveEnhancement}
                />
              ),
            },
            {
              key: "skills",
              label: "Skills",
              children: <SkillManager />,
            },
            {
              key: "workflows",
              label: "Workflows",
              children: <SystemSettingsWorkflowsTab />,
            },
            {
              key: "mcp",
              label: "MCP",
              children: <SystemSettingsMcpTab />,
            },
            {
              key: "app",
              label: "App",
              children: (
                <SystemSettingsAppTab
                  autoGenerateTitles={autoGenerateTitles}
                  isUpdatingAutoTitlePreference={isUpdatingAutoTitlePreference}
                  onAutoTitleToggle={handleAutoTitleToggle}
                  themeMode={themeMode}
                  onThemeModeChange={onThemeModeChange}
                  onDeleteAll={handleDeleteAll}
                  onDeleteEmpty={handleDeleteEmpty}
                  onClearLocalStorage={handleClearLocalStorage}
                  darkModeKey={DARK_MODE_KEY}
                />
              ),
            },
            {
              key: "masking",
              label: "Masking",
              children: <SystemSettingsKeywordMaskingTab />,
            },
          ]}
        />
      </Layout.Content>
    </Flex>
  );
};

export { SystemSettingsPage };

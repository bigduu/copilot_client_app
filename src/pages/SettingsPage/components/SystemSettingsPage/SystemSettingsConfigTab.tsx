import React, { useState, useEffect, useCallback } from "react";
import { Card, Space, Typography, Input, Button, theme } from "antd";
import { NetworkSettingsCard } from "./NetworkSettingsCard";
import { CopilotSettingsCard } from "./CopilotSettingsCard";
import { ModelMappingCard } from "./ModelMappingCard";
import { serviceFactory } from "../../../../services/common/ServiceFactory";

const { Text } = Typography;
const { useToken } = theme;

interface SystemSettingsConfigTabProps {
  msgApi: {
    success: (content: string) => void;
    error: (content: string) => void;
  };
  models: string[];
  modelsError: string | null;
  isLoadingModels: boolean;
}

export const SystemSettingsConfigTab: React.FC<SystemSettingsConfigTabProps> = ({
  msgApi,
  models,
  modelsError,
  isLoadingModels,
}) => {
  const { token } = useToken();
  const [config, setConfig] = useState({
    http_proxy: "",
    https_proxy: "",
    model: "",
    headless_auth: false,
  });
  const [backendBaseUrl, setBackendBaseUrl] = useState("http://127.0.0.1:8080/v1");
  const [isLoading, setIsLoading] = useState(false);

  // Load config
  const loadConfig = useCallback(async () => {
    setIsLoading(true);
    try {
      const bambooConfig = await serviceFactory.getBambooConfig();
      setConfig({
        http_proxy: bambooConfig.http_proxy || "",
        https_proxy: bambooConfig.https_proxy || "",
        model: bambooConfig.model || "",
        headless_auth: bambooConfig.headless_auth || false,
      });
    } catch (error) {
      console.error("Failed to load config:", error);
      msgApi.error("Failed to load configuration");
    } finally {
      setIsLoading(false);
    }
  }, [msgApi]);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  // Handlers
  const handleHttpProxyChange = (value: string) => {
    setConfig((prev) => ({ ...prev, http_proxy: value }));
  };

  const handleHttpsProxyChange = (value: string) => {
    setConfig((prev) => ({ ...prev, https_proxy: value }));
  };

  const handleModelChange = (model: string) => {
    setConfig((prev) => ({ ...prev, model }));
  };

  const handleHeadlessAuthChange = (checked: boolean) => {
    setConfig((prev) => ({ ...prev, headless_auth: checked }));
  };

  const handleSaveConfig = async () => {
    setIsLoading(true);
    try {
      await serviceFactory.setBambooConfig(config);
      msgApi.success("Configuration saved successfully");
    } catch (error) {
      console.error("Failed to save config:", error);
      msgApi.error("Failed to save configuration");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveBackendUrl = async () => {
    msgApi.success("Backend URL saved");
  };

  const handleResetBackendUrl = () => {
    setBackendBaseUrl("http://127.0.0.1:8080/v1");
    msgApi.success("Backend URL reset to default");
  };

  return (
    <Space direction="vertical" size={token.marginMD} style={{ width: "100%" }}>
      {/* Network Settings */}
      <NetworkSettingsCard
        httpProxy={config.http_proxy}
        httpsProxy={config.https_proxy}
        onHttpProxyChange={handleHttpProxyChange}
        onHttpsProxyChange={handleHttpsProxyChange}
        onReload={loadConfig}
        onSave={handleSaveConfig}
        isLoading={isLoading}
      />

      {/* GitHub Copilot Settings */}
      <CopilotSettingsCard
        model={config.model}
        onModelChange={handleModelChange}
        headlessAuth={config.headless_auth}
        onHeadlessAuthChange={handleHeadlessAuthChange}
        models={models}
        isLoadingModels={isLoadingModels}
        modelsError={modelsError}
        onReload={loadConfig}
        onSave={handleSaveConfig}
        isLoading={isLoading}
      />

      {/* Model Mapping */}
      <ModelMappingCard
        models={models}
        isLoadingModels={isLoadingModels}
      />

      {/* Backend Settings */}
      <Card size="small" title={<Text strong>Backend API Base URL</Text>}>
        <Space
          direction="vertical"
          size={token.marginSM}
          style={{ width: "100%" }}
        >
          <Space
            direction="vertical"
            size={token.marginXXS}
            style={{ width: "100%" }}
          >
            <Input
              style={{ width: "100%" }}
              value={backendBaseUrl}
              onChange={(e) => setBackendBaseUrl(e.target.value)}
              placeholder="http://127.0.0.1:8080/v1"
            />
          </Space>
          <Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
            Must include /v1 path
          </Text>
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: token.marginSM,
            }}
          >
            <Button onClick={handleResetBackendUrl}>Reset to Default</Button>
            <Button type="primary" onClick={handleSaveBackendUrl}>
              Save
            </Button>
          </div>
        </Space>
      </Card>
    </Space>
  );
};

export default SystemSettingsConfigTab;

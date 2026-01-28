import React from "react";
import { Button, Card, Flex, Input, Space, Typography, theme } from "antd";
import SystemSettingsModelSelection from "./SystemSettingsModelSelection";

const { Text } = Typography;
const { useToken } = theme;

interface SystemSettingsModelTabProps {
  isLoadingModels: boolean;
  modelsError: string | null;
  models: string[];
  selectedModel: string | undefined;
  onModelChange: (model: string) => void;
  backendBaseUrl: string;
  onBackendBaseUrlChange: (value: string) => void;
  onSaveBackendBaseUrl: () => void;
  onResetBackendBaseUrl: () => void;
  hasBackendOverride: boolean;
  defaultBackendBaseUrl: string;
}

const SystemSettingsModelTab: React.FC<SystemSettingsModelTabProps> = ({
  isLoadingModels,
  modelsError,
  models,
  selectedModel,
  onModelChange,
  backendBaseUrl,
  onBackendBaseUrlChange,
  onSaveBackendBaseUrl,
  onResetBackendBaseUrl,
  hasBackendOverride,
  defaultBackendBaseUrl,
}) => {
  const { token } = useToken();
  const tabGap = token.marginLG;

  return (
    <Flex vertical gap={tabGap}>
      <Card size="small">
        <SystemSettingsModelSelection
          isLoadingModels={isLoadingModels}
          modelsError={modelsError}
          models={models}
          selectedModel={selectedModel}
          onModelChange={onModelChange}
        />
      </Card>
      <Card size="small">
        <Space
          direction="vertical"
          size={token.marginXS}
          style={{ width: "100%" }}
        >
          <Text strong>Backend API Base URL</Text>
          <Input
            placeholder={defaultBackendBaseUrl}
            value={backendBaseUrl}
            onChange={(event) => onBackendBaseUrlChange(event.target.value)}
          />
          <Flex justify="flex-end" gap={token.marginSM}>
            <Button
              disabled={!hasBackendOverride}
              onClick={onResetBackendBaseUrl}
            >
              Reset to Default
            </Button>
            <Button type="primary" onClick={onSaveBackendBaseUrl}>
              Save
            </Button>
          </Flex>
          <Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
            Must be a full base URL including <Text code>/v1</Text> (e.g.{" "}
            <Text code>http://127.0.0.1:8080/v1</Text>).
          </Text>
        </Space>
      </Card>
    </Flex>
  );
};

export default SystemSettingsModelTab;

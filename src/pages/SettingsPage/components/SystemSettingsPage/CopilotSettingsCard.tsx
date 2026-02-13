import React from "react";
import { Button, Card, Select, Space, Switch, Typography, Alert, theme } from "antd";

const { Text } = Typography;
const { useToken } = theme;

interface CopilotSettingsCardProps {
  model: string;
  onModelChange: (model: string) => void;
  headlessAuth: boolean;
  onHeadlessAuthChange: (checked: boolean) => void;
  models: string[];
  isLoadingModels: boolean;
  modelsError: string | null;
  onReload: () => void;
  onSave: () => void;
  isLoading: boolean;
}

export const CopilotSettingsCard: React.FC<CopilotSettingsCardProps> = ({
  model,
  onModelChange,
  headlessAuth,
  onHeadlessAuthChange,
  models,
  isLoadingModels,
  modelsError,
  onReload,
  onSave,
  isLoading,
}) => {
  const { token } = useToken();

  return (
    <Card size="small" title={<Text strong>GitHub Copilot Settings</Text>}>
      <Space
        direction="vertical"
        size={token.marginSM}
        style={{ width: "100%" }}
      >
        {/* Model Selection */}
        <Space
          direction="vertical"
          size={token.marginXXS}
          style={{ width: "100%" }}
        >
          <Text type="secondary">Model Selection</Text>
          <Select
            style={{ width: "100%" }}
            value={model || undefined}
            onChange={onModelChange}
            placeholder="Select a model"
            loading={isLoadingModels}
            disabled={isLoadingModels || isLoading}
            showSearch
            optionFilterProp="children"
            options={models.map((m) => ({ label: m, value: m }))}
          />
          {modelsError && <Text type="danger">{modelsError}</Text>}
        </Space>

        {/* Headless Auth */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <Space direction="vertical" size={0}>
            <Text type="secondary">Headless Authentication</Text>
            <Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
              Print login URL in console instead of opening browser
            </Text>
          </Space>
          <Switch
            checked={headlessAuth}
            onChange={onHeadlessAuthChange}
            disabled={isLoading}
          />
        </div>

        {/* Info */}
        <Alert
          type="info"
          message="Authentication and API endpoints are automatically managed by GitHub Copilot"
          showIcon
        />

        {/* Save buttons */}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: token.marginSM }}>
          <Button onClick={onReload} disabled={isLoading}>
            Reload
          </Button>
          <Button type="primary" onClick={onSave} disabled={isLoading}>
            Save
          </Button>
        </div>
      </Space>
    </Card>
  );
};

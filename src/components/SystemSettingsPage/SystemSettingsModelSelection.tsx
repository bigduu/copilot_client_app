import React from "react";
import { Select, Space, Spin, Typography, theme } from "antd";

const { Text } = Typography;
const { useToken } = theme;

interface SystemSettingsModelSelectionProps {
  isLoadingModels: boolean;
  modelsError: string | null;
  models: string[];
  selectedModel: string | undefined;
  onModelChange: (model: string) => void;
}

const SystemSettingsModelSelection: React.FC<
  SystemSettingsModelSelectionProps
> = ({
  isLoadingModels,
  modelsError,
  models,
  selectedModel,
  onModelChange,
}) => {
  const { token } = useToken();
  const modelOptions =
    models && models.length > 0 ? models : selectedModel ? [selectedModel] : [];

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
          value={selectedModel}
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

export default SystemSettingsModelSelection;

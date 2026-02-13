import React, { useState, useEffect } from "react";
import {
  Collapse,
  Select,
  Space,
  Typography,
  Divider,
  theme,
} from "antd";
import { serviceFactory } from "../../../../services/common/ServiceFactory";

const { Text } = Typography;
const { useToken } = theme;

interface ModelMapping {
  [key: string]: string;
}

interface ModelMappingCardProps {
  models: string[];
  isLoadingModels: boolean;
}

export const ModelMappingCard: React.FC<ModelMappingCardProps> = ({
  models,
  isLoadingModels,
}) => {
  const { token } = useToken();
  const [mappings, setMappings] = useState<ModelMapping>({});

  // Load model mappings
  useEffect(() => {
    const loadMappings = async () => {
      try {
        const response = await serviceFactory.getAnthropicModelMapping();
        setMappings(response.mappings || {});
      } catch (error) {
        console.error("Failed to load model mappings:", error);
      }
    };
    loadMappings();
  }, []);

  const handleMappingChange = async (modelType: string, copilotModel: string) => {
    const newMappings = { ...mappings, [modelType]: copilotModel };
    setMappings(newMappings);

    try {
      await serviceFactory.setAnthropicModelMapping({ mappings: newMappings });
    } catch (error) {
      console.error("Failed to save model mapping:", error);
    }
  };

  const modelTypes = [
    { key: "opus", label: "Opus", description: 'matches models containing "opus"' },
    { key: "sonnet", label: "Sonnet", description: 'matches models containing "sonnet"' },
    { key: "haiku", label: "Haiku", description: 'matches models containing "haiku"' },
  ];

  const collapseItems = [
    {
      key: "1",
      label: "Anthropic Model Mapping",
      children: (
        <Space
          direction="vertical"
          size={token.marginSM}
          style={{ width: "100%" }}
        >
          <Text type="secondary">
            Configure which Copilot models to use when Claude CLI requests
            specific models.
          </Text>

          {modelTypes.map(({ key, label, description }) => (
            <Space
              key={key}
              direction="vertical"
              size={token.marginXXS}
              style={{ width: "100%" }}
            >
              <Text type="secondary">
                {label} ({description})
              </Text>
              <Select
                style={{ width: "100%" }}
                value={mappings[key] || undefined}
                onChange={(value) => handleMappingChange(key, value)}
                placeholder={`Select ${label} model`}
                loading={isLoadingModels}
                disabled={isLoadingModels}
                showSearch
                optionFilterProp="children"
                options={models.map((m) => ({ label: m, value: m }))}
              />
            </Space>
          ))}

          <Divider style={{ margin: `${token.marginSM} 0` }} />

          <Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
            Stored in: <Text code>~/.bamboo/anthropic-model-mapping.json</Text>
          </Text>
        </Space>
      ),
    },
  ];

  return (
    <Collapse
      size="small"
      items={collapseItems}
      style={{ marginBottom: token.marginSM }}
    />
  );
};

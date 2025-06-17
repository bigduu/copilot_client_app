import React, { useState, useMemo } from "react";
import {
  Modal,
  List,
  Radio,
  theme,
  Typography,
  Space,
  Collapse,
  Button,
  Tag,
  Empty,
} from "antd";
import {
  ToolOutlined,
  FileTextOutlined,
  PlayCircleOutlined,
} from "@ant-design/icons";
import {
  SystemPromptPreset,
  SystemPromptPresetList,
  TOOL_CATEGORIES,
} from "../../types/chat";
// SystemPromptService has been removed, now using backend configuration

const { Text, Title } = Typography;
const { Panel } = Collapse;
const { useToken } = theme;

interface SystemPromptSelectorProps {
  open: boolean;
  onClose: () => void;
  onSelect: (preset: SystemPromptPreset) => void;
  presets: SystemPromptPresetList;
  title?: string;
  showCancelButton?: boolean;
}

// Category icon mapping
const getCategoryIcon = (category: string) => {
  switch (category) {
    case TOOL_CATEGORIES.FILE_READER:
      return <FileTextOutlined />;
    case TOOL_CATEGORIES.COMMAND_EXECUTOR:
      return <PlayCircleOutlined />;
    case TOOL_CATEGORIES.GENERAL:
    default:
      return <ToolOutlined />;
  }
};

// Category display name mapping
const getCategoryDisplayName = (category: string): string => {
  switch (category) {
    case TOOL_CATEGORIES.GENERAL:
      return "General Assistant";
    case TOOL_CATEGORIES.FILE_READER:
      return "File Operations";
    case TOOL_CATEGORIES.COMMAND_EXECUTOR:
      return "Command Execution";
    default:
      return "General Assistant";
  }
};

// Category tag color mapping
const getCategoryTagColor = (category: string) => {
  switch (category) {
    case TOOL_CATEGORIES.GENERAL:
      return "blue";
    case TOOL_CATEGORIES.FILE_READER:
      return "green";
    case TOOL_CATEGORIES.COMMAND_EXECUTOR:
      return "magenta";
    default:
      return "default";
  }
};

const SystemPromptSelector: React.FC<SystemPromptSelectorProps> = ({
  open,
  onClose,
  onSelect,
  presets,
  title = "Select AI Capability Mode",
  showCancelButton = true,
}) => {
  const { token } = useToken();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Remove unused systemPromptService

  // Group presets by category
  const groupedPresets = useMemo(() => {
    const groups: Record<string, SystemPromptPreset[]> = {};

    presets.forEach((preset) => {
      const category = preset.category || TOOL_CATEGORIES.GENERAL;
      if (!groups[category]) {
        groups[category] = [];
      }
      groups[category].push(preset);
    });

    return groups;
  }, [presets]);

  // Get category list, general category comes first
  const categoryOrder = useMemo(() => {
    const categories = Object.keys(groupedPresets);
    return categories.sort((a, b) => {
      if (a === TOOL_CATEGORIES.GENERAL) return -1;
      if (b === TOOL_CATEGORIES.GENERAL) return 1;
      return a.localeCompare(b);
    });
  }, [groupedPresets]);

  const handleSelect = (preset: SystemPromptPreset) => {
    setSelectedId(preset.id);
    onSelect(preset);
    onClose();
  };

  const handleCancel = () => {
    setSelectedId(null);
    onClose();
  };

  // Render preset item
  const renderPresetItem = (preset: SystemPromptPreset) => (
    <List.Item
      key={preset.id}
      style={{
        cursor: "pointer",
        padding: token.paddingMD,
        borderRadius: token.borderRadius,
        border:
          selectedId === preset.id
            ? `2px solid ${token.colorPrimary}`
            : `1px solid ${token.colorBorderSecondary}`,
        marginBottom: token.marginXS,
        backgroundColor:
          selectedId === preset.id
            ? token.colorPrimaryBg
            : token.colorBgContainer,
        transition: "all 0.2s ease",
      }}
      onClick={() => setSelectedId(preset.id)}
    >
      <Space direction="vertical" style={{ width: "100%" }}>
        <Space>
          <Radio
            checked={selectedId === preset.id}
            onChange={() => setSelectedId(preset.id)}
          />
          <Text strong>{preset.name}</Text>
          {preset.mode === "tool_specific" && (
            <Tag
              color={getCategoryTagColor(preset.category)}
              icon={getCategoryIcon(preset.category)}
            >
              Specialized Mode
            </Tag>
          )}
        </Space>

        {/* Capability description - highlighted */}
        <Text
          style={{
            fontSize: token.fontSize,
            marginLeft: token.marginLG,
            lineHeight: 1.5,
            color: token.colorText,
            display: "block",
            marginBottom: token.marginXS,
          }}
        >
          {preset.description ||
            "General AI assistant supporting various conversation and analysis tasks"}
        </Text>

        {/* Tool-specific mode feature descriptions */}
        {preset.mode === "tool_specific" && (
          <Space
            direction="vertical"
            size="small"
            style={{ marginLeft: token.marginLG, width: "100%" }}
          >
            {preset.autoToolPrefix && (
              <Space size="small">
                <Tag color="processing">Auto-prefix</Tag>
                <Text code style={{ fontSize: token.fontSizeSM }}>
                  {preset.autoToolPrefix}
                </Text>
              </Space>
            )}

            {preset.allowedTools && preset.allowedTools.length > 0 && (
              <Space size="small" wrap>
                <Tag color="success">Supported Tools</Tag>
                <Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
                  {preset.allowedTools.slice(0, 3).join(", ")}
                  {preset.allowedTools.length > 3 && " etc..."}
                </Text>
              </Space>
            )}

            {preset.restrictConversation && (
              <Space size="small">
                <Tag color="orange">Focus Mode</Tag>
                <Text type="warning" style={{ fontSize: token.fontSizeSM }}>
                  Optimized for professional task execution efficiency
                </Text>
              </Space>
            )}
          </Space>
        )}
      </Space>
    </List.Item>
  );

  return (
    <Modal
      title={
        <Space>
          <ToolOutlined />
          {title}
        </Space>
      }
      open={open}
      onCancel={handleCancel}
      width={700}
      footer={
        <Space>
          {showCancelButton && <Button onClick={handleCancel}>Cancel</Button>}
          <Button
            type="primary"
            disabled={!selectedId}
            onClick={() => {
              const preset = presets.find((p) => p.id === selectedId);
              if (preset) {
                handleSelect(preset);
              }
            }}
          >
            Create New Chat
          </Button>
        </Space>
      }
      styles={{
        body: {
          maxHeight: "70vh",
          overflowY: "auto",
          padding: token.paddingMD,
        },
      }}
    >
      {/* Help description */}
      <div style={{ marginBottom: token.marginMD }}>
        <Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
          Select the AI capability mode that suits your task. Specialized modes
          are optimized for specific tools and tasks, providing more precise
          support.
        </Text>
      </div>

      {presets.length === 0 ? (
        <Empty
          description="No available AI capability modes"
          style={{ margin: token.marginLG }}
        />
      ) : (
        <Collapse
          defaultActiveKey={categoryOrder}
          ghost
          expandIconPosition="end"
          style={{ backgroundColor: "transparent" }}
        >
          {categoryOrder.map((category) => (
            <Panel
              header={
                <Space>
                  {getCategoryIcon(category)}
                  <Title level={5} style={{ margin: 0 }}>
                    {getCategoryDisplayName(category)}
                  </Title>
                  <Text type="secondary">
                    ({groupedPresets[category].length} items)
                  </Text>
                </Space>
              }
              key={category}
              style={{
                border: `1px solid ${token.colorBorderSecondary}`,
                borderRadius: token.borderRadius,
                marginBottom: token.marginXS,
              }}
            >
              <List
                dataSource={groupedPresets[category]}
                renderItem={renderPresetItem}
                split={false}
              />
            </Panel>
          ))}
        </Collapse>
      )}
    </Modal>
  );
};

export default SystemPromptSelector;

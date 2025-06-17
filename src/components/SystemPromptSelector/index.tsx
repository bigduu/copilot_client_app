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
import { ToolOutlined } from "@ant-design/icons";
import { SystemPromptPreset, SystemPromptPresetList } from "../../types/chat";
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

/**
 * 严格模式类别配置函数 - 所有配置必须从后端获取
 * 前端不包含任何硬编码配置，未配置的类别将抛出错误
 */

// Category icon mapping - 严格模式，没有配置就报错
const getCategoryIcon = (
  category: string,
  categoryData?: any
): React.ReactNode => {
  // 如果有后端提供的类别数据，使用其中的图标信息
  if (categoryData?.icon) {
    // 这里可以根据后端提供的图标字符串返回对应的React图标组件
    // 实际实现应该从后端获取图标映射配置
    return <span>{categoryData.icon}</span>;
  }

  throw new Error(
    `未配置的类别图标: ${category}。请确保后端已提供该类别的图标配置。`
  );
};

// Category display name mapping - 严格模式，没有配置就报错
const getCategoryDisplayName = (
  category: string,
  categoryData?: any
): string => {
  // 如果有后端提供的类别数据，使用其中的显示名称
  if (categoryData?.display_name || categoryData?.name) {
    return categoryData.display_name || categoryData.name;
  }

  throw new Error(
    `未配置的类别显示名称: ${category}。请确保后端已提供该类别的显示名称配置。`
  );
};

// Category tag color mapping - 严格模式，没有配置就报错
const getCategoryTagColor = (category: string, categoryData?: any): string => {
  // 如果有后端提供的类别数据，使用其中的颜色信息
  if (categoryData?.color) {
    return categoryData.color;
  }

  throw new Error(
    `未配置的类别颜色: ${category}。请确保后端已提供该类别的颜色配置。`
  );
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
      const category = preset.category;
      if (!category) {
        throw new Error("系统提示预设缺少类别信息，无法分组");
      }
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
      // 排序逻辑应该从后端配置获取，这里只提供基本的字典排序
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
              color={(() => {
                try {
                  return getCategoryTagColor(preset.category);
                } catch (error) {
                  console.warn("类别颜色配置缺失:", (error as Error).message);
                  return "default";
                }
              })()}
              icon={(() => {
                try {
                  return getCategoryIcon(preset.category);
                } catch (error) {
                  console.warn("类别图标配置缺失:", (error as Error).message);
                  return <ToolOutlined />;
                }
              })()}
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
                  {(() => {
                    try {
                      return getCategoryIcon(category);
                    } catch (error) {
                      console.warn(
                        "类别图标配置缺失:",
                        (error as Error).message
                      );
                      return <ToolOutlined />;
                    }
                  })()}
                  <Title level={5} style={{ margin: 0 }}>
                    {(() => {
                      try {
                        return getCategoryDisplayName(category);
                      } catch (error) {
                        console.warn(
                          "类别显示名称配置缺失:",
                          (error as Error).message
                        );
                        return category;
                      }
                    })()}
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

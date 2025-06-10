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
  FolderOpenOutlined,
  DeleteOutlined,
  CodeOutlined,
  SearchOutlined,
  PlayCircleOutlined,
} from "@ant-design/icons";
import {
  SystemPromptPreset,
  SystemPromptPresetList,
  ToolCategory,
} from "../../types/chat";
import { SystemPromptService } from "../../services/SystemPromptService";

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

// 类别图标映射
const getCategoryIcon = (category: string) => {
  switch (category) {
    case ToolCategory.FILE_READER:
      return <FileTextOutlined />;
    case ToolCategory.FILE_CREATOR:
      return <FolderOpenOutlined />;
    case ToolCategory.FILE_DELETER:
      return <DeleteOutlined />;
    case ToolCategory.FILE_UPDATER:
      return <CodeOutlined />;
    case ToolCategory.FILE_SEARCHER:
      return <SearchOutlined />;
    case ToolCategory.COMMAND_EXECUTOR:
      return <PlayCircleOutlined />;
    case ToolCategory.GENERAL:
    default:
      return <ToolOutlined />;
  }
};

// 类别显示名称映射
const getCategoryDisplayName = (category: string) => {
  switch (category) {
    case ToolCategory.GENERAL:
      return "通用助手";
    case ToolCategory.FILE_READER:
      return "文件读取";
    case ToolCategory.FILE_CREATOR:
      return "文件创建";
    case ToolCategory.FILE_DELETER:
      return "文件删除";
    case ToolCategory.FILE_UPDATER:
      return "文件更新";
    case ToolCategory.FILE_SEARCHER:
      return "文件搜索";
    case ToolCategory.COMMAND_EXECUTOR:
      return "命令执行";
    default:
      return category;
  }
};

// 类别标签颜色映射
const getCategoryTagColor = (category: string) => {
  switch (category) {
    case ToolCategory.GENERAL:
      return "blue";
    case ToolCategory.FILE_READER:
      return "green";
    case ToolCategory.FILE_CREATOR:
      return "orange";
    case ToolCategory.FILE_DELETER:
      return "red";
    case ToolCategory.FILE_UPDATER:
      return "purple";
    case ToolCategory.FILE_SEARCHER:
      return "cyan";
    case ToolCategory.COMMAND_EXECUTOR:
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
  title = "选择AI能力模式",
  showCancelButton = true,
}) => {
  const { token } = useToken();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const systemPromptService = useMemo(
    () => SystemPromptService.getInstance(),
    []
  );

  // 按类别分组预设
  const groupedPresets = useMemo(() => {
    const groups: Record<string, SystemPromptPreset[]> = {};

    presets.forEach((preset) => {
      const category = preset.category || ToolCategory.GENERAL;
      if (!groups[category]) {
        groups[category] = [];
      }
      groups[category].push(preset);
    });

    return groups;
  }, [presets]);

  // 获取类别列表，通用类别排在前面
  const categoryOrder = useMemo(() => {
    const categories = Object.keys(groupedPresets);
    return categories.sort((a, b) => {
      if (a === ToolCategory.GENERAL) return -1;
      if (b === ToolCategory.GENERAL) return 1;
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

  // 渲染预设项
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
              专用模式
            </Tag>
          )}
        </Space>

        {/* 能力描述 - 重点突出 */}
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
          {preset.description || "通用AI助手，支持多种对话和分析任务"}
        </Text>

        {/* 工具专用模式的功能特性说明 */}
        {preset.mode === "tool_specific" && (
          <Space
            direction="vertical"
            size="small"
            style={{ marginLeft: token.marginLG, width: "100%" }}
          >
            {preset.autoToolPrefix && (
              <Space size="small">
                <Tag color="processing">自动前缀</Tag>
                <Text code style={{ fontSize: token.fontSizeSM }}>
                  {preset.autoToolPrefix}
                </Text>
              </Space>
            )}

            {preset.allowedTools && preset.allowedTools.length > 0 && (
              <Space size="small" wrap>
                <Tag color="success">支持工具</Tag>
                <Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
                  {preset.allowedTools.slice(0, 3).join(", ")}
                  {preset.allowedTools.length > 3 && "等..."}
                </Text>
              </Space>
            )}

            {preset.restrictConversation && (
              <Space size="small">
                <Tag color="orange">专注模式</Tag>
                <Text type="warning" style={{ fontSize: token.fontSizeSM }}>
                  优化专业任务执行效率
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
          {showCancelButton && <Button onClick={handleCancel}>取消</Button>}
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
            创建新聊天
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
      {/* 帮助说明 */}
      <div style={{ marginBottom: token.marginMD }}>
        <Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
          选择适合您任务的AI能力模式。专用模式针对特定工具和任务进行了优化，提供更精确的支持。
        </Text>
      </div>

      {presets.length === 0 ? (
        <Empty
          description="暂无可用的AI能力模式"
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
                    ({groupedPresets[category].length} 个)
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

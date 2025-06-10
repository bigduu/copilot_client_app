import React, { useState, useEffect } from "react";
import {
  Modal,
  message,
  List,
  Radio,
  theme,
  Typography,
  Space,
  Tag,
  Divider,
  Alert,
  Button,
  Tooltip,
} from "antd";
import {
  InfoCircleOutlined,
  ToolOutlined,
  FileTextOutlined,
  FolderOpenOutlined,
  DeleteOutlined,
  CodeOutlined,
  SearchOutlined,
  PlayCircleOutlined,
  WarningOutlined,
} from "@ant-design/icons";
import { useChat } from "../../contexts/ChatContext";
import { ToolCategory } from "../../types/chat";
import { ToolCategoryInfo } from "../../types/toolCategory";
import { invoke } from "@tauri-apps/api/core";

const { Text } = Typography;
const { useToken } = theme;

interface SystemPromptModalProps {
  open: boolean;
  onClose: () => void;
}

// 图标组件映射
const getIconComponent = (iconName: string) => {
  switch (iconName) {
    case "FileTextOutlined":
      return <FileTextOutlined />;
    case "FolderOpenOutlined":
      return <FolderOpenOutlined />;
    case "DeleteOutlined":
      return <DeleteOutlined />;
    case "CodeOutlined":
      return <CodeOutlined />;
    case "SearchOutlined":
      return <SearchOutlined />;
    case "PlayCircleOutlined":
      return <PlayCircleOutlined />;
    case "ToolOutlined":
    default:
      return <ToolOutlined />;
  }
};

// 从类别信息获取图标，支持向后兼容
const getCategoryIcon = (category: string, categoryInfo?: ToolCategoryInfo) => {
  // 优先使用后端提供的图标数据
  if (categoryInfo?.icon) {
    return getIconComponent(categoryInfo.icon);
  }

  // 向后兼容的映射逻辑
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

// 从类别信息获取颜色，支持向后兼容
const getCategoryTagColor = (
  category: string,
  categoryInfo?: ToolCategoryInfo
) => {
  // 优先使用后端提供的颜色数据
  if (categoryInfo?.color) {
    return categoryInfo.color;
  }

  // 向后兼容的映射逻辑
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

const SystemPromptModal: React.FC<SystemPromptModalProps> = ({
  open,
  onClose,
}) => {
  const { token } = useToken();
  const {
    currentChatId,
    currentChat,
    updateCurrentChatSystemPrompt,
    systemPromptPresets,
  } = useChat();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messageApi, contextHolder] = message.useMessage();
  const [categoryInfoMap, setCategoryInfoMap] = useState<
    Map<string, ToolCategoryInfo>
  >(new Map());

  useEffect(() => {
    if (open) {
      // Pre-select the preset based on systemPromptId or systemPrompt content
      if (currentChat?.systemPromptId) {
        setSelectedId(currentChat.systemPromptId);
      } else if (currentChat?.systemPrompt) {
        const found = systemPromptPresets.find(
          (p) => p.content === currentChat.systemPrompt
        );
        setSelectedId(found ? found.id : null);
      } else {
        setSelectedId(null);
      }
    }
  }, [open, currentChat, systemPromptPresets]);

  // 获取所有工具类别的信息
  useEffect(() => {
    const fetchCategoryInfo = async () => {
      const infoMap = new Map<string, ToolCategoryInfo>();

      // 收集所有需要的类别ID
      const categoryIds = new Set<string>();
      systemPromptPresets.forEach((preset) => {
        if (preset.mode === "tool_specific" && preset.category) {
          categoryIds.add(preset.category);
        }
      });

      // 批量获取类别信息
      for (const categoryId of categoryIds) {
        try {
          const categoryInfo = await invoke<ToolCategoryInfo>(
            "get_tool_category_info",
            {
              categoryId,
            }
          );
          infoMap.set(categoryId, categoryInfo);
        } catch (error) {
          console.warn(
            `Failed to fetch category info for ${categoryId}:`,
            error
          );
        }
      }

      setCategoryInfoMap(infoMap);
    };

    if (open && systemPromptPresets.length > 0) {
      fetchCategoryInfo();
    }
  }, [open, systemPromptPresets]);

  const handleSelect = (id: string) => {
    try {
      setSelectedId(id);
      const preset = systemPromptPresets.find((p) => p.id === id);
      if (preset && currentChatId) {
        updateCurrentChatSystemPrompt(preset.content);
        messageApi.success("能力模式已应用到当前聊天");
      }
      onClose();
    } catch (error) {
      console.error("应用系统提示词失败:", error);
      messageApi.error("应用失败，请重试");
    }
  };

  const handleCancel = () => {
    setSelectedId(null);
    onClose();
  };

  const renderPresetItem = (item: any) => {
    const isSelected = selectedId === item.id;
    const isToolSpecific = item.mode === "tool_specific";

    return (
      <List.Item
        key={item.id}
        style={{
          cursor: "pointer",
          padding: token.paddingMD,
          borderRadius: token.borderRadius,
          border: isSelected
            ? `2px solid ${token.colorPrimary}`
            : `1px solid ${token.colorBorderSecondary}`,
          marginBottom: token.marginXS,
          backgroundColor: isSelected
            ? token.colorPrimaryBg
            : token.colorBgContainer,
          transition: "all 0.2s ease",
        }}
        onClick={() => setSelectedId(item.id)}
      >
        <Space direction="vertical" style={{ width: "100%" }}>
          {/* 标题和标签行 */}
          <Space
            align="center"
            style={{ width: "100%", justifyContent: "space-between" }}
          >
            <Space align="center">
              <Radio
                checked={isSelected}
                onChange={() => setSelectedId(item.id)}
              />
              <Text strong style={{ fontSize: token.fontSizeLG }}>
                {item.name}
              </Text>
              {isToolSpecific && (
                <Tag
                  color={getCategoryTagColor(
                    item.category,
                    categoryInfoMap.get(item.category)
                  )}
                  icon={getCategoryIcon(
                    item.category,
                    categoryInfoMap.get(item.category)
                  )}
                >
                  专用模式
                </Tag>
              )}
            </Space>
            <Tooltip title="查看详细信息">
              <InfoCircleOutlined style={{ color: token.colorTextTertiary }} />
            </Tooltip>
          </Space>

          {/* 能力描述 - 重点突出 */}
          <div style={{ marginLeft: token.marginLG }}>
            <Text
              style={{
                fontSize: token.fontSize,
                lineHeight: 1.5,
                color: token.colorText,
                display: "block",
                marginBottom: token.marginXS,
              }}
            >
              {item.description || "通用AI助手能力"}
            </Text>

            {/* 工具专用模式的功能特性说明 */}
            {isToolSpecific && (
              <Space direction="vertical" style={{ width: "100%" }}>
                {item.autoToolPrefix && (
                  <Space>
                    <Tag color="processing">自动前缀</Tag>
                    <Text code style={{ fontSize: token.fontSizeSM }}>
                      {item.autoToolPrefix}
                    </Text>
                  </Space>
                )}

                {item.allowedTools && item.allowedTools.length > 0 && (
                  <Space wrap>
                    <Tag color="success">支持工具</Tag>
                    <Text
                      type="secondary"
                      style={{ fontSize: token.fontSizeSM }}
                    >
                      {item.allowedTools.slice(0, 3).join(", ")}
                      {item.allowedTools.length > 3 && "等..."}
                    </Text>
                  </Space>
                )}

                {item.restrictConversation && (
                  <Space>
                    <Tag color="warning" icon={<WarningOutlined />}>
                      专注工具调用
                    </Tag>
                    <Text type="warning" style={{ fontSize: token.fontSizeSM }}>
                      优化专业任务执行效率
                    </Text>
                  </Space>
                )}
              </Space>
            )}
          </div>
        </Space>
      </List.Item>
    );
  };

  return (
    <>
      {contextHolder}
      <Modal
        title={
          <Space>
            <ToolOutlined />
            选择AI能力模式
          </Space>
        }
        open={open}
        onCancel={handleCancel}
        width={600}
        footer={
          <Space>
            <Button onClick={handleCancel}>取消</Button>
            <Button
              type="primary"
              disabled={!selectedId}
              onClick={() => selectedId && handleSelect(selectedId)}
            >
              应用选择
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
        <Alert
          message="选择适合的AI能力模式"
          description="每种模式都针对特定任务进行了优化，专用模式提供更精确的工具支持和任务聚焦。"
          type="info"
          showIcon
          style={{ marginBottom: token.marginMD }}
          closable
        />

        {systemPromptPresets.length === 0 ? (
          <div style={{ textAlign: "center", padding: token.paddingLG }}>
            <Text type="secondary">暂无可用的能力模式</Text>
          </div>
        ) : (
          <List
            dataSource={systemPromptPresets}
            renderItem={renderPresetItem}
            split={false}
          />
        )}
      </Modal>
    </>
  );
};

export default SystemPromptModal;

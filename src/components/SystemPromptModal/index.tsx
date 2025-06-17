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
  Alert,
  Button,
  Tooltip,
} from "antd";
import {
  InfoCircleOutlined,
  ToolOutlined,
  FileTextOutlined,
  PlayCircleOutlined,
  WarningOutlined,
} from "@ant-design/icons";
import { useChat } from "../../contexts/ChatContext";
import { TOOL_CATEGORIES } from "../../types/chat";

const { Text } = Typography;
const { useToken } = theme;

interface SystemPromptModalProps {
  open: boolean;
  onClose: () => void;
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
  // Remove unused categoryInfoMap state

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

  // Remove unused category information retrieval logic

  const handleSelect = (id: string) => {
    try {
      setSelectedId(id);
      const preset = systemPromptPresets.find((p) => p.id === id);
      if (preset && currentChatId) {
        updateCurrentChatSystemPrompt(preset.content);
        messageApi.success("Capability mode has been applied to current chat");
      }
      onClose();
    } catch (error) {
      console.error("Failed to apply system prompt:", error);
      messageApi.error("Application failed, please try again");
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
          {/* Title and tag row */}
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
                  color={getCategoryTagColor(item.category)}
                  icon={getCategoryIcon(item.category)}
                >
                  Specialized Mode
                </Tag>
              )}
            </Space>
            <Tooltip title="View Details">
              <InfoCircleOutlined style={{ color: token.colorTextTertiary }} />
            </Tooltip>
          </Space>

          {/* Capability description - highlighted */}
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
              {item.description || "General AI assistant capabilities"}
            </Text>

            {/* Tool-specific mode feature descriptions */}
            {isToolSpecific && (
              <Space direction="vertical" style={{ width: "100%" }}>
                {item.autoToolPrefix && (
                  <Space>
                    <Tag color="processing">Auto-prefix</Tag>
                    <Text code style={{ fontSize: token.fontSizeSM }}>
                      {item.autoToolPrefix}
                    </Text>
                  </Space>
                )}

                {item.allowedTools && item.allowedTools.length > 0 && (
                  <Space wrap>
                    <Tag color="success">Supported Tools</Tag>
                    <Text
                      type="secondary"
                      style={{ fontSize: token.fontSizeSM }}
                    >
                      {item.allowedTools.slice(0, 3).join(", ")}
                      {item.allowedTools.length > 3 && " etc..."}
                    </Text>
                  </Space>
                )}

                {item.restrictConversation && (
                  <Space>
                    <Tag color="warning" icon={<WarningOutlined />}>
                      Focus on Tool Calls
                    </Tag>
                    <Text type="warning" style={{ fontSize: token.fontSizeSM }}>
                      Optimized for professional task execution efficiency
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
            Select AI Capability Mode
          </Space>
        }
        open={open}
        onCancel={handleCancel}
        width={600}
        footer={
          <Space>
            <Button onClick={handleCancel}>Cancel</Button>
            <Button
              type="primary"
              disabled={!selectedId}
              onClick={() => selectedId && handleSelect(selectedId)}
            >
              Apply Selection
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
        <Alert
          message="Select the appropriate AI capability mode"
          description="Each mode is optimized for specific tasks. Specialized modes provide more precise tool support and task focus."
          type="info"
          showIcon
          style={{ marginBottom: token.marginMD }}
          closable
        />

        {systemPromptPresets.length === 0 ? (
          <div style={{ textAlign: "center", padding: token.paddingLG }}>
            <Text type="secondary">No available capability modes</Text>
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

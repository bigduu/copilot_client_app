import React, { useState, useEffect } from "react";
import { Modal, List, Radio, theme, Typography, Space, Empty, Tag } from "antd";
import {
  ModalFooter,
  createCancelButton,
  createOkButton,
} from "../ModalFooter";
import { ToolOutlined } from "@ant-design/icons";
import { UserSystemPrompt } from "../../types/chat";
import { useAppStore } from "../../store";

const { Text } = Typography;
const { useToken } = theme;

interface SystemPromptSelectorProps {
  open: boolean;
  onClose: () => void;
  onSelect: (prompt: UserSystemPrompt) => void;
  prompts: UserSystemPrompt[];
  title?: string;
  showCancelButton?: boolean;
}

const SystemPromptSelector: React.FC<SystemPromptSelectorProps> = ({
  open,
  onClose,
  onSelect,
  prompts,
  title = "Select System Prompt",
  showCancelButton = true,
}) => {
  const { token } = useToken();
  const lastSelectedPromptId = useAppStore(
    (state) => state.lastSelectedPromptId
  );
  const setLastSelectedPromptId = useAppStore(
    (state) => state.setLastSelectedPromptId
  );

  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      // When the modal opens, initialize the selection with the last used prompt ID
      // or the first default prompt if none was selected.
      const defaultPrompt = prompts.find((p) => p.isDefault);
      setSelectedId(lastSelectedPromptId || defaultPrompt?.id || null);
    }
  }, [open, lastSelectedPromptId, prompts]);

  const handleSelect = (prompt: UserSystemPrompt) => {
    setSelectedId(prompt.id);
    setLastSelectedPromptId(prompt.id);
    onSelect(prompt);
    onClose();
  };

  const handleCancel = () => {
    onClose();
  };

  const renderPromptItem = (prompt: UserSystemPrompt) => (
    <List.Item
      key={prompt.id}
      style={{
        cursor: "pointer",
        padding: token.paddingMD,
        borderRadius: token.borderRadius,
        border:
          selectedId === prompt.id
            ? `2px solid ${token.colorPrimary}`
            : `1px solid ${token.colorBorderSecondary}`,
        marginBottom: token.marginXS,
        backgroundColor:
          selectedId === prompt.id
            ? token.colorPrimaryBg
            : token.colorBgContainer,
        transition: "all 0.2s ease",
      }}
      onClick={() => setSelectedId(prompt.id)}
    >
      <Space direction="vertical" style={{ width: "100%" }}>
        <Space>
          <Radio
            checked={selectedId === prompt.id}
            onChange={() => setSelectedId(prompt.id)}
          />
          <Text strong>{prompt.name}</Text>
          {prompt.isDefault && <Tag>Default</Tag>}
        </Space>
        <Text
          style={{
            fontSize: token.fontSize,
            marginLeft: token.marginLG,
            lineHeight: 1.5,
            color: token.colorTextSecondary,
            display: "block",
          }}
        >
          {prompt.content.substring(0, 150) +
            (prompt.content.length > 150 ? "..." : "")}
        </Text>
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
        <ModalFooter
          buttons={[
            ...(showCancelButton ? [createCancelButton(handleCancel)] : []),
            createOkButton(
              () => {
                const prompt = prompts.find((p) => p.id === selectedId);
                if (prompt) {
                  handleSelect(prompt);
                }
              },
              {
                text: "Create New Chat",
                disabled: !selectedId,
              }
            ),
          ]}
        />
      }
      styles={{
        body: {
          maxHeight: "70vh",
          overflowY: "auto",
          padding: token.paddingMD,
        },
      }}
    >
      <div style={{ marginBottom: token.marginMD }}>
        <Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
          Select a base system prompt for the AI. You can add or edit prompts in
          the System Settings.
        </Text>
      </div>

      {prompts.length === 0 ? (
        <Empty
          description="No system prompts found. Add one in System Settings."
          style={{ margin: token.marginLG }}
        />
      ) : (
        <List
          dataSource={prompts}
          renderItem={renderPromptItem}
          split={false}
        />
      )}
    </Modal>
  );
};

export default SystemPromptSelector;

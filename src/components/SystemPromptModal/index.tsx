import React, { useState, useEffect } from "react";
import { Modal, message, List, Radio, theme, Typography, Space } from "antd";
import { useChat } from "../../contexts/ChatContext";

const { Text } = Typography;
const { useToken } = theme;

interface SystemPromptModalProps {
  open: boolean;
  onClose: () => void;
}

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

  useEffect(() => {
    if (open) {
      // Pre-select the preset id corresponding to current chat's systemPrompt (if any)
      if (currentChat?.systemPrompt) {
        const found = systemPromptPresets.find(
          (p) => p.content === currentChat.systemPrompt
        );
        setSelectedId(found ? found.id : null);
      } else {
        setSelectedId(null);
      }
    }
  }, [open, currentChat, systemPromptPresets]);

  const handleSelect = (id: string) => {
    setSelectedId(id);
    const preset = systemPromptPresets.find((p) => p.id === id);
    if (preset && currentChatId) {
      updateCurrentChatSystemPrompt(preset.content);
      messageApi.success("System prompt applied to current chat");
    }
    onClose();
  };

  return (
    <>
      {contextHolder}
      <Modal
        title="Select System Prompt"
        open={open}
        onCancel={onClose}
        footer={null}
        width={480}
      >
        <Radio.Group
          value={selectedId}
          onChange={(e) => handleSelect(e.target.value)}
          style={{ width: "100%" }}
        >
          <List
            bordered
            dataSource={systemPromptPresets}
            renderItem={(item) => (
              <List.Item>
                <Space
                  direction="vertical"
                  size={token.marginXS}
                  style={{ width: "100%" }}
                >
                  <Radio value={item.id}>{item.name}</Radio>
                  <Text
                    type="secondary"
                    style={{
                      fontSize: token.fontSizeSM,
                      marginLeft: token.marginLG,
                    }}
                  >
                    {item.content.slice(0, 40)}...
                  </Text>
                </Space>
              </List.Item>
            )}
          />
        </Radio.Group>
      </Modal>
    </>
  );
};

export default SystemPromptModal;

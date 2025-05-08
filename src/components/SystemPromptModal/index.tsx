import React, { useState, useEffect } from "react";
import {
  Modal,
  Input,
  Button,
  Typography,
  Tabs,
  Space,
  message,
  List,
  Radio,
} from "antd";
import { useChat } from "../../contexts/ChatContext";

const { TextArea } = Input;
const { Text } = Typography;

// Default system prompt as fallback
const DEFAULT_PROMPT = `# Hello! I'm your AI Assistant 👋

I'm here to help you with:

* Writing and reviewing code
* Answering questions
* Solving problems
* Explaining concepts
* And much more!

I'll respond using markdown formatting to make information clear and well-structured. Feel free to ask me anything!

---
Let's get started - what can I help you with today?`;

interface SystemPromptModalProps {
  open: boolean;
  onClose: () => void;
}

const SystemPromptModal: React.FC<SystemPromptModalProps> = ({
  open,
  onClose,
}) => {
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
      // 预选当前chat的systemPrompt对应的preset id（如有）
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
        title="选择系统Prompt"
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
                <Radio value={item.id} style={{ marginRight: 8 }}>
                  {item.name}
                </Radio>
                <div style={{ color: "#888", fontSize: 12, marginTop: 4 }}>
                  {item.content.slice(0, 40)}...
                </div>
              </List.Item>
            )}
          />
        </Radio.Group>
      </Modal>
    </>
  );
};

export default SystemPromptModal;

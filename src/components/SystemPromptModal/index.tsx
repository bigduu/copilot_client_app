import React, { useState, useEffect } from "react";
import { Modal, Input, Button, Typography, Tabs, Space, message } from "antd";
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
  console.log("SystemPromptModal rendering, open:", open);

  const {
    systemPrompt: globalSystemPrompt,
    updateSystemPrompt,
    currentChatId,
    currentChat,
    updateCurrentChatSystemPrompt,
  } = useChat();

  // Get the current chat system prompt if available, otherwise use the global one
  const currentChatSystemPrompt =
    currentChat?.systemPrompt || globalSystemPrompt;

  // Initialize local state with global and current chat prompts
  const [globalPrompt, setGlobalPrompt] = useState<string>(globalSystemPrompt);
  const [chatPrompt, setChatPrompt] = useState<string>(currentChatSystemPrompt);
  const [activeTab, setActiveTab] = useState<string>("current");
  const [messageApi, contextHolder] = message.useMessage();

  // Update local state when modal becomes visible
  useEffect(() => {
    if (open) {
      setGlobalPrompt(globalSystemPrompt);
      setChatPrompt(currentChatSystemPrompt);
      // Set active tab to current chat if one is selected, otherwise to global
      setActiveTab(currentChatId ? "current" : "global");
    }
  }, [open, globalSystemPrompt, currentChatSystemPrompt, currentChatId]);

  const handleSave = () => {
    console.log("Save button clicked for tab:", activeTab);

    if (activeTab === "global") {
      updateSystemPrompt(globalPrompt);
      messageApi.success("Global system prompt updated successfully");
    } else if (currentChatId) {
      updateCurrentChatSystemPrompt(chatPrompt);
      messageApi.success("Current chat system prompt updated successfully");
    } else {
      messageApi.error("No chat selected to update system prompt");
    }

    onClose();
  };

  const handleCancel = () => {
    console.log("Cancelling prompt edit");
    onClose();
  };

  const handleResetGlobal = () => {
    console.log("Resetting to default global system prompt");
    setGlobalPrompt(DEFAULT_PROMPT);
  };

  const handleResetCurrent = () => {
    console.log("Resetting current chat system prompt to global");
    setChatPrompt(globalSystemPrompt);
  };

  return (
    <>
      {contextHolder}
      <Modal
        title="Customize System Prompt"
        open={open}
        onCancel={handleCancel}
        footer={[
          <Button key="cancel" onClick={handleCancel}>
            Cancel
          </Button>,
          <Button key="submit" type="primary" onClick={handleSave}>
            Save
          </Button>,
        ]}
        width={700}
      >
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          items={[
            {
              key: "current",
              label: "Current Chat",
              disabled: !currentChatId,
              children: (
                <div className="system-prompt-tab-content">
                  <Space direction="vertical" style={{ width: "100%" }}>
                    <Text>
                      Customize the system prompt for the current chat only.
                      This won't affect other chats.
                    </Text>
                    <TextArea
                      value={chatPrompt}
                      onChange={(e) => setChatPrompt(e.target.value)}
                      autoSize={{ minRows: 12, maxRows: 20 }}
                      placeholder="Enter your custom system prompt..."
                    />
                    <Button onClick={handleResetCurrent}>
                      Reset to Global Prompt
                    </Button>
                  </Space>
                </div>
              ),
            },
            {
              key: "global",
              label: "Global Default",
              children: (
                <div className="system-prompt-tab-content">
                  <Space direction="vertical" style={{ width: "100%" }}>
                    <Text>
                      Customize the default system prompt for all new chats.
                      This won't affect existing chats.
                    </Text>
                    <TextArea
                      value={globalPrompt}
                      onChange={(e) => setGlobalPrompt(e.target.value)}
                      autoSize={{ minRows: 12, maxRows: 20 }}
                      placeholder="Enter your custom system prompt..."
                    />
                    <Button onClick={handleResetGlobal}>
                      Reset to Default
                    </Button>
                  </Space>
                </div>
              ),
            },
          ]}
        />
      </Modal>
    </>
  );
};

export default SystemPromptModal;

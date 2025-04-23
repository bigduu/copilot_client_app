import React, { useState, useEffect } from "react";
import { Modal, Input, Button, Typography } from "antd";

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
  visible: boolean;
  onClose: () => void;
}

// Function to directly save the system prompt to localStorage
function saveSystemPromptToStorage(prompt: string): void {
  try {
    const promptToSave = prompt && prompt.trim() ? prompt : DEFAULT_PROMPT;
    console.log(
      "Directly saving prompt to localStorage, length:",
      promptToSave.length
    );
    localStorage.setItem("system_prompt", promptToSave);
    console.log("Successfully saved prompt to localStorage");

    // Force a page reload to ensure the new prompt is used
    window.location.reload();
  } catch (error) {
    console.error("Error saving prompt to localStorage:", error);
  }
}

const SystemPromptModal: React.FC<SystemPromptModalProps> = ({
  visible,
  onClose,
}) => {
  console.log("SystemPromptModal rendering, visible:", visible);

  // Get the current system prompt from localStorage directly
  const systemPrompt = (() => {
    try {
      const saved = localStorage.getItem("system_prompt");
      return saved && saved.trim() ? saved : DEFAULT_PROMPT;
    } catch (e) {
      console.error("Error reading from localStorage:", e);
      return DEFAULT_PROMPT;
    }
  })();

  // Initialize local state with current prompt
  const [prompt, setPrompt] = useState<string>(systemPrompt);

  // Update local state when modal becomes visible
  useEffect(() => {
    if (visible) {
      try {
        const currentPrompt = localStorage.getItem("system_prompt");
        console.log("Modal opened, getting prompt from localStorage");
        setPrompt(
          currentPrompt && currentPrompt.trim() ? currentPrompt : DEFAULT_PROMPT
        );
      } catch (e) {
        console.error("Error reading from localStorage:", e);
        setPrompt(DEFAULT_PROMPT);
      }
    }
  }, [visible]);

  const handleSave = () => {
    console.log("Save button clicked");
    // Use the direct save function instead of context
    saveSystemPromptToStorage(prompt);
    onClose();
  };

  const handleCancel = () => {
    console.log("Cancelling prompt edit");
    onClose();
  };

  const handleReset = () => {
    console.log("Resetting to current system prompt");
    setPrompt(systemPrompt);
  };

  console.log("Modal rendering with prompt length:", prompt?.length || 0);

  return (
    <Modal
      title="Customize System Prompt"
      open={visible}
      onCancel={handleCancel}
      footer={[
        <Button key="reset" onClick={handleReset}>
          Reset
        </Button>,
        <Button key="cancel" onClick={handleCancel}>
          Cancel
        </Button>,
        <Button key="submit" type="primary" onClick={handleSave}>
          Save
        </Button>,
      ]}
      width={600}
    >
      <div className="system-prompt-modal-content">
        <Text>
          Customize how the AI assistant introduces itself and describes its
          capabilities. Use markdown formatting for better presentation.
        </Text>
        <TextArea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          autoSize={{ minRows: 10, maxRows: 20 }}
          placeholder="Enter your custom system prompt..."
          className="system-prompt-textarea"
        />
      </div>
    </Modal>
  );
};

export default SystemPromptModal;

import React, { useEffect, useState } from "react";
import { Button, Space, Tooltip, Spin, theme } from "antd";
import { SettingOutlined } from "@ant-design/icons";
import { MessageInput } from "../MessageInput";
import SystemPromptModal from "../SystemPromptModal";
import InputPreview from "./InputPreview";

const { useToken } = theme;

interface InputContainerProps {
  isStreaming: boolean;
  isCenteredLayout?: boolean;
}

export const InputContainer: React.FC<InputContainerProps> = ({
  isStreaming,
  isCenteredLayout = false,
}) => {
  const [isPromptModalOpen, setPromptModalOpen] = React.useState(false);
  const [referenceText, setReferenceText] = useState<string | null>(null);
  const { token } = useToken();

  // Listen for reference-text events from MessageCard
  useEffect(() => {
    const handleReferenceText = (e: Event) => {
      const customEvent = e as CustomEvent<{ text: string }>;
      setReferenceText(customEvent.detail.text);
    };

    window.addEventListener("reference-text", handleReferenceText);

    return () => {
      window.removeEventListener("reference-text", handleReferenceText);
    };
  }, []);

  const handleInputSubmit = (content: string) => {
    // Clear reference after submitting
    setReferenceText(null);
  };

  return (
    <div
      style={{
        padding: token.paddingMD,
        background: token.colorBgContainer,
        borderTop: isCenteredLayout
          ? "none"
          : `1px solid ${token.colorBorderSecondary}`,
        boxShadow: isCenteredLayout ? "none" : "0 -2px 8px rgba(0,0,0,0.06)",
        width: "100%",
      }}
    >
      {referenceText && (
        <InputPreview
          text={referenceText}
          onClose={() => setReferenceText(null)}
        />
      )}

      <Space.Compact block>
        <Tooltip title="Customize System Prompt">
          <Button
            icon={<SettingOutlined />}
            onClick={() => setPromptModalOpen(true)}
            aria-label="Customize System Prompt"
            size={isCenteredLayout ? "large" : "middle"}
            style={
              isCenteredLayout
                ? {
                    height: "auto",
                    padding: `${token.paddingSM}px ${token.paddingContentHorizontal}px`,
                  }
                : {}
            }
          />
        </Tooltip>
        <MessageInput
          isStreamingInProgress={isStreaming}
          isCenteredLayout={isCenteredLayout}
          referenceText={referenceText}
          onSubmit={handleInputSubmit}
        />
      </Space.Compact>

      {isStreaming && (
        <Space
          style={{
            marginTop: token.marginSM,
            fontSize: token.fontSizeSM,
            color: token.colorTextSecondary,
          }}
          size={token.marginXS}
        >
          <Spin size="small" />
          <span>AI is thinking...</span>
        </Space>
      )}

      <SystemPromptModal
        open={isPromptModalOpen}
        onClose={() => setPromptModalOpen(false)}
      />
    </div>
  );
};

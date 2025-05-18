import React, { useEffect, useState, useRef } from "react";
import { Button, Space, Tooltip, Spin, theme } from "antd";
import { SettingOutlined } from "@ant-design/icons";
import { MessageInput } from "../MessageInput";
import SystemPromptModal from "../SystemPromptModal";
import InputPreview from "./InputPreview";
import { useChat } from "../../contexts/ChatContext";

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
  // Store reference text per chatId
  const [referenceMap, setReferenceMap] = useState<{
    [chatId: string]: string | null;
  }>({});
  const { token } = useToken();
  const { currentChatId } = useChat();
  const prevChatIdRef = useRef<string | null>(null);

  // Listen for reference-text events from MessageCard/FavoritesPanel
  useEffect(() => {
    const handleReferenceText = (e: Event) => {
      const customEvent = e as CustomEvent<{ text: string; chatId?: string }>;
      const chatId = customEvent.detail.chatId || currentChatId;
      if (chatId) {
        setReferenceMap((prev) => ({
          ...prev,
          [chatId]: customEvent.detail.text,
        }));
      }
    };

    window.addEventListener("reference-text", handleReferenceText);

    return () => {
      window.removeEventListener("reference-text", handleReferenceText);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentChatId]);

  // Clear reference when chat switches
  useEffect(() => {
    if (prevChatIdRef.current && prevChatIdRef.current !== currentChatId) {
      setReferenceMap((prev) => ({
        ...prev,
        [prevChatIdRef.current as string]: null,
      }));
    }
    prevChatIdRef.current = currentChatId;
  }, [currentChatId]);

  const handleInputSubmit = (content: string) => {
    // Clear reference after submitting for current chat
    if (currentChatId) {
      setReferenceMap((prev) => ({ ...prev, [currentChatId]: null }));
    }
  };

  const referenceText = currentChatId ? referenceMap[currentChatId] : null;

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
          onClose={() => {
            if (currentChatId) {
              setReferenceMap((prev) => ({ ...prev, [currentChatId]: null }));
            }
          }}
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

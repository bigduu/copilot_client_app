import React from "react";
import { Button, Space, Tooltip, Spin, theme } from "antd";
import { SettingOutlined } from "@ant-design/icons";
import { MessageInput } from "../MessageInput";
import SystemPromptModal from "../SystemPromptModal";

const { useToken } = theme;

interface InputContainerProps {
  isStreaming: boolean;
}

export const InputContainer: React.FC<InputContainerProps> = ({
  isStreaming,
}) => {
  const [isPromptModalOpen, setPromptModalOpen] = React.useState(false);
  const { token } = useToken();

  return (
    <div
      style={{
        padding: token.paddingMD,
        background: token.colorBgContainer,
        borderTop: `1px solid ${token.colorBorderSecondary}`,
        boxShadow: "0 -2px 8px rgba(0,0,0,0.06)",
      }}
    >
      <Space.Compact block>
        <Tooltip title="Customize System Prompt">
          <Button
            icon={<SettingOutlined />}
            onClick={() => setPromptModalOpen(true)}
            aria-label="Customize System Prompt"
          />
        </Tooltip>
        <MessageInput isStreamingInProgress={isStreaming} />
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

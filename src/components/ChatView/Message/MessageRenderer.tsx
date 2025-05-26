import React from "react";
import { Message, ToolApprovalMessages } from "../../../types/chat";
import UnifiedMessageCard from "./UnifiedMessageCard";
import SystemMessage from "../SystemMessage";
import { Channel } from "@tauri-apps/api/core";

interface MessageRendererProps {
  message: Message;
  isStreaming?: boolean;
  channel?: Channel<string>;
  onComplete?: (
    finalMessage: Message,
    toolExecutionResults?: any[],
    approvalMessages?: ToolApprovalMessages[]
  ) => void;
  onToolExecuted?: (approvalMessages: ToolApprovalMessages[]) => void;
  onMessageUpdate?: (messageId: string, updates: Partial<Message>) => void;
  messageIndex?: number;
  children?: React.ReactNode;
}

/**
 * 统一的消息渲染组件
 * 使用 UnifiedMessageCard 处理所有消息类型
 */
const MessageRenderer: React.FC<MessageRendererProps> = ({
  message,
  isStreaming = false,
  channel,
  onComplete,
  onToolExecuted,
  onMessageUpdate,
  messageIndex,
  children,
}) => {
  // 1. 系统消息仍使用独立组件
  if (message.role === "system") {
    return <SystemMessage />;
  }

  // 2. 所有其他消息类型都使用 UnifiedMessageCard
  // 它会根据 isStreaming 和其他属性自动选择合适的渲染方式
  return (
    <UnifiedMessageCard
      message={message}
      messageIndex={messageIndex}
      isStreaming={isStreaming}
      channel={channel}
      onComplete={onComplete}
      onToolExecuted={onToolExecuted}
      onMessageUpdate={onMessageUpdate}
    >
      {children}
    </UnifiedMessageCard>
  );
};

export default MessageRenderer;

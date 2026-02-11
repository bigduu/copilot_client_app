import React from "react";
import { Space, Typography } from "antd";
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import type { PluggableList } from "unified";
import {
  isAssistantToolCallMessage,
  isAssistantToolResultMessage,
  isWorkflowResultMessage,
  type Message,
} from "../../types/chat";
import ToolResultCard from "../ToolResultCard";
import ToolCallCard from "../ToolCallCard";
import WorkflowResultCard from "../WorkflowResultCard";

const { Text } = Typography;

interface MessageCardContentProps {
  message: Message;
  messageText: string;
  isUserToolCall: boolean;
  formatUserToolCall: (toolCall: string) => string;
  markdownComponents: Components;
  markdownPlugins: PluggableList;
  rehypePlugins: PluggableList;
}

const MessageCardContent: React.FC<MessageCardContentProps> = ({
  message,
  messageText,
  isUserToolCall,
  formatUserToolCall,
  markdownComponents,
  markdownPlugins,
  rehypePlugins,
}) => {
  if (isAssistantToolResultMessage(message)) {
    const toolResultContent = message.result.result ?? "";
    const toolResultErrorMessage = message.isError
      ? toolResultContent || "Tool execution failed."
      : undefined;
    const toolResultIsLoading =
      !toolResultErrorMessage && toolResultContent.trim().length === 0;

    if (message.result.display_preference === "Hidden") {
      return null;
    }

    return (
      <ToolResultCard
        content={toolResultContent}
        toolName={message.toolName}
        status={
          message.isError
            ? "error"
            : toolResultIsLoading
              ? "warning"
              : "success"
        }
        timestamp={message.createdAt}
        defaultCollapsed={true}
        isLoading={toolResultIsLoading}
        errorMessage={toolResultErrorMessage}
      />
    );
  }

  if (isWorkflowResultMessage(message)) {
    const workflowContent = message.content ?? "";
    const workflowErrorMessage =
      message.status === "error"
        ? workflowContent || "Workflow execution failed."
        : undefined;
    const workflowIsLoading =
      !workflowErrorMessage && workflowContent.trim().length === 0;

    return (
      <WorkflowResultCard
        content={workflowContent}
        workflowName={message.workflowName}
        parameters={message.parameters}
        status={workflowIsLoading ? "warning" : (message.status ?? "success")}
        timestamp={message.createdAt}
        isLoading={workflowIsLoading}
        errorMessage={workflowErrorMessage}
      />
    );
  }

  if (isAssistantToolCallMessage(message)) {
    return (
      <Space direction="vertical" style={{ width: "100%" }}>
        {message.toolCalls.map((call) => (
          <ToolCallCard
            key={call.toolCallId}
            toolName={call.toolName}
            parameters={call.parameters}
            toolCallId={call.toolCallId}
            defaultExpanded={false}
          />
        ))}
      </Space>
    );
  }

  if (message.role === "assistant" && !messageText) {
    return <Text italic>Assistant is thinking...</Text>;
  }

  return (
    <ReactMarkdown
      remarkPlugins={markdownPlugins}
      rehypePlugins={rehypePlugins}
      components={markdownComponents}
    >
      {isUserToolCall ? formatUserToolCall(messageText) : messageText}
    </ReactMarkdown>
  );
};

export default MessageCardContent;

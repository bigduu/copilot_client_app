import React from "react";
import { Card, Flex, Space, Typography } from "antd";
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import type { PluggableList } from "react-markdown/lib/react-markdown";
import {
  isAssistantToolCallMessage,
  isAssistantToolResultMessage,
  isWorkflowResultMessage,
  type Message,
} from "../../types/chat";
import ToolResultCard from "../ToolResultCard";
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
  token: any;
}

const MessageCardContent: React.FC<MessageCardContentProps> = ({
  message,
  messageText,
  isUserToolCall,
  formatUserToolCall,
  markdownComponents,
  markdownPlugins,
  rehypePlugins,
  token,
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
        defaultCollapsed={message.result.display_preference === "Collapsible"}
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
          <Card
            key={call.toolCallId}
            size="small"
            title={
              <Space>
                <Text>🔧 Requesting Tool: {call.toolName}</Text>
              </Space>
            }
            style={{
              backgroundColor: token.colorInfoBg,
              borderColor: token.colorInfoBorder,
            }}
          >
            <Space direction="vertical" style={{ width: "100%" }} size="middle">
              <Flex vertical>
                <Text strong style={{ marginBottom: token.marginXS }}>
                  Parameters:
                </Text>
                <pre
                  style={{
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-all",
                    backgroundColor: token.colorBgContainer,
                    padding: token.paddingSM,
                    borderRadius: token.borderRadius,
                    margin: 0,
                  }}
                >
                  {JSON.stringify(call.parameters, null, 2)}
                </pre>
              </Flex>
            </Space>
          </Card>
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

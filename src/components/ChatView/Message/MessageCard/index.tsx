import React, { useRef, useState } from "react";
import {
  Card,
  Space,
  Typography,
  theme,
  Button,
  Dropdown,
  Tooltip,
  notification,
} from "antd";
import { CopyOutlined, BookOutlined, StarOutlined } from "@ant-design/icons";
import MarkdownRenderer from "../shared/MarkdownRenderer";
import ToolCallsSection from "../shared/ToolCallsSection";
import ProcessorUpdatesSection from "../shared/ProcessorUpdatesSection";
import { Message, ToolApprovalMessages } from "../../../../types/chat";
import { useChat } from "../../../../contexts/ChatView";
import { ToolCall, toolParser } from "../../../../utils/toolParser";
import { messageProcessor } from "../../../../services";

const { Text } = Typography;
const { useToken } = theme;

interface MessageCardProps {
  role: string;
  content: string;
  processorUpdates?: string[];
  messageIndex?: number;
  children?: React.ReactNode;
  messageId?: string;
  isToolResult?: boolean;
  onToolExecuted?: (approvalMessages: ToolApprovalMessages[]) => void;
}

const MessageCard: React.FC<MessageCardProps> = ({
  role,
  content,
  processorUpdates,
  children,
  messageId,
  isToolResult = false,
  onToolExecuted,
}) => {
  const { token } = useToken();
  const { currentChatId, addFavorite } = useChat();
  const cardRef = useRef<HTMLDivElement>(null);
  const [selectedText, setSelectedText] = useState<string>("");
  const [isHovering, setIsHovering] = useState<boolean>(false);

  // Extract tool calls from content if present
  const toolCalls = toolParser.parseToolCallsFromContent(content);

  // Add handlers for tool approval and rejection
  const handleToolApprove = async (toolCall: ToolCall) => {
    console.log("[MessageCard] Tool approved:", toolCall);

    try {
      // 1. Create user approval message
      const userApprovalMessage: Message = {
        role: "user",
        content: `Approved tool execution: ${toolCall.tool_name}`,
        id: crypto.randomUUID(),
        isToolResult: false,
      };

      // 2. Execute tool using MessageProcessor
      const results = await messageProcessor.executeApprovedTools([toolCall]);
      const toolResult = results[0] || {
        success: false,
        error: "Tool execution failed",
        toolName: toolCall.tool_name,
      };

      // 3. Create tool result message
      const toolResultMessage: Message = {
        role: "assistant",
        content: toolResult.success
          ? `✅ Tool executed successfully: ${toolCall.tool_name}\n\n${toolResult.result}`
          : `❌ Tool execution failed: ${toolCall.tool_name}\n\nError: ${toolResult.error}`,
        id: crypto.randomUUID(),
        isToolResult: true,
      };

      // 4. Show success notification
      notification.success({
        message: "Tool approved and executed",
        description: `${toolCall.tool_name} executed ${
          toolResult.success ? "successfully" : "with failure"
        }`,
        placement: "bottomRight",
        duration: 3,
      });

      // 5. Call onToolExecuted if provided
      if (onToolExecuted) {
        const approvalMessages: ToolApprovalMessages[] = [
          {
            userApproval: userApprovalMessage,
            toolResult: toolResultMessage,
          },
        ];
        onToolExecuted(approvalMessages);
      }
    } catch (error) {
      console.error("[MessageCard] Error executing approved tool:", error);

      // Create error messages
      const userApprovalMessage: Message = {
        role: "user",
        content: `Approved tool execution: ${toolCall.tool_name}`,
        id: crypto.randomUUID(),
        isToolResult: false,
      };

      const errorMessage: Message = {
        role: "assistant",
        content: `❌ Tool execution failed: ${toolCall.tool_name}\n\nError: ${
          error instanceof Error ? error.message : String(error)
        }`,
        id: crypto.randomUUID(),
        isToolResult: true,
      };

      notification.error({
        message: "Tool execution failed",
        description: `${toolCall.tool_name} encountered an error during execution`,
        placement: "bottomRight",
        duration: 5,
      });

      // Pass error message pair if callback is provided
      if (onToolExecuted) {
        const approvalMessages: ToolApprovalMessages[] = [
          {
            userApproval: userApprovalMessage,
            toolResult: errorMessage,
          },
        ];
        onToolExecuted(approvalMessages);
      }
    }
  };

  const handleToolReject = (toolCall: ToolCall) => {
    console.log("[MessageCard] Tool rejected:", toolCall);
    notification.info({
      message: "Tool rejected",
      description: `Rejected execution of: ${toolCall.tool_name}`,
      placement: "bottomRight",
      duration: 3,
    });
  };

  // Add entire message to favorites
  const addMessageToFavorites = () => {
    if (currentChatId) {
      if (selectedText) {
        addSelectedToFavorites();
      } else {
        addFavorite({
          chatId: currentChatId,
          content: content,
          role: role as "user" | "assistant",
          messageId,
        });
      }
    }
  };

  // Add selected content to favorites
  const addSelectedToFavorites = () => {
    if (currentChatId && selectedText) {
      addFavorite({
        chatId: currentChatId,
        content: selectedText,
        role: role as "user" | "assistant",
        messageId,
      });
      setSelectedText("");
    }
  };

  // Listen for selected content
  const handleMouseUp = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const selection = window.getSelection();
    const text = selection ? selection.toString() : "";
    if (
      text &&
      cardRef.current &&
      selection &&
      cardRef.current.contains(selection.anchorNode)
    ) {
      setSelectedText(text);
    } else {
      setSelectedText("");
    }
  };

  // Copy text to clipboard
  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch (e) {
      console.error("Failed to copy text:", e);
    }
  };

  // Create reference format
  const createReference = (text: string) => {
    return `> ${text.replace(/\n/g, "\n> ")}`;
  };

  // Reference message
  const referenceMessage = () => {
    if (selectedText) {
      const referenceText = createReference(selectedText);
      const event = new CustomEvent("reference-text", {
        detail: { text: referenceText, chatId: currentChatId },
      });
      window.dispatchEvent(event);
    } else {
      const referenceText = createReference(content);
      const event = new CustomEvent("reference-text", {
        detail: { text: referenceText, chatId: currentChatId },
      });
      window.dispatchEvent(event);
    }
  };

  // Context menu items
  const contextMenuItems = [
    {
      key: "copy",
      label: "Copy",
      icon: <CopyOutlined />,
      onClick: () => {
        if (selectedText) {
          copyToClipboard(selectedText);
        } else {
          copyToClipboard(content);
        }
      },
    },
    {
      key: "favorite",
      label: "Add to favorites",
      icon: <StarOutlined />,
      onClick: addMessageToFavorites,
    },
    {
      key: "reference",
      label: "Reference message",
      icon: <BookOutlined />,
      onClick: referenceMessage,
    },
  ];

  return (
    <div onContextMenu={(e) => handleMouseUp(e)} style={{ width: "100%" }}>
      <Dropdown menu={{ items: contextMenuItems }} trigger={["contextMenu"]}>
        <Card
          id={messageId ? `message-${messageId}` : undefined}
          ref={cardRef}
          style={{
            width: "100%",
            minWidth: "100%",
            maxWidth: "800px",
            margin: "0 auto",
            background: isToolResult
              ? content.includes("✅")
                ? token.colorSuccessBg
                : token.colorErrorBg
              : role === "user"
              ? token.colorPrimaryBg
              : role === "assistant"
              ? token.colorBgLayout
              : token.colorBgContainer,
            border: isToolResult
              ? `1px solid ${
                  content.includes("✅")
                    ? token.colorSuccessBorder
                    : token.colorErrorBorder
                }`
              : undefined,
            borderRadius: token.borderRadiusLG,
            boxShadow: token.boxShadow,
            position: "relative",
            wordWrap: "break-word",
            overflowWrap: "break-word",
          }}
          onMouseEnter={() => setIsHovering(true)}
          onMouseLeave={() => setIsHovering(false)}
        >
          <Space
            direction="vertical"
            size={token.marginXS}
            style={{ width: "100%", maxWidth: "100%" }}
          >
            <Text
              type="secondary"
              strong
              style={{ fontSize: token.fontSizeSM }}
            >
              {role === "user"
                ? "You"
                : role === "assistant"
                ? "Assistant"
                : role}
            </Text>

            {/* Tool calls display (only for assistant messages) */}
            {role === "assistant" && (
              <ToolCallsSection
                toolCalls={toolCalls}
                onApprove={handleToolApprove}
                onReject={handleToolReject}
              />
            )}

            {/* Normal content, hidden if tool calls are present for assistant */}
            {!(role === "assistant" && toolCalls.length > 0) && (
              <MarkdownRenderer
                content={content}
                role={role}
                enableBreaks={role === "user"}
              />
            )}

            {/* Processor updates display */}
            {role === "assistant" && (
              <ProcessorUpdatesSection
                processorUpdates={processorUpdates || []}
              />
            )}

            {children}

            {/* Action buttons - shown for both user and assistant messages when hovering */}
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: token.marginXS,
                marginTop: token.marginXS,
                position: "absolute",
                bottom: token.paddingXS,
                right: token.paddingXS,
                background: "transparent",
                zIndex: 1,
                opacity: isHovering ? 1 : 0,
                transition: "opacity 0.2s ease",
                pointerEvents: isHovering ? "auto" : "none",
              }}
            >
              <Tooltip title="Copy message">
                <Button
                  icon={<CopyOutlined />}
                  size="small"
                  type="text"
                  onClick={() => copyToClipboard(content)}
                  style={{
                    background: token.colorBgElevated,
                    borderRadius: token.borderRadiusSM,
                  }}
                />
              </Tooltip>
              <Tooltip title="Add to favorites">
                <Button
                  icon={<StarOutlined />}
                  size="small"
                  type="text"
                  onClick={addMessageToFavorites}
                  style={{
                    background: token.colorBgElevated,
                    borderRadius: token.borderRadiusSM,
                  }}
                />
              </Tooltip>
              <Tooltip title="Reference message">
                <Button
                  icon={<BookOutlined />}
                  size="small"
                  type="text"
                  onClick={referenceMessage}
                  style={{
                    background: token.colorBgElevated,
                    borderRadius: token.borderRadiusSM,
                  }}
                />
              </Tooltip>
            </div>
          </Space>
        </Card>
      </Dropdown>
    </div>
  );
};

export default MessageCard;

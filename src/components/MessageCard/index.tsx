import React, { useRef, useState, useMemo } from "react";
import { Card, Space, Typography, theme, Dropdown, Collapse, Grid } from "antd";
import {
  CopyOutlined,
  BookOutlined,
  StarOutlined,
  DeleteOutlined,
} from "@ant-design/icons";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import rehypeSanitize from "rehype-sanitize";
import { createMarkdownComponents } from "./markdownComponents";
import { ImageGrid } from "../ImageGrid";
import {
  ActionButtonGroup,
  createCopyButton,
  createFavoriteButton,
  createReferenceButton,
} from "../ActionButtonGroup";
import { useChatManager } from "../../hooks/useChatManager";
import { useAppStore } from "../../store";
import {
  isAssistantToolCallMessage,
  isAssistantToolResultMessage,
  Message,
  MessageImage,
} from "../../types/chat";

const { Text } = Typography;
const { useToken } = theme;
const { useBreakpoint } = Grid;

interface MessageCardProps {
  message: Message;
  isStreaming?: boolean;
  onDelete?: (messageId: string) => void;
}

const MessageCard: React.FC<MessageCardProps> = ({
  message,
  isStreaming = false,
  onDelete,
}) => {
  const { role, id: messageId } = message;
  const { token } = useToken();
  const screens = useBreakpoint();
  const { currentChatId } = useChatManager();
  const addFavorite = useAppStore((state) => state.addFavorite);
  const cardRef = useRef<HTMLDivElement>(null);
  const [selectedText, setSelectedText] = useState<string>("");
  const [isHovering, setIsHovering] = useState<boolean>(false);

  // Memoize expensive operations for better performance
  const messageText = useMemo(() => {
    if (message.role === "system" || message.role === "user") {
      return message.content;
    }
    if (message.role === "assistant") {
      if (message.type === "text") {
        return message.content;
      }
      if (message.type === "tool_result") {
        return `Tool ${message.toolName} Result: ${message.result.result}`;
      }
      if (message.type === "tool_call") {
        return `Requesting to call ${message.toolCalls
          .map((tc) => tc.toolName)
          .join(", ")}`;
      }
    }
    return "";
  }, [message]);

  const isUserToolCall = useMemo(
    () => role === "user" && messageText.startsWith("/"),
    [role, messageText]
  );

  // Create markdown components with current theme
  const markdownComponents = useMemo(
    () => createMarkdownComponents(token),
    [token]
  );

  // Standardized plugin configuration for consistency
  const markdownPlugins = useMemo(() => [remarkGfm, remarkBreaks], []);
  const rehypePlugins = useMemo(() => [rehypeSanitize], []);

  // Responsive calculation
  const getCardMaxWidth = () => {
    if (screens.xs) return "100%";
    if (screens.sm) return "95%";
    return "800px";
  };

  // Function to format user tool call display
  const formatUserToolCall = (toolCall: string): string => {
    if (!toolCall.startsWith("/")) return toolCall;

    const parts = toolCall.split(" ");
    const toolName = parts[0].substring(1); // Remove the "/"
    const description = parts.slice(1).join(" ");

    // Make tool name more user-friendly
    const friendlyToolName = toolName
      .replace(/_/g, " ")
      .replace(/\b\w/g, (l) => l.toUpperCase());

    return `🔧 ${friendlyToolName}: ${description}`;
  };

  // Add entire message to favorites
  const addMessageToFavorites = () => {
    if (currentChatId) {
      if (selectedText) {
        addSelectedToFavorites();
      } else {
        addFavorite({
          chatId: currentChatId,
          content: messageText,
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
      const referenceText = createReference(messageText);
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
          copyToClipboard(messageText);
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
    ...(onDelete && messageId
      ? [
          {
            key: "delete",
            label: "Delete message",
            icon: <DeleteOutlined />,
            onClick: () => onDelete(messageId),
            danger: true,
          },
        ]
      : []),
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
            maxWidth: getCardMaxWidth(),
            margin: "0 auto",
            background:
              role === "user"
                ? token.colorPrimaryBg
                : role === "assistant"
                ? token.colorBgLayout
                : token.colorBgContainer,
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

            {/* Images for User Messages */}
            {message.role === "user" && message.images && (
              <ImageGrid images={message.images} />
            )}

            {/* Content */}
            <div style={{ width: "100%", maxWidth: "100%" }}>
              {/* Case 1: Assistant Tool Result */}
              {isAssistantToolResultMessage(message) ? (
                <>
                  {message.result.display_preference === "Collapsible" ? (
                    <Collapse
                      ghost
                      size="small"
                      items={[
                        {
                          key: "tool-result-panel",
                          label: `View Result: ${message.toolName}`,
                          children: (
                            <ReactMarkdown
                              remarkPlugins={markdownPlugins}
                              rehypePlugins={rehypePlugins}
                              components={markdownComponents}
                            >
                              {message.result.result}
                            </ReactMarkdown>
                          ),
                        },
                      ]}
                    />
                  ) : message.result.display_preference === "Hidden" ? (
                    <Text italic>Tool executed: {message.toolName}</Text>
                  ) : (
                    <ReactMarkdown
                      remarkPlugins={markdownPlugins}
                      rehypePlugins={rehypePlugins}
                      components={markdownComponents}
                    >
                      {message.result.result}
                    </ReactMarkdown>
                  )}
                </>
              ) : isAssistantToolCallMessage(message) ? (
                // Case 2: Assistant Tool Call
                <Space direction="vertical" style={{ width: "100%" }}>
                  {message.toolCalls.map((call) => (
                    <Card
                      key={call.toolCallId}
                      size="small"
                      title={`Requesting Tool: ${call.toolName}`}
                    >
                      <pre
                        style={{
                          whiteSpace: "pre-wrap",
                          wordBreak: "break-all",
                        }}
                      >
                        {JSON.stringify(call.parameters, null, 2)}
                      </pre>
                    </Card>
                  ))}
                </Space>
              ) : (
                // Case 3: Regular Text Message (User or Assistant)
                <>
                  {message.role === "assistant" &&
                  !messageText &&
                  !isStreaming ? (
                    <Text italic>Assistant is thinking...</Text>
                  ) : (
                    <ReactMarkdown
                      remarkPlugins={markdownPlugins}
                      rehypePlugins={rehypePlugins}
                      components={markdownComponents}
                    >
                      {isUserToolCall
                        ? formatUserToolCall(messageText)
                        : messageText}
                    </ReactMarkdown>
                  )}
                </>
              )}

              {/* Blinking cursor for streaming */}
              {isStreaming && role === "assistant" && (
                <span
                  className="blinking-cursor"
                  style={{
                    display: "inline-block",
                    marginLeft: "0.2em",
                    color: token.colorText,
                  }}
                />
              )}
            </div>

            {/* Action buttons */}
            <ActionButtonGroup
              isVisible={isHovering}
              position={{ bottom: token.paddingXS, right: token.paddingXS }}
              buttons={[
                createCopyButton(() => copyToClipboard(messageText)),
                createFavoriteButton(addMessageToFavorites),
                createReferenceButton(referenceMessage),
              ]}
            />
          </Space>
        </Card>
      </Dropdown>
    </div>
  );
};

export default MessageCard;

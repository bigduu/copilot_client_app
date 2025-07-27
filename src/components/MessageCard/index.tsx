import React, { useRef, useState } from "react";
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
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { MermaidChart } from "../MermaidChart";
import { ImageGrid } from "../ImageGrid";
import {
  ActionButtonGroup,
  createCopyButton,
  createFavoriteButton,
  createReferenceButton,
} from "../ActionButtonGroup";
import { useChats } from "../../hooks/useChats";
import { useChatStore } from "../../store/chatStore";
import { MessageImage, MessageContent, getMessageText } from "../../types/chat";
import { useMessages } from "../../hooks/useMessages";
import ApprovalCard from "./ApprovalCard";
import {
  isApprovalRequest,
  parseApprovalRequest,
  createApprovedRequest,
  createRejectedRequest,
} from "../../utils/approvalUtils";

const { Text } = Typography;
const { useToken } = theme;
const { useBreakpoint } = Grid;

interface MessageCardProps {
  role: string;
  content: MessageContent;
  processorUpdates?: string[];
  messageIndex?: number;
  children?: React.ReactNode;
  messageId?: string;
  images?: MessageImage[];
  onDelete?: (messageId: string) => void;
  isStreaming?: boolean;
}

const MessageCard: React.FC<MessageCardProps> = ({
  role,
  content,
  processorUpdates,
  children,
  messageId,
  isStreaming = false,
  images = [],
  onDelete,
}) => {
  const { token } = useToken();
  const screens = useBreakpoint();
  const { currentChatId } = useChats();
  const { sendMessage } = useMessages();
  const addFavorite = useChatStore((state) => state.addFavorite);
  const cardRef = useRef<HTMLDivElement>(null);
  const [selectedText, setSelectedText] = useState<string>("");
  const [isHovering, setIsHovering] = useState<boolean>(false);
  const [approvalProcessing, setApprovalProcessing] = useState<boolean>(false);
  const [approvalHandled, setApprovalHandled] = useState<boolean>(false);

  // Responsive calculation
  const getCardMaxWidth = () => {
    if (screens.xs) return "100%";
    if (screens.sm) return "95%";
    return "800px";
  };

  // Check if this is an approval request
  const messageText = getMessageText(content);
  const isApproval = role === "assistant" && isApprovalRequest(messageText);
  const approvalData = isApproval ? parseApprovalRequest(messageText) : null;

  // Check if this is a user tool call
  const isUserToolCall = role === "user" && messageText.startsWith("/");

  // Check if this is an approval response (user's approval/rejection)
  const isApprovalResponse =
    role === "user" &&
    isApprovalRequest(messageText) &&
    parseApprovalRequest(messageText)?.approval !== undefined;

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

  // Don't render approval response messages
  if (isApprovalResponse) {
    return null;
  }

  // Handle approval actions
  const handleApprove = async () => {
    if (!approvalData || approvalHandled) return;

    setApprovalProcessing(true);
    try {
      const approvedRequest = createApprovedRequest(approvalData);
      await sendMessage(approvedRequest);
      setApprovalHandled(true); // Mark as permanently handled
    } catch (error) {
      console.error("Failed to send approval:", error);
    } finally {
      setApprovalProcessing(false);
    }
  };

  const handleReject = async () => {
    if (!approvalData || approvalHandled) return;

    setApprovalProcessing(true);
    try {
      const rejectedRequest = createRejectedRequest(approvalData);
      await sendMessage(rejectedRequest);
      setApprovalHandled(true); // Mark as permanently handled
    } catch (error) {
      console.error("Failed to send rejection:", error);
    } finally {
      setApprovalProcessing(false);
    }
  };

  // Add entire message to favorites
  const addMessageToFavorites = () => {
    if (currentChatId) {
      if (selectedText) {
        addSelectedToFavorites();
      } else {
        addFavorite({
          chatId: currentChatId,
          content: getMessageText(content),
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
      const textContent = getMessageText(content);
      const referenceText = createReference(textContent);
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
          copyToClipboard(getMessageText(content));
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

            {/* Processor Updates */}
            {processorUpdates && processorUpdates.length > 0 && (
              <Collapse
                ghost
                size="small"
                style={{ marginBottom: token.marginXS }}
              >
                <Collapse.Panel
                  header="View Processing Steps"
                  key="proc-updates-panel"
                >
                  <Space
                    direction="vertical"
                    size="small"
                    style={{ width: "100%" }}
                  >
                    {processorUpdates.map((update, index) => (
                      <Text
                        key={`mc-proc-${index}`}
                        style={{
                          display: "block",
                          fontSize: token.fontSizeSM * 0.9,
                          color: token.colorTextSecondary,
                          fontStyle: "italic",
                          whiteSpace: "pre-wrap",
                          paddingLeft: token.paddingSM,
                        }}
                      >
                        {update}
                      </Text>
                    ))}
                  </Space>
                </Collapse.Panel>
              </Collapse>
            )}

            {/* Images */}
            <ImageGrid images={images} />

            {/* Content */}
            <div style={{ width: "100%", maxWidth: "100%" }}>
              {isApproval && approvalData ? (
                <ApprovalCard
                  data={approvalData}
                  onApprove={handleApprove}
                  onReject={handleReject}
                  disabled={approvalProcessing || approvalHandled}
                />
              ) : (
                <ReactMarkdown
                  remarkPlugins={
                    role === "user" ? [remarkGfm, remarkBreaks] : [remarkGfm]
                  }
                  components={{
                    p: ({ children }) => (
                      <Text
                        style={{
                          marginBottom: token.marginSM,
                          display: "block",
                        }}
                      >
                        {children}
                      </Text>
                    ),
                    ol: ({ children }) => (
                      <ol
                        style={{
                          marginBottom: token.marginSM,
                          paddingLeft: 20,
                        }}
                      >
                        {children}
                      </ol>
                    ),
                    ul: ({ children }) => (
                      <ul
                        style={{
                          marginBottom: token.marginSM,
                          paddingLeft: 20,
                        }}
                      >
                        {children}
                      </ul>
                    ),
                    li: ({ children }) => (
                      <li
                        style={{
                          marginBottom: token.marginXS,
                        }}
                      >
                        {children}
                      </li>
                    ),
                    code({ className, children, ...props }) {
                      const match = /language-(\w+)/.exec(className || "");
                      const language = match ? match[1] : "";
                      const isInline = !match && !className;
                      const codeString = String(children).replace(/\n$/, "");

                      if (isInline) {
                        return (
                          <Text code className={className} {...props}>
                            {children}
                          </Text>
                        );
                      }

                      // Handle Mermaid diagrams
                      if (language === "mermaid") {
                        return <MermaidChart chart={codeString} />;
                      }

                      return (
                        <div
                          style={{
                            position: "relative",
                            maxWidth: "100%",
                            overflow: "auto",
                          }}
                        >
                          <SyntaxHighlighter
                            style={oneDark}
                            language={language || "text"}
                            PreTag="div"
                            customStyle={{
                              margin: `${token.marginXS}px 0`,
                              borderRadius: token.borderRadiusSM,
                              fontSize: token.fontSizeSM,
                              maxWidth: "100%",
                            }}
                          >
                            {codeString}
                          </SyntaxHighlighter>
                        </div>
                      );
                    },
                    blockquote: ({ children }) => (
                      <div
                        style={{
                          borderLeft: `3px solid ${token.colorPrimary}`,
                          background: token.colorPrimaryBg,
                          padding: `${token.paddingXS}px ${token.padding}px`,
                          margin: `${token.marginXS}px 0`,
                          color: token.colorTextSecondary,
                          fontStyle: "italic",
                        }}
                      >
                        {children}
                      </div>
                    ),
                    a: ({ children }) => (
                      <Text style={{ color: token.colorLink }}>{children}</Text>
                    ),
                  }}
                >
                  {isUserToolCall
                    ? formatUserToolCall(getMessageText(content))
                    : getMessageText(content)}
                </ReactMarkdown>
              )}

              {/* 流式显示光标 */}
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
            {children}

            {/* Action buttons */}
            <ActionButtonGroup
              isVisible={isHovering}
              position={{ bottom: token.paddingXS, right: token.paddingXS }}
              buttons={[
                createCopyButton(() =>
                  copyToClipboard(getMessageText(content))
                ),
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

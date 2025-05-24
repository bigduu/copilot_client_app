import React, { useRef, useState } from "react";
import {
  Card,
  Space,
  Typography,
  theme,
  Button,
  Dropdown,
  Tooltip,
  Collapse, // Added Collapse
} from "antd";
import { CopyOutlined, BookOutlined, StarOutlined } from "@ant-design/icons";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { useChat } from "../../contexts/ChatContext";
import ToolApprovalCard from "../ToolApprovalCard";
import { ToolCall, toolParser } from "../../utils/toolParser";

const { Text } = Typography;
const { useToken } = theme;
const { Panel } = Collapse;

interface MessageCardProps {
  role: string;
  content: string;
  processorUpdates?: string[]; // Add this
  messageIndex?: number;
  children?: React.ReactNode;
  messageId?: string;
}

const MessageCard: React.FC<MessageCardProps> = ({
  role,
  content,
  processorUpdates, // Add this
  children,
  messageId,
}) => {
  const { token } = useToken();
  const { currentChatId, addFavorite } = useChat();
  const cardRef = useRef<HTMLDivElement>(null);
  const [selectedText, setSelectedText] = useState<string>("");
  const [isHovering, setIsHovering] = useState<boolean>(false);

  // Extract tool calls from content if present
  const toolCalls = toolParser.parseToolCallsFromContent(content);

  // Add handlers for tool approval and rejection
  const handleToolApprove = (toolCall: ToolCall) => {
    console.log("[MessageCard] Tool approved:", toolCall);
    // Call your tool execution logic here
    if (typeof (window as any).__executeApprovedTool === "function") {
      (window as any).__executeApprovedTool(toolCall);
    }
  };

  const handleToolReject = (toolCall: ToolCall) => {
    console.log("[MessageCard] Tool rejected:", toolCall);
  };

  // 添加整个消息到收藏夹
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

  // 添加选中内容到收藏夹
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

  // 监听选中内容
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

  // 复制文本到剪贴板
  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch (e) {
      console.error("Failed to copy text:", e);
    }
  };

  // 创建引用格式
  const createReference = (text: string) => {
    return `> ${text.replace(/\n/g, "\n> ")}`;
  };

  // 引用消息
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

  // 上下文菜单项
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

  // Render tool calls if present
  const renderToolCalls = () => {
    if (!toolCalls || toolCalls.length === 0) return null;

    return (
      <div style={{ marginTop: token.marginMD }}>
        <Collapse
          ghost
          defaultActiveKey={["1"]}
          style={{ background: "transparent", padding: 0 }}
        >
          <Panel
            header={`检测到 ${toolCalls.length} 个工具调用`}
            key="1"
            style={{ border: "none" }}
          >
            <div
              style={{ display: "flex", flexDirection: "column", gap: "8px" }}
            >
              {toolCalls.map((toolCall, index) => (
                <ToolApprovalCard
                  key={index}
                  toolCall={toolCall}
                  onApprove={handleToolApprove}
                  onReject={handleToolReject}
                />
              ))}
            </div>
          </Panel>
        </Collapse>
      </div>
    );
  };

  // Render processor updates if present
  const renderProcessorUpdates = () => {
    if (!processorUpdates || processorUpdates.length === 0) return null;

    return (
      <div style={{ marginTop: token.marginSM }}>
        <Collapse ghost style={{ background: "transparent", padding: 0 }}>
          <Panel
            header={`处理器更新 (${processorUpdates.length})`}
            key="1"
            style={{ border: "none" }}
          >
            <div
              style={{
                fontSize: token.fontSizeSM,
                color: token.colorTextSecondary,
              }}
            >
              {processorUpdates.map((update, index) => (
                <div
                  key={index}
                  style={{
                    marginBottom: token.marginXS,
                    padding: token.paddingXS,
                    borderRadius: token.borderRadiusSM,
                    background: update.includes("成功")
                      ? token.colorSuccessBg
                      : update.includes("失败")
                      ? token.colorErrorBg
                      : token.colorInfoBg,
                  }}
                >
                  {update}
                </div>
              ))}
            </div>
          </Panel>
        </Collapse>
      </div>
    );
  };

  // Get content without tool calls for display
  const getContentWithoutToolCalls = () => {
    if (toolCalls.length === 0) return content;

    // Try to clean up the content by removing tool call JSON blocks
    let cleanContent = content;
    for (const toolCall of toolCalls) {
      try {
        // Try to find and remove the JSON string for this tool call
        const jsonString = JSON.stringify(toolCall, null, 2);
        cleanContent = cleanContent.replace(jsonString, "");
      } catch (e) {
        console.error("Error cleaning tool call from content:", e);
      }
    }

    return cleanContent.trim() || "Assistant sent a tool call.";
  };

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

            {/* Tool calls display (only for assistant messages) */}
            {role === "assistant" && renderToolCalls()}

            {/* Normal content without tool calls */}
            <div style={{ width: "100%", maxWidth: "100%" }}>
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
                {toolCalls.length > 0 ? getContentWithoutToolCalls() : content}
              </ReactMarkdown>
            </div>

            {/* Processor updates display */}
            {role === "assistant" && renderProcessorUpdates()}

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

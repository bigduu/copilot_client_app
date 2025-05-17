import React, { useState, useRef } from "react";
import {
  Card,
  Space,
  Typography,
  theme,
  Button,
  Dropdown,
  Menu,
  Tooltip,
} from "antd";
import {
  CopyOutlined,
  EditOutlined,
  BookOutlined,
  StarOutlined,
} from "@ant-design/icons";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { useChat } from "../../contexts/ChatContext";

const { Text } = Typography;
const { useToken } = theme;

interface MessageCardProps {
  role: string;
  content: string;
  messageIndex?: number;
  children?: React.ReactNode;
}

const MessageCard: React.FC<MessageCardProps> = ({
  role,
  content,
  messageIndex,
  children,
}) => {
  const { token } = useToken();
  const { currentChatId, addFavorite } = useChat();
  const [selectedText, setSelectedText] = useState<string>("");
  const [selectionRange, setSelectionRange] = useState<{
    start: number;
    end: number;
  } | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  // Handle text selection
  const handleMouseUp = () => {
    const selection = window.getSelection();
    if (selection && selection.toString().trim()) {
      setSelectedText(selection.toString().trim());

      try {
        // Get the text content of the card
        const cardText = cardRef.current?.textContent || "";

        // Find the start and end positions of the selection within the card's text
        const selectionText = selection.toString();
        const range = selection.getRangeAt(0);

        // Use a more reliable way to determine selection position
        const preSelectionRange = range.cloneRange();
        if (cardRef.current) {
          preSelectionRange.selectNodeContents(cardRef.current);
          preSelectionRange.setEnd(range.startContainer, range.startOffset);
          const start = preSelectionRange.toString().length;

          setSelectionRange({
            start,
            end: start + selectionText.length,
          });

          console.log("Selection range:", {
            start,
            end: start + selectionText.length,
            text: selectionText,
          });
        }
      } catch (e) {
        console.error("Error calculating selection range:", e);
        setSelectionRange(null);
      }
    } else {
      setSelectedText("");
      setSelectionRange(null);
    }
  };

  // Add the selected content as a favorite
  const addSelectionToFavorites = () => {
    if (selectedText && currentChatId && selectionRange) {
      addFavorite({
        chatId: currentChatId,
        content: selectedText,
        role: role as "user" | "assistant",
        originalContent: content,
        selectionStart: selectionRange.start,
        selectionEnd: selectionRange.end,
      });

      // Give visual feedback
      const selection = window.getSelection();
      if (selection) selection.removeAllRanges(); // Clear selection
    }
  };

  // Add the entire message as a favorite
  const addMessageToFavorites = () => {
    if (currentChatId) {
      addFavorite({
        chatId: currentChatId,
        content: content,
        role: role as "user" | "assistant",
      });
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

  // Create a reference with the selected text or entire message
  const createReference = (text: string) => {
    return `> ${text.replace(/\n/g, "\n> ")}`;
  };

  // Reference the selected text or entire message
  const referenceText = () => {
    const textToInsert = selectedText || content;
    const referenceText = createReference(textToInsert);

    // We're using global custom event to communicate with InputContainer
    // This is a more direct approach than using clipboard
    const event = new CustomEvent("reference-text", {
      detail: { text: referenceText },
    });
    window.dispatchEvent(event);

    // Clear selection after referencing
    const selection = window.getSelection();
    if (selection) selection.removeAllRanges();
  };

  // Context menu items for right-click
  const contextMenuItems = [
    {
      key: "copy",
      label: "Copy",
      icon: <CopyOutlined />,
      onClick: () => copyToClipboard(selectedText || content),
    },
    {
      key: "favorite",
      label: selectedText ? "Add selection to favorites" : "Add to favorites",
      icon: <StarOutlined />,
      onClick: () =>
        selectedText ? addSelectionToFavorites() : addMessageToFavorites(),
    },
    {
      key: "reference",
      label: selectedText ? "Reference selection" : "Reference message",
      icon: <BookOutlined />,
      onClick: () => referenceText(),
    },
  ];

  return (
    <div onMouseUp={handleMouseUp}>
      <Dropdown menu={{ items: contextMenuItems }} trigger={["contextMenu"]}>
        <Card
          ref={cardRef}
          style={{
            width: "100%",
            background:
              role === "user"
                ? token.colorPrimaryBg
                : role === "assistant"
                ? token.colorBgLayout
                : token.colorBgContainer,
            borderRadius: token.borderRadiusLG,
            boxShadow: token.boxShadow,
            position: "relative",
          }}
        >
          <Space
            direction="vertical"
            size={token.marginXS}
            style={{ width: "100%" }}
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
            <div>
              <ReactMarkdown
                remarkPlugins={
                  role === "user" ? [remarkGfm, remarkBreaks] : [remarkGfm]
                }
                components={{
                  p: ({ children }) => (
                    <Text
                      style={{ marginBottom: token.marginSM, display: "block" }}
                    >
                      {children}
                    </Text>
                  ),
                  ol: ({ children }) => (
                    <ol
                      style={{ marginBottom: token.marginSM, paddingLeft: 20 }}
                    >
                      {children}
                    </ol>
                  ),
                  ul: ({ children }) => (
                    <ul
                      style={{ marginBottom: token.marginSM, paddingLeft: 20 }}
                    >
                      {children}
                    </ul>
                  ),
                  li: ({ children }) => (
                    <li style={{ marginBottom: token.marginXS }}>{children}</li>
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
                      <div style={{ position: "relative" }}>
                        <SyntaxHighlighter
                          style={oneDark}
                          language={language || "text"}
                          PreTag="div"
                          customStyle={{
                            margin: `${token.marginXS}px 0`,
                            borderRadius: token.borderRadiusSM,
                            fontSize: token.fontSizeSM,
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
                }}
              >
                {content}
              </ReactMarkdown>
            </div>
            {children}

            {/* Action buttons - shown for assistant messages by default */}
            {role === "assistant" && (
              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: token.marginXS,
                  marginTop: token.marginXS,
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
                    onClick={referenceText}
                    style={{
                      background: token.colorBgElevated,
                      borderRadius: token.borderRadiusSM,
                    }}
                  />
                </Tooltip>
              </div>
            )}
          </Space>
        </Card>
      </Dropdown>
    </div>
  );
};

export default MessageCard;

import React, { useRef, useState, useEffect } from "react";
import {
  Card,
  Space,
  Typography,
  theme,
  Button,
  Dropdown,
  Tooltip,
  Collapse,
  Grid,
  Flex,
} from "antd";
import { CopyOutlined, BookOutlined, StarOutlined } from "@ant-design/icons";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import mermaid from "mermaid";
import { useChat } from "../../contexts/ChatContext";

const { Text } = Typography;
const { useToken } = theme;
const { useBreakpoint } = Grid;

// Initialize Mermaid
mermaid.initialize({
  startOnLoad: false,
  theme: "dark",
  securityLevel: "loose",
});

// 缓存已渲染的图表
const mermaidCache = new Map<string, { svg: string; height: number }>();

// Mermaid Component
interface MermaidProps {
  chart: string;
  id: string;
}

const MermaidChart: React.FC<MermaidProps> = React.memo(({ chart, id }) => {
  const { token } = useToken();
  // 初始化时检查缓存
  const cacheKey = chart.trim();
  const initialCached = mermaidCache.get(cacheKey);

  const [renderState, setRenderState] = useState<{
    svg: string;
    height: number;
    error: string;
    isLoading: boolean;
  }>({
    svg: initialCached?.svg || "",
    height: initialCached?.height || 200,
    error: "",
    isLoading: !initialCached, // 如果有缓存就不需要加载
  });

  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // 如果有缓存，直接使用
    if (initialCached) {
      return;
    }

    // 如果当前状态不是 loading，说明已经渲染过了
    if (!renderState.isLoading) {
      return;
    }

    let isMounted = true;

    const renderChart = async () => {
      try {
        // 使用唯一的 ID 避免冲突
        const uniqueId = `mermaid-${Math.random().toString(36).substr(2, 9)}`;
        const { svg: renderedSvg } = await mermaid.render(uniqueId, chart);

        if (isMounted) {
          // 创建临时元素来测量高度
          const tempDiv = document.createElement("div");
          tempDiv.style.position = "absolute";
          tempDiv.style.visibility = "hidden";
          tempDiv.style.width = "800px"; // 假设最大宽度
          tempDiv.innerHTML = renderedSvg;
          document.body.appendChild(tempDiv);

          const svgElement = tempDiv.querySelector("svg");
          let finalHeight = 200; // 默认高度

          if (svgElement) {
            finalHeight = svgElement.getBoundingClientRect().height + 32;
          }

          document.body.removeChild(tempDiv);

          // 缓存结果
          mermaidCache.set(chart.trim(), {
            svg: renderedSvg,
            height: finalHeight,
          });

          setRenderState({
            svg: renderedSvg,
            height: finalHeight,
            error: "",
            isLoading: false,
          });
        }
      } catch (err) {
        console.error("Mermaid rendering error:", err);
        if (isMounted) {
          setRenderState((prev) => ({
            ...prev,
            error: "Failed to render Mermaid diagram",
            isLoading: false,
          }));
        }
      }
    };

    renderChart();

    return () => {
      isMounted = false;
    };
  }, [chart, initialCached]);

  const { svg, height, error, isLoading } = renderState;

  if (error) {
    return (
      <div
        style={{
          color: token.colorError,
          padding: token.paddingXS,
          fontSize: token.fontSizeSM,
          background: token.colorErrorBg,
          borderRadius: token.borderRadiusSM,
          border: `1px solid ${token.colorErrorBorder}`,
          margin: `${token.marginXS}px 0`,
          height: "60px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {error}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      style={{
        textAlign: "center",
        margin: `${token.marginXS}px 0`,
        padding: token.padding,
        background: token.colorBgContainer,
        borderRadius: token.borderRadiusSM,
        border: `1px solid ${token.colorBorder}`,
        overflow: "hidden",
        height: `${height}px`, // 使用固定高度
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
        // 优化性能
        willChange: "auto",
        contain: "layout style paint",
      }}
    >
      {isLoading && (
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            color: token.colorTextSecondary,
            fontSize: token.fontSizeSM,
            zIndex: 2,
          }}
        >
          Rendering diagram...
        </div>
      )}
      <div
        style={{
          width: "100%",
          height: "100%",
          opacity: isLoading ? 0 : 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "auto",
        }}
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    </div>
  );
});

interface MessageCardProps {
  role: string;
  content: string;
  processorUpdates?: string[];
  messageIndex?: number;
  children?: React.ReactNode;
  messageId?: string;
}

const MessageCard: React.FC<MessageCardProps> = ({
  role,
  content,
  processorUpdates,
  children,
  messageId,
}) => {
  const { token } = useToken();
  const screens = useBreakpoint();
  const { currentChatId, addFavorite } = useChat();
  const cardRef = useRef<HTMLDivElement>(null);
  const [selectedText, setSelectedText] = useState<string>("");
  const [isHovering, setIsHovering] = useState<boolean>(false);

  // 响应式计算
  const getCardMaxWidth = () => {
    if (screens.xs) return "100%";
    if (screens.sm) return "95%";
    return "800px";
  };

  const getActionButtonSize = (): "small" | "middle" | "large" => {
    return screens.xs ? "small" : "small";
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

            {/* Content */}
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

                    // Handle Mermaid diagrams
                    if (language === "mermaid") {
                      const mermaidId = `mermaid-${Math.random()
                        .toString(36)
                        .substr(2, 9)}`;
                      return <MermaidChart chart={codeString} id={mermaidId} />;
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
                {content}
              </ReactMarkdown>
            </div>
            {children}

            {/* Action buttons */}
            <Flex
              justify="flex-end"
              gap={token.marginXS}
              style={{
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
                  size={getActionButtonSize()}
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
                  size={getActionButtonSize()}
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
                  size={getActionButtonSize()}
                  type="text"
                  onClick={referenceMessage}
                  style={{
                    background: token.colorBgElevated,
                    borderRadius: token.borderRadiusSM,
                  }}
                />
              </Tooltip>
            </Flex>
          </Space>
        </Card>
      </Dropdown>
    </div>
  );
};

export default MessageCard;

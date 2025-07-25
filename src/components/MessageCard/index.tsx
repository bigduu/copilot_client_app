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
  Image,
} from "antd";
import {
  CopyOutlined,
  BookOutlined,
  StarOutlined,
  EyeOutlined,
  DeleteOutlined,
} from "@ant-design/icons";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import mermaid from "mermaid";
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";
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

// Initialize Mermaid
mermaid.initialize({
  startOnLoad: false,
  theme: "dark",
  securityLevel: "loose",
  // Global font size for better visibility
  fontSize: 16,
  // Configure responsive behavior - disable useMaxWidth for better scaling
  flowchart: {
    useMaxWidth: false,
    htmlLabels: true,
    nodeSpacing: 15,
    rankSpacing: 30,
  },
  // Configure other diagram types for better scaling
  sequence: {
    useMaxWidth: false,
    actorMargin: 60,
    boxMargin: 10,
    messageMargin: 40,
  },
  gantt: {
    useMaxWidth: false,
    barHeight: 25,
    fontSize: 14,
  },
  journey: {
    useMaxWidth: false,
  },
  timeline: {
    useMaxWidth: false,
  },
  gitGraph: {
    useMaxWidth: false,
    showBranches: true,
    showCommitLabel: true,
  },
  c4: {
    useMaxWidth: false,
  },
  sankey: {
    useMaxWidth: false,
    width: 1000,
    height: 600,
  },
  xyChart: {
    useMaxWidth: false,
    width: 900,
    height: 600,
  },
  block: {
    useMaxWidth: false,
  },
});

// Cache for rendered charts
const mermaidCache = new Map<
  string,
  {
    svg: string;
    height: number;
    svgWidth: number;
    svgHeight: number;
  }
>();

// Mermaid Component
interface MermaidProps {
  chart: string;
  id: string;
}

const MermaidChart: React.FC<MermaidProps> = React.memo(
  ({ chart, id: _id }) => {
    const { token } = useToken();
    // Check cache during initialization
    const cacheKey = chart.trim();
    const initialCached = mermaidCache.get(cacheKey);

    const [renderState, setRenderState] = useState<{
      svg: string;
      height: number;
      svgWidth: number;
      svgHeight: number;
      error: string;
      isLoading: boolean;
    }>({
      svg: initialCached?.svg || "",
      height: initialCached?.height || 200,
      svgWidth: initialCached?.svgWidth || 800,
      svgHeight: initialCached?.svgHeight || 200,
      error: "",
      isLoading: !initialCached, // No loading needed if cached
    });

    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
      // Use cache directly if available
      if (initialCached) {
        return;
      }

      // If current state is not loading, it means already rendered
      if (!renderState.isLoading) {
        return;
      }

      let isMounted = true;

      const renderChart = async () => {
        try {
          // Use unique ID to avoid conflicts
          const uniqueId = `mermaid-${Math.random()
            .toString(36)
            .substring(2, 11)}`;
          const { svg: renderedSvg } = await mermaid.render(uniqueId, chart);

          if (isMounted) {
            // Create temporary element to measure dimensions
            const tempDiv = document.createElement("div");
            tempDiv.style.position = "absolute";
            tempDiv.style.visibility = "hidden";
            tempDiv.style.width = "800px"; // Fixed width for measurement
            tempDiv.innerHTML = renderedSvg;
            document.body.appendChild(tempDiv);

            const svgElement = tempDiv.querySelector("svg");
            let finalHeight = 200; // Default height
            let svgWidth = 800; // Default width
            let svgHeight = 200; // Default SVG height

            if (svgElement) {
              // Get original SVG dimensions
              const rect = svgElement.getBoundingClientRect();
              svgWidth = rect.width;
              svgHeight = rect.height;
              finalHeight = Math.max(rect.height + 32, 200); // Minimum 200px
            }

            document.body.removeChild(tempDiv);

            // Cache the result
            mermaidCache.set(chart.trim(), {
              svg: renderedSvg,
              height: finalHeight,
              svgWidth,
              svgHeight,
            });

            setRenderState({
              svg: renderedSvg,
              height: finalHeight,
              svgWidth,
              svgHeight,
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

    const { svg, height, svgWidth, error, isLoading } = renderState;

    // Calculate optimal initial scale - now that we've disabled useMaxWidth,
    // diagrams should render at their natural size, so we can use more conservative scaling
    const calculateInitialScale = () => {
      // Since we disabled useMaxWidth, diagrams will be larger by default
      // Use more conservative scaling
      if (svgWidth > 1200) {
        return 0.8; // Scale down very wide diagrams
      }

      if (svgWidth > 800) {
        return 1.0; // Normal scale for medium diagrams
      }

      // For smaller diagrams, scale up slightly
      return 1.2;
    };

    const initialScale = calculateInitialScale();

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
          overflow: "hidden", // Hide overflow for zoom/pan
          height: `${Math.max(Math.min(height, 800), 400)}px`, // Better height range: 400-800px
          maxHeight: "80vh", // Prevent extremely tall diagrams
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
          // Performance optimization
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
            position: "relative",
          }}
        >
          <TransformWrapper
            initialScale={initialScale}
            minScale={0.1}
            maxScale={10}
            centerOnInit={true}
            limitToBounds={false}
            wheel={{ step: 0.1 }}
            panning={{ disabled: false }}
            pinch={{ disabled: false }}
            doubleClick={{ disabled: false, mode: "zoomIn", step: 0.5 }}
          >
            {({ zoomIn, zoomOut, resetTransform }) => (
              <>
                {/* Zoom Controls */}
                <div
                  style={{
                    position: "absolute",
                    top: 8,
                    right: 8,
                    zIndex: 10,
                    display: "flex",
                    flexDirection: "column",
                    gap: 4,
                    background: token.colorBgContainer,
                    borderRadius: token.borderRadiusSM,
                    border: `1px solid ${token.colorBorder}`,
                    padding: 4,
                    boxShadow: token.boxShadowSecondary,
                  }}
                >
                  <Button
                    size="small"
                    type="text"
                    onClick={() => zoomIn()}
                    style={{ fontSize: 12, padding: "2px 6px" }}
                  >
                    +
                  </Button>
                  <Button
                    size="small"
                    type="text"
                    onClick={() => zoomOut()}
                    style={{ fontSize: 12, padding: "2px 6px" }}
                  >
                    -
                  </Button>
                  <Button
                    size="small"
                    type="text"
                    onClick={() => resetTransform()}
                    style={{ fontSize: 10, padding: "2px 6px" }}
                  >
                    ⌂
                  </Button>
                </div>

                {/* SVG Content */}
                <TransformComponent
                  wrapperStyle={{
                    width: "100%",
                    height: "100%",
                  }}
                  contentStyle={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: "100%",
                    height: "100%",
                  }}
                >
                  <div
                    style={{
                      display: "inline-block",
                      lineHeight: 0,
                    }}
                    dangerouslySetInnerHTML={{
                      __html: svg.replace(
                        /<svg([^>]*)>/,
                        '<svg$1 style="display: block; max-width: 100%; max-height: 100%;">'
                      ),
                    }}
                  />
                </TransformComponent>
              </>
            )}
          </TransformWrapper>
        </div>
      </div>
    );
  }
);

interface MessageCardProps {
  role: string;
  content: MessageContent;
  processorUpdates?: string[];
  messageIndex?: number;
  children?: React.ReactNode;
  messageId?: string;
  images?: MessageImage[];
  onDelete?: (messageId: string) => void;
}

const MessageCard: React.FC<MessageCardProps> = ({
  role,
  content,
  processorUpdates,
  children,
  messageId,
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

  const getActionButtonSize = (): "small" | "middle" | "large" => {
    return screens.xs ? "small" : "small";
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
            {images && images.length > 0 && (
              <div style={{ marginBottom: token.marginMD }}>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns:
                      images.length === 1
                        ? "1fr"
                        : images.length === 2
                        ? "1fr 1fr"
                        : "repeat(auto-fit, minmax(200px, 1fr))",
                    gap: token.marginSM,
                    maxWidth: "100%",
                  }}
                >
                  {images.map((image) => (
                    <div
                      key={image.id}
                      style={{
                        position: "relative",
                        borderRadius: token.borderRadius,
                        overflow: "hidden",
                        backgroundColor: token.colorBgLayout,
                        border: `1px solid ${token.colorBorder}`,
                      }}
                    >
                      <Image
                        src={image.base64}
                        alt={image.name}
                        style={{
                          width: "100%",
                          height: "auto",
                          maxHeight: images.length === 1 ? 400 : 200,
                          objectFit: "cover",
                        }}
                        preview={{
                          mask: (
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                gap: token.marginXS,
                                color: token.colorTextLightSolid,
                              }}
                            >
                              <EyeOutlined />
                              <span>Preview</span>
                            </div>
                          ),
                        }}
                      />
                      {/* Image info overlay */}
                      <div
                        style={{
                          position: "absolute",
                          bottom: 0,
                          left: 0,
                          right: 0,
                          background:
                            "linear-gradient(transparent, rgba(0,0,0,0.7))",
                          color: token.colorTextLightSolid,
                          padding: `${token.paddingXS}px ${token.paddingSM}px`,
                          fontSize: token.fontSizeSM,
                        }}
                      >
                        <div style={{ fontWeight: 500 }}>{image.name}</div>
                        {image.size && (
                          <div
                            style={{
                              fontSize: token.fontSizeSM * 0.85,
                              opacity: 0.8,
                            }}
                          >
                            {(image.size / 1024).toFixed(1)} KB
                            {image.width &&
                              image.height &&
                              ` • ${image.width}×${image.height}`}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

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
                        const mermaidId = `mermaid-${Math.random()
                          .toString(36)
                          .substring(2, 11)}`;
                        return (
                          <MermaidChart chart={codeString} id={mermaidId} />
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
                  {isUserToolCall
                    ? formatUserToolCall(getMessageText(content))
                    : getMessageText(content)}
                </ReactMarkdown>
              )}
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
                  onClick={() => copyToClipboard(getMessageText(content))}
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

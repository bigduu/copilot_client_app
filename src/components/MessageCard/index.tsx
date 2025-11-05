import React, { useRef, useState, useMemo, memo } from "react";
import { Card, Space, Typography, theme, Dropdown, Grid } from "antd";
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
  isWorkflowResultMessage,
  Message,
  PlanMessage,
  QuestionMessage,
} from "../../types/chat";
import PlanMessageCard from "../PlanMessageCard";
import QuestionMessageCard from "../QuestionMessageCard";
import { useBackendContext } from "../../hooks/useBackendContext";
import ToolResultCard from "../ToolResultCard";
import WorkflowResultCard from "../WorkflowResultCard";
import { format } from "date-fns";

const { Text } = Typography;
const { useToken } = theme;
const { useBreakpoint } = Grid;

interface MessageCardProps {
  message: Message;
  isStreaming?: boolean;
  onDelete?: (messageId: string) => void;
  // Optional: if message_type is not on Message, we can extract from content
  messageType?: "text" | "plan" | "question" | "tool_call" | "tool_result";
}

const MessageCardComponent: React.FC<MessageCardProps> = ({
  message,
  isStreaming = false,
  onDelete,
  messageType,
}) => {
  const { role, id: messageId } = message;
  const { token } = useToken();
  const screens = useBreakpoint();
  const { currentChatId } = useChatManager();
  const backendContext = useBackendContext();
  const {
    currentContext,
    updateAgentRole,
    addMessage: addMessageToBackend,
    isLoading,
  } = backendContext;
  const addFavorite = useAppStore((state) => state.addFavorite);
  const cardRef = useRef<HTMLDivElement>(null);
  const [selectedText, setSelectedText] = useState<string>("");
  const [isHovering, setIsHovering] = useState<boolean>(false);

  const formattedTimestamp = useMemo(() => {
    if (!message.createdAt) return null;
    const parsed = new Date(message.createdAt);
    if (Number.isNaN(parsed.getTime())) {
      return null;
    }
    try {
      return format(parsed, "MMM d, yyyy HH:mm");
    } catch (error) {
      return parsed.toLocaleString();
    }
  }, [message.createdAt]);

  // Extract message type: from prop, message type, or detect from content
  const detectedMessageType = useMemo(() => {
    // If messageType prop is provided, use it
    if (messageType) return messageType;

    // Check if message has message_type field (from backend MessageDTO)
    if ("message_type" in message && message.message_type) {
      return message.message_type;
    }

    // For assistant messages, try to detect plan/question from content
    if (role === "assistant" && message.type === "text") {
      const text = typeof message.content === "string" ? message.content : "";
      // Try to extract JSON and detect type
      try {
        // Look for JSON in markdown code blocks or raw
        let jsonStr = "";
        if (text.includes("```json")) {
          const start = text.indexOf("```json") + 7;
          const end = text.indexOf("```", start);
          if (end > start) {
            jsonStr = text.substring(start, end).trim();
          }
        } else if (text.includes("{")) {
          const start = text.indexOf("{");
          const end = text.lastIndexOf("}");
          if (end > start) {
            jsonStr = text.substring(start, end + 1).trim();
          }
        }

        if (jsonStr) {
          const parsed = JSON.parse(jsonStr);
          // Check for plan
          if (parsed.goal && parsed.steps && Array.isArray(parsed.steps)) {
            return "plan";
          }
          // Check for question
          if (parsed.type === "question" && parsed.question) {
            return "question";
          }
        }
      } catch (e) {
        // Not JSON or invalid, continue
      }
    }

    // Default to text
    return "text";
  }, [message, messageType, role]);

  // Parse plan from message content
  const parsedPlan = useMemo<PlanMessage | null>(() => {
    if (
      detectedMessageType !== "plan" ||
      role !== "assistant" ||
      message.type !== "text"
    ) {
      return null;
    }

    const text = message.content ?? "";
    try {
      let jsonStr = "";
      if (text.includes("```json")) {
        const start = text.indexOf("```json") + 7;
        const end = text.indexOf("```", start);
        if (end > start) {
          jsonStr = text.substring(start, end).trim();
        }
      } else if (text.includes("{")) {
        const start = text.indexOf("{");
        const end = text.lastIndexOf("}");
        if (end > start) {
          jsonStr = text.substring(start, end + 1).trim();
        }
      }

      if (jsonStr) {
        const parsed = JSON.parse(jsonStr);
        if (parsed.goal && parsed.steps) {
          // Transform to match PlanMessage interface
          return {
            goal: parsed.goal,
            steps: parsed.steps.map((step: any) => ({
              step_number: step.step_number || step.stepNumber || 0,
              action: step.action || "",
              reason: step.reason || step.rationale || "",
              tools_needed: step.tools_needed || step.tools || [],
              estimated_time: step.estimated_time || step.estimatedTime || "",
            })),
            estimated_total_time:
              parsed.estimated_total_time || parsed.estimatedTotalTime || "",
            risks: parsed.risks || [],
            prerequisites: parsed.prerequisites || [],
          };
        }
      }
    } catch (e) {
      console.error("Failed to parse plan:", e);
    }
    return null;
  }, [detectedMessageType, role, message]);

  // Parse question from message content
  const parsedQuestion = useMemo<QuestionMessage | null>(() => {
    if (
      detectedMessageType !== "question" ||
      role !== "assistant" ||
      message.type !== "text"
    ) {
      return null;
    }

    const text = message.content ?? "";
    try {
      let jsonStr = "";
      if (text.includes("```json")) {
        const start = text.indexOf("```json") + 7;
        const end = text.indexOf("```", start);
        if (end > start) {
          jsonStr = text.substring(start, end).trim();
        }
      } else if (text.includes("{")) {
        const start = text.indexOf("{");
        const end = text.lastIndexOf("}");
        if (end > start) {
          jsonStr = text.substring(start, end + 1).trim();
        }
      }

      if (jsonStr) {
        const parsed = JSON.parse(jsonStr);
        if (parsed.type === "question" && parsed.question) {
          return {
            type: "question",
            question: parsed.question,
            context: parsed.context || "",
            severity: parsed.severity || "minor",
            options: parsed.options || [],
            default: parsed.default,
            allow_custom: parsed.allow_custom || false,
          };
        }
      }
    } catch (e) {
      console.error("Failed to parse question:", e);
    }
    return null;
  }, [detectedMessageType, role, message]);

  // Memoize expensive operations for better performance
  const messageText = useMemo(() => {
    if (message.role === "system" || message.role === "user") {
      return typeof message.content === "string" ? message.content : "";
    }
    if (message.role === "assistant") {
      if (message.type === "text") {
        return typeof message.content === "string" ? message.content : "";
      }
      if (message.type === "tool_result") {
        return `Tool ${message.toolName} Result: ${message.result.result}`;
      }
      if (message.type === "tool_call") {
        return `Requesting to call ${message.toolCalls
          .map((tc) => tc.toolName)
          .join(", ")}`;
      }
      if (message.type === "workflow_result") {
        return message.content;
      }
    }
    return "";
  }, [message]);

  const isUserToolCall = useMemo(
    () => role === "user" && messageText.startsWith("/"),
    [role, messageText],
  );

  // Create markdown components with current theme
  const markdownComponents = useMemo(
    () => createMarkdownComponents(token),
    [token],
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

  // Handle plan execution (switch to Actor role)
  const handleExecutePlan = async () => {
    if (currentContext?.id) {
      try {
        await updateAgentRole(currentContext.id, "actor");
        // Optionally send a message to continue execution
        // This could be added if needed
      } catch (error) {
        console.error("Failed to switch to Actor role:", error);
      }
    }
  };

  // Handle plan refinement
  const handleRefinePlan = async (feedback: string) => {
    if (currentContext?.id && feedback.trim()) {
      try {
        // Send feedback as user message
        await addMessageToBackend(currentContext.id, "user", feedback.trim());
      } catch (error) {
        console.error("Failed to send plan refinement:", error);
      }
    }
  };

  // Handle question answer
  const handleQuestionAnswer = async (answer: string) => {
    if (currentContext?.id && answer) {
      try {
        // Send answer as user message
        await addMessageToBackend(currentContext.id, "user", answer);
        // Note: The backend will process this and continue the conversation
      } catch (error) {
        console.error("Failed to send answer:", error);
        throw error; // Re-throw so QuestionMessageCard can handle it
      }
    }
  };

  // Route to specialized cards for plan/question messages
  if (detectedMessageType === "plan" && parsedPlan && role === "assistant") {
    return (
      <PlanMessageCard
        plan={parsedPlan}
        contextId={currentContext?.id || ""}
        onExecute={handleExecutePlan}
        onRefine={handleRefinePlan}
        timestamp={formattedTimestamp ?? undefined}
      />
    );
  }

  if (
    detectedMessageType === "question" &&
    parsedQuestion &&
    role === "assistant"
  ) {
    return (
      <QuestionMessageCard
        question={parsedQuestion}
        contextId={currentContext?.id || ""}
        onAnswer={handleQuestionAnswer}
        disabled={isLoading || false}
        timestamp={formattedTimestamp ?? undefined}
      />
    );
  }

  // Default rendering for text messages
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
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                justifyContent: "space-between",
                gap: token.marginXS,
              }}
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
              {formattedTimestamp && (
                <Text
                  type="secondary"
                  style={{
                    fontSize: token.fontSizeSM,
                    whiteSpace: "nowrap",
                  }}
                >
                  {formattedTimestamp}
                </Text>
              )}
            </div>

            {/* Images for User Messages */}
            {message.role === "user" && message.images && (
              <ImageGrid images={message.images} />
            )}

            {/* Content */}
            <div style={{ width: "100%", maxWidth: "100%" }}>
              {/* Case 1: Assistant Tool Result */}
              {isAssistantToolResultMessage(message) ? (
                (() => {
                  const toolResultContent = message.result.result ?? "";
                  const toolResultErrorMessage = message.isError
                    ? toolResultContent || "Tool execution failed."
                    : undefined;
                  const toolResultIsLoading =
                    !toolResultErrorMessage &&
                    toolResultContent.trim().length === 0;

                  if (message.result.display_preference === "Hidden") {
                    return (
                      <Text italic>Tool executed: {message.toolName}</Text>
                    );
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
                      defaultCollapsed={
                        message.result.display_preference === "Collapsible"
                      }
                      isLoading={toolResultIsLoading}
                      errorMessage={toolResultErrorMessage}
                    />
                  );
                })()
              ) : isWorkflowResultMessage(message) ? (
                (() => {
                  const workflowContent = message.content ?? "";
                  const workflowErrorMessage =
                    message.status === "error"
                      ? workflowContent || "Workflow execution failed."
                      : undefined;
                  const workflowIsLoading =
                    !workflowErrorMessage &&
                    workflowContent.trim().length === 0;

                  return (
                    <WorkflowResultCard
                      content={workflowContent}
                      workflowName={message.workflowName}
                      parameters={message.parameters}
                      status={
                        workflowIsLoading
                          ? "warning"
                          : (message.status ?? "success")
                      }
                      timestamp={message.createdAt}
                      isLoading={workflowIsLoading}
                      errorMessage={workflowErrorMessage}
                    />
                  );
                })()
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

const MessageCard = memo(MessageCardComponent, (prevProps, nextProps) => {
  return (
    prevProps.message === nextProps.message &&
    prevProps.isStreaming === nextProps.isStreaming &&
    prevProps.messageType === nextProps.messageType &&
    prevProps.onDelete === nextProps.onDelete
  );
});

MessageCard.displayName = "MessageCard";

export default MessageCard;

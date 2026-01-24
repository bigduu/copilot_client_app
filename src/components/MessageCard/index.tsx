import React, { useRef, useState, useMemo, memo } from "react";
import { Card, Flex, Space, Typography, theme, Dropdown, Grid } from "antd";
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
import { getOpenAIClient } from "../../services/openaiClient";
import { useAppStore } from "../../store";
import {
  isAssistantToolCallMessage,
  isAssistantToolResultMessage,
  isWorkflowResultMessage,
  isUserFileReferenceMessage,
  isTodoListMessage,
  Message,
  PlanMessage,
  QuestionMessage,
} from "../../types/chat";
import PlanMessageCard from "../PlanMessageCard";
import QuestionMessageCard from "../QuestionMessageCard";
import ToolResultCard from "../ToolResultCard";
import WorkflowResultCard from "../WorkflowResultCard";
import FileReferenceCard from "../FileReferenceCard";
import TodoListDisplay from "../TodoListDisplay";
import { format } from "date-fns";
const { Text } = Typography;
const { useToken } = theme;
const { useBreakpoint } = Grid;

interface MessageCardProps {
  message: Message;
  onDelete?: (messageId: string) => void;
  // Optional: if message_type is not on Message, we can extract from content
  messageType?: "text" | "plan" | "question" | "tool_call" | "tool_result";
}

const MessageCardComponent: React.FC<MessageCardProps> = ({
  message,
  onDelete,
  messageType,
}) => {
  const { role, id: messageId } = message;
  const { token } = useToken();
  const screens = useBreakpoint();
  const { currentChatId, currentChat, sendMessage, updateChat } =
    useChatManager();
  const isProcessing = useAppStore((state) => state.isProcessing);
  const addFavorite = useAppStore((state) => state.addFavorite);
  const selectedModel = useAppStore((state) => state.selectedModel);
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
    if (message.role === "system") {
      return typeof message.content === "string" ? message.content : "";
    }
    if (message.role === "user") {
      if ("type" in message && message.type === "file_reference") {
        // File reference messages are handled by FileReferenceCard
        return "";
      }
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

  const extractMermaidCode = (content: string) => {
    const match = content.match(/```mermaid\s*([\s\S]*?)```/i);
    if (match) return match[1].trim();
    return content.trim();
  };

  const replaceMermaidBlock = (
    content: string,
    originalChart: string,
    fixedChart: string,
  ) => {
    const normalizedOriginal = originalChart.trim();
    const normalizedFixed = extractMermaidCode(fixedChart);
    let replaced = false;
    const updated = content.replace(
      /```mermaid\s*([\s\S]*?)```/gi,
      (match, block) => {
        if (replaced) return match;
        if (block.trim() !== normalizedOriginal) return match;
        replaced = true;
        return `\`\`\`mermaid\n${normalizedFixed}\n\`\`\``;
      },
    );
    return replaced ? updated : null;
  };

  const fixMermaidWithAI = async (chart: string) => {
    const client = getOpenAIClient();
    const model = selectedModel || "gpt-4o-mini";
    const response = await client.chat.completions.create({
      model,
      messages: [
        {
          role: "system",
          content:
            "Fix Mermaid diagrams. Return only corrected Mermaid code without markdown fences or extra text.",
        },
        {
          role: "user",
          content: chart,
        },
      ],
      temperature: 0,
    });
    const content = response.choices?.[0]?.message?.content ?? "";
    return extractMermaidCode(content);
  };

  const canFixMermaid =
    message.role === "assistant" &&
    message.type === "text" &&
    Boolean(currentChatId && currentChat);

  const onFixMermaid = useMemo(() => {
    if (!canFixMermaid) return undefined;
    return async (chart: string) => {
      if (!currentChatId || !currentChat) {
        throw new Error("No active chat available");
      }
      if (message.role !== "assistant" || message.type !== "text") {
        throw new Error("Mermaid fix is only available for assistant messages");
      }

      const fixedChart = await fixMermaidWithAI(chart);
      if (!fixedChart) {
        throw new Error("AI did not return a Mermaid fix");
      }

      const updatedContent = replaceMermaidBlock(
        message.content,
        chart,
        fixedChart,
      );
      if (!updatedContent) {
        throw new Error("Unable to locate Mermaid block to update");
      }

      const updatedMessages = currentChat.messages.map((msg) => {
        if (
          msg.id === messageId &&
          msg.role === "assistant" &&
          msg.type === "text"
        ) {
          return { ...msg, content: updatedContent };
        }
        return msg;
      });
      updateChat(currentChatId, { messages: updatedMessages });
    };
  }, [
    canFixMermaid,
    currentChat,
    currentChatId,
    message,
    messageId,
    selectedModel,
    updateChat,
  ]);

  const isUserToolCall = useMemo(
    () => role === "user" && messageText.startsWith("/"),
    [role, messageText]
  );

  // Create markdown components with current theme
  const markdownComponents = useMemo(
    () =>
      createMarkdownComponents(token, {
        onFixMermaid,
      }),
    [token, onFixMermaid]
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
    if (!currentChatId || !currentChat) return;
    try {
      updateChat(currentChatId, {
        config: {
          ...currentChat.config,
          agentRole: "actor",
        },
      });
    } catch (error) {
      console.error("Failed to switch to Actor role:", error);
    }
  };

  // Handle plan refinement
  const handleRefinePlan = async (feedback: string) => {
    if (!feedback.trim()) return;
    try {
      await sendMessage(feedback.trim());
    } catch (error) {
      console.error("Failed to send plan refinement:", error);
    }
  };

  // Handle question answer
  const handleQuestionAnswer = async (answer: string) => {
    if (!answer) return;
    try {
      await sendMessage(answer);
    } catch (error) {
      console.error("Failed to send answer:", error);
      throw error;
    }
  };

  // Route to specialized cards for plan/question messages
  if (detectedMessageType === "plan" && parsedPlan && role === "assistant") {
    return (
      <PlanMessageCard
        plan={parsedPlan}
        contextId={currentChatId || ""}
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
        contextId={currentChatId || ""}
        onAnswer={handleQuestionAnswer}
        disabled={isProcessing || false}
        timestamp={formattedTimestamp ?? undefined}
      />
    );
  }

  // Route to TodoListDisplay for TODO list messages
  if (isTodoListMessage(message)) {
    return (
      <TodoListDisplay todoList={message.todoList} />
    );
  }

  // Route to FileReferenceCard for file reference messages
  if (isUserFileReferenceMessage(message)) {
    console.log(
      "[MessageCard] Rendering FileReferenceCard for message:",
      message.id,
      "paths:",
      message.paths
    );
    return (
      <Flex justify="flex-end" style={{ width: "100%" }}>
        <FileReferenceCard
          paths={message.paths}
          displayText={message.displayText}
          timestamp={formattedTimestamp ?? undefined}
        />
      </Flex>
    );
  }

  // Default rendering for text messages
  return (
    <Flex
      vertical
      onContextMenu={(e) => handleMouseUp(e)}
      style={{ width: "100%" }}
    >
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
            <Flex
              align="baseline"
              justify="space-between"
              gap={token.marginXS}
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
            </Flex>

            {/* Images for User Messages */}
            {message.role === "user" && message.images && (
              <ImageGrid images={message.images} />
            )}

            {/* Content */}
            <Flex vertical style={{ width: "100%", maxWidth: "100%" }}>
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

                  // ✅ Completely hide tool results with Hidden preference
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
                // Case 2: Assistant Tool Call - with approve/reject buttons
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
                      <Space
                        direction="vertical"
                        style={{ width: "100%" }}
                        size="middle"
                      >
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
              ) : (
                // Case 3: Regular Text Message (User or Assistant)
                <>
                  {message.role === "assistant" &&
                  !messageText ? (
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
            </Flex>

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
    </Flex>
  );
};

const MessageCard = memo(MessageCardComponent, (prevProps, nextProps) => {
  return (
    prevProps.message === nextProps.message &&
    prevProps.messageType === nextProps.messageType &&
    prevProps.onDelete === nextProps.onDelete
  );
});

MessageCard.displayName = "MessageCard";

export default MessageCard;

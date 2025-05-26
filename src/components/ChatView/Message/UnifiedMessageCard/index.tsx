import React, { useEffect, useRef, useState } from "react";
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
import { Channel } from "@tauri-apps/api/core";
import MarkdownRenderer from "../shared/MarkdownRenderer";
import ToolCallsSection from "../shared/ToolCallsSection";
import ProcessorUpdatesSection from "../shared/ProcessorUpdatesSection";
import TypingIndicator from "../shared/TypingIndicator";
import {
  Message,
  ToolApprovalMessages,
  MessageType,
} from "../../../../types/chat";
import { useChat } from "../../../../contexts/ChatView";
import { ToolCall, toolParser } from "../../../../utils/toolParser";
import {
  messageProcessor,
  ToolExecutionResult,
} from "../../../../services/MessageProcessor";

const { Text } = Typography;
const { useToken } = theme;

interface UnifiedMessageCardProps {
  // 基础消息属性
  message: Message;
  messageIndex?: number;
  children?: React.ReactNode;

  // 流式消息属性
  isStreaming?: boolean;
  channel?: Channel<string>;
  onComplete?: (
    finalMessage: Message,
    toolExecutionResults?: ToolExecutionResult[],
    approvalMessages?: ToolApprovalMessages[]
  ) => void;

  // 静态消息属性
  onToolExecuted?: (approvalMessages: ToolApprovalMessages[]) => void;
  onMessageUpdate?: (messageId: string, updates: Partial<Message>) => void;
}

const UnifiedMessageCard: React.FC<UnifiedMessageCardProps> = ({
  message,
  messageIndex,
  children,
  isStreaming = false,
  channel,
  onComplete,
  onToolExecuted,
  onMessageUpdate,
}) => {
  const { token } = useToken();
  const { currentChatId, addFavorite } = useChat();
  const cardRef = useRef<HTMLDivElement>(null);

  // 静态消息状态
  const [selectedText, setSelectedText] = useState<string>("");
  const [isHovering, setIsHovering] = useState<boolean>(false);

  // 流式消息状态
  const [streamingContent, setStreamingContent] = useState("");
  const [processorUpdates, setProcessorUpdates] = useState<string[]>([]);
  const [isStreamingComplete, setIsStreamingComplete] = useState(false);
  const [toolCalls, setToolCalls] = useState<ToolCall[]>([]);

  // 流式消息 refs
  const hasCompletedRef = useRef(false);
  const fullTextRef = useRef("");
  const processorUpdatesRef = useRef<string[]>([]);
  const receivedMessagesCount = useRef(0);
  const startTimeRef = useRef(Date.now());
  const isMountedRef = useRef(true);
  const minTimeElapsedRef = useRef(false);

  // 确定当前内容和工具调用
  const currentContent = isStreaming ? streamingContent : message.content;
  const currentProcessorUpdates = isStreaming
    ? processorUpdates
    : message.processorUpdates || [];

  // 提取工具调用
  const allToolCalls = toolParser.parseToolCallsFromContent(currentContent);

  // 过滤待处理的工具调用（仅静态消息需要）
  const toolExecutionStatus = message?.toolExecutionStatus || {};
  const pendingToolCalls = isStreaming
    ? toolCalls
    : allToolCalls.filter((toolCall) => {
        const status = toolExecutionStatus[toolCall.tool_name];
        return !status || status === "pending";
      });

  // 流式消息完成处理
  const completeMessage = async (finalContent: string) => {
    if (hasCompletedRef.current) {
      console.log(
        "[UnifiedMessageCard] Already completed, skipping duplicate completion"
      );
      return;
    }

    if (!isMountedRef.current) {
      console.log(
        "[UnifiedMessageCard] Not completing message - component unmounted"
      );
      return;
    }

    hasCompletedRef.current = true;
    setIsStreamingComplete(true);

    // 检测工具调用
    const detectedToolCalls =
      toolParser.parseToolCallsFromContent(finalContent);
    setToolCalls(detectedToolCalls);

    let approvalMessages: ToolApprovalMessages[] = [];

    if (detectedToolCalls.length > 0) {
      console.log(
        `[UnifiedMessageCard] Detected ${detectedToolCalls.length} tool calls in response`
      );

      try {
        // 分类工具调用
        const safeCalls = detectedToolCalls.filter(
          (call) => !call.requires_approval
        );
        const dangerousCalls = detectedToolCalls.filter(
          (call) => call.requires_approval
        );

        // 自动执行安全工具
        if (safeCalls.length > 0) {
          console.log(
            `[UnifiedMessageCard] Auto-executing ${safeCalls.length} safe tools`
          );

          const autoExecutedResults =
            await messageProcessor.executeApprovedTools(safeCalls);

          autoExecutedResults.forEach((result, index) => {
            const toolName = safeCalls[index]?.tool_name || "unknown";
            const updateMessage = result.success
              ? `✅ Auto-executed ${toolName}: ${result.result}`
              : `❌ Auto-execution failed for ${toolName}: ${result.error}`;

            processorUpdatesRef.current.push(updateMessage);
            setProcessorUpdates((prev) => [...prev, updateMessage]);
          });

          notification.info({
            message: "Safe tools auto-executed",
            description: `${autoExecutedResults.length} safe tools have been automatically executed`,
            placement: "bottomRight",
            duration: 3,
          });
        }

        // 设置需要审批的工具
        if (dangerousCalls.length > 0) {
          setToolCalls(dangerousCalls);

          if (onComplete) {
            onComplete(
              {
                role: "assistant",
                content:
                  finalContent ||
                  "Tool calls detected, waiting for user approval",
                processorUpdates: processorUpdatesRef.current,
              },
              undefined,
              approvalMessages.length > 0 ? approvalMessages : undefined
            );
          }
          return;
        }
      } catch (error) {
        console.error(
          "[UnifiedMessageCard] Error processing tool calls:",
          error
        );
        const errorMessage = `❌ Tool processing error: ${error}`;
        processorUpdatesRef.current.push(errorMessage);
        setProcessorUpdates((prev) => [...prev, errorMessage]);
      }
    }

    // 完成消息
    if (onComplete) {
      onComplete(
        {
          role: "assistant",
          content: finalContent || "Message interrupted",
          processorUpdates: processorUpdatesRef.current,
        },
        undefined,
        approvalMessages.length > 0 ? approvalMessages : undefined
      );
    }
  };

  // 判断工具是否危险
  const isDangerousTool = (toolName: string): boolean => {
    const dangerousTools = [
      "create_file",
      "update_file",
      "delete_file",
      "append_file",
      "execute_command",
    ];
    return dangerousTools.includes(toolName);
  };

  // 流式消息处理 effect
  useEffect(() => {
    if (!isStreaming || !channel) return;

    console.log("[UnifiedMessageCard] Setting up streaming channel listener");
    startTimeRef.current = Date.now();
    isMountedRef.current = true;

    // 最小等待时间
    const minTimeTimer = setTimeout(() => {
      console.log("[UnifiedMessageCard] Minimum wait time elapsed (2s)");
      minTimeElapsedRef.current = true;
    }, 2000);

    const messageHandler = (rawText: string) => {
      if (rawText.startsWith("data:")) {
        rawText = rawText.substring(5);
      }
      receivedMessagesCount.current += 1;

      // 检测独立工具调用消息
      if (
        rawText.trim().startsWith("{") &&
        (rawText.includes('"use_tool"') ||
          rawText.includes('"tool_name"') ||
          rawText.includes('"execute_command"'))
      ) {
        console.log(
          "[UnifiedMessageCard] Detected potential tool call in raw message:",
          rawText
        );
        try {
          const parsedJson = JSON.parse(rawText.trim());

          if (parsedJson.use_tool === true || parsedJson.tool_name) {
            console.log(
              "[UnifiedMessageCard] Detected direct tool call JSON:",
              parsedJson
            );

            const toolCall: ToolCall = {
              tool_type: parsedJson.tool_type || "local",
              tool_name:
                parsedJson.tool_name ||
                (parsedJson.parameters?.command
                  ? "execute_command"
                  : "unknown"),
              parameters: parsedJson.parameters || {},
              requires_approval:
                typeof parsedJson.requires_approval === "boolean"
                  ? parsedJson.requires_approval
                  : isDangerousTool(parsedJson.tool_name),
            };

            setToolCalls([toolCall]);
            fullTextRef.current = rawText.trim();
            setStreamingContent(fullTextRef.current);
            completeMessage(fullTextRef.current);
            return;
          }
        } catch (error) {
          console.error(
            "[UnifiedMessageCard] Error parsing potential tool call:",
            error
          );
        }
      }

      // 检测结束标记
      if (rawText.trim() === "[DONE]") {
        if (fullTextRef.current) {
          completeMessage(fullTextRef.current);
        } else {
          completeMessage("Message interrupted - No content received");
        }
        return;
      }

      try {
        const response = JSON.parse(rawText);

        // 处理器更新
        if (
          response.type === "processor_update" &&
          response.source &&
          response.content
        ) {
          console.log(
            "[UnifiedMessageCard] Received processor update:",
            response
          );
          const processorMessage = `[Processor: ${response.source}] ${response.content}`;
          setProcessorUpdates((prevUpdates) => [
            ...prevUpdates,
            processorMessage,
          ]);
          processorUpdatesRef.current.push(processorMessage);
          return;
        }

        // 错误处理
        if (response.error) {
          console.error(
            "[UnifiedMessageCard] Error in response:",
            response.error
          );
          completeMessage(`Error: ${JSON.stringify(response.error)}`);
          return;
        }

        // 处理流式响应
        if (response.choices && response.choices.length > 0) {
          const choice = response.choices[0];

          if (choice.finish_reason === "stop") {
            console.log("[UnifiedMessageCard] Received finish_reason=stop");
            completeMessage(fullTextRef.current);
            return;
          }

          if (choice.delta && typeof choice.delta.content !== "undefined") {
            let newContent = "";

            if (choice.delta.content === null) {
              console.log("[UnifiedMessageCard] Received null content");
              return;
            }

            if (typeof choice.delta.content === "string") {
              newContent = choice.delta.content;
            } else {
              try {
                newContent = String(choice.delta.content);
              } catch (e) {
                console.error(
                  "[UnifiedMessageCard] Could not convert delta content to string:",
                  e
                );
                return;
              }
            }

            if (newContent) {
              console.log(
                `[UnifiedMessageCard] Adding ${newContent.length} chars to content`
              );
              fullTextRef.current += newContent;
              setStreamingContent(fullTextRef.current);
            }
          }
        }
      } catch (error) {
        console.error(
          "[UnifiedMessageCard] Error parsing streaming response:",
          error
        );

        if (!rawText || rawText.trim() === "" || rawText.trim() === "[DONE]") {
          return;
        }

        // 尝试提取内容
        if (typeof rawText === "string" && rawText.trim()) {
          if (rawText.includes('"content"')) {
            try {
              const contentMatch = /"content"\s*:\s*"([^"]*)"/.exec(rawText);
              if (contentMatch && contentMatch[1]) {
                fullTextRef.current += contentMatch[1];
                setStreamingContent(fullTextRef.current);
                return;
              }
            } catch (e) {
              console.error(
                "[UnifiedMessageCard] Failed to extract content from partial JSON:",
                e
              );
            }
          }

          console.log("[UnifiedMessageCard] Adding raw text as fallback");
          fullTextRef.current += rawText + "\n";
          setStreamingContent(fullTextRef.current);
        }
      }
    };

    channel.onmessage = messageHandler;

    // 响应超时
    const responseTimeoutId = setTimeout(() => {
      if (
        receivedMessagesCount.current === 0 &&
        !hasCompletedRef.current &&
        isMountedRef.current
      ) {
        console.error(
          "[UnifiedMessageCard] No responses received after 30 seconds"
        );
        completeMessage(
          "Message interrupted - No response received after 30 seconds"
        );
      }
    }, 30000);

    return () => {
      isMountedRef.current = false;
      clearTimeout(responseTimeoutId);
      clearTimeout(minTimeTimer);

      if (!minTimeElapsedRef.current && !hasCompletedRef.current) {
        console.log(
          "[UnifiedMessageCard] Component unmounting too early, waiting for response"
        );
        return;
      }

      if (!isStreamingComplete && !hasCompletedRef.current) {
        if (fullTextRef.current) {
          console.log(
            "[UnifiedMessageCard] Forced completion on unmount with accumulated content"
          );
          const finalContent = fullTextRef.current;
          if (onComplete) {
            onComplete({
              role: "assistant",
              content: finalContent,
              processorUpdates: processorUpdatesRef.current,
            });
          }
        } else {
          if (onComplete) {
            onComplete({
              role: "assistant",
              content:
                "Message interrupted - Component unmounted before receiving content",
              processorUpdates: processorUpdatesRef.current,
            });
          }
        }
      }
    };
  }, [isStreaming, channel, onComplete, isStreamingComplete]);

  // 工具批准处理
  const handleToolApprove = async (toolCall: ToolCall) => {
    console.log("[UnifiedMessageCard] Tool approved:", toolCall);

    // 静态消息：更新工具状态
    if (!isStreaming && message.id && onMessageUpdate) {
      const currentStatus = message?.toolExecutionStatus || {};
      onMessageUpdate(message.id, {
        toolExecutionStatus: {
          ...currentStatus,
          [toolCall.tool_name]: "approved",
        },
      });
    }

    try {
      // 创建用户批准消息
      const userApprovalMessage: Message = {
        role: "user",
        content: `✅ Approved tool execution: ${toolCall.tool_name}`,
        id: crypto.randomUUID(),
        isToolResult: false,
      };

      // 执行工具
      const results = await messageProcessor.executeApprovedTools([toolCall]);
      const toolResult = results[0] || {
        success: false,
        error: "Tool execution failed",
        toolName: toolCall.tool_name,
      };

      // 创建工具结果消息
      const toolResultMessage: Message = {
        role: "assistant",
        content: toolResult.success
          ? `✅ Tool executed successfully: ${toolCall.tool_name}\n\n\`\`\`\n${toolResult.result}\n\`\`\``
          : `❌ Tool execution failed: ${toolCall.tool_name}\n\nError:\n\`\`\`\n${toolResult.error}\n\`\`\``,
        id: crypto.randomUUID(),
        isToolResult: true,
      };

      // 显示成功通知
      notification.success({
        message: "Tool approved and executed",
        description: `${toolCall.tool_name} executed ${
          toolResult.success ? "successfully" : "with failure"
        }`,
        placement: "bottomRight",
        duration: 3,
      });

      // 静态消息：更新执行状态
      if (!isStreaming && message.id && onMessageUpdate) {
        const currentStatus = message?.toolExecutionStatus || {};
        onMessageUpdate(message.id, {
          toolExecutionStatus: {
            ...currentStatus,
            [toolCall.tool_name]: "executed",
          },
        });
      }

      // 调用回调
      const approvalMessages: ToolApprovalMessages[] = [
        {
          userApproval: userApprovalMessage,
          toolResult: toolResultMessage,
        },
      ];

      if (isStreaming && onComplete) {
        onComplete(
          {
            role: "assistant",
            content: fullTextRef.current || "Tool call processing completed",
            processorUpdates: processorUpdatesRef.current,
          },
          undefined,
          approvalMessages
        );
      } else if (onToolExecuted) {
        onToolExecuted(approvalMessages);
      }
    } catch (error) {
      console.error(
        "[UnifiedMessageCard] Error executing approved tool:",
        error
      );

      // 创建错误消息
      const userApprovalMessage: Message = {
        role: "user",
        content: `✅ Approved tool execution: ${toolCall.tool_name}`,
        id: crypto.randomUUID(),
        isToolResult: false,
      };

      const errorMessage: Message = {
        role: "assistant",
        content: `❌ Tool execution failed: ${
          toolCall.tool_name
        }\n\nError:\n\`\`\`\n${
          error instanceof Error ? error.message : String(error)
        }\n\`\`\``,
        id: crypto.randomUUID(),
        isToolResult: true,
      };

      notification.error({
        message: "Tool execution failed",
        description: `${toolCall.tool_name} encountered an error during execution`,
        placement: "bottomRight",
        duration: 5,
      });

      const approvalMessages: ToolApprovalMessages[] = [
        {
          userApproval: userApprovalMessage,
          toolResult: errorMessage,
        },
      ];

      if (isStreaming && onComplete) {
        onComplete(
          {
            role: "assistant",
            content: fullTextRef.current || "Tool call processing completed",
            processorUpdates: processorUpdatesRef.current,
          },
          undefined,
          approvalMessages
        );
      } else if (onToolExecuted) {
        onToolExecuted(approvalMessages);
      }
    }
  };

  // 工具拒绝处理
  const handleToolReject = (toolCall: ToolCall) => {
    console.log("[UnifiedMessageCard] Tool rejected:", toolCall);

    // 静态消息：更新工具状态
    if (!isStreaming && message.id && onMessageUpdate) {
      const currentStatus = message?.toolExecutionStatus || {};
      onMessageUpdate(message.id, {
        toolExecutionStatus: {
          ...currentStatus,
          [toolCall.tool_name]: "rejected",
        },
      });
    }

    // 创建拒绝消息
    if (onToolExecuted) {
      const userRejectionMessage: Message = {
        role: "user",
        content: `❌ Rejected tool execution: ${toolCall.tool_name}`,
        id: crypto.randomUUID(),
        isToolResult: false,
      };

      const assistantResponseMessage: Message = {
        role: "assistant",
        content: `Tool execution was rejected. You can choose to modify the request or try a different approach.`,
        id: crypto.randomUUID(),
        isToolResult: false,
      };

      const approvalMessages: ToolApprovalMessages[] = [
        {
          userApproval: userRejectionMessage,
          toolResult: assistantResponseMessage,
        },
      ];

      onToolExecuted(approvalMessages);
    }

    notification.info({
      message: "Tool rejected",
      description: `Rejected execution of: ${toolCall.tool_name}`,
      placement: "bottomRight",
      duration: 3,
    });
  };

  // 添加到收藏夹
  const addMessageToFavorites = () => {
    if (
      currentChatId &&
      (message.role === "user" || message.role === "assistant")
    ) {
      if (selectedText) {
        addSelectedToFavorites();
      } else {
        addFavorite({
          chatId: currentChatId,
          content: currentContent,
          role: message.role,
          messageId: message.id,
        });
      }
    }
  };

  // 添加选中内容到收藏夹
  const addSelectedToFavorites = () => {
    if (
      currentChatId &&
      selectedText &&
      (message.role === "user" || message.role === "assistant")
    ) {
      addFavorite({
        chatId: currentChatId,
        content: selectedText,
        role: message.role,
        messageId: message.id,
      });
      setSelectedText("");
    }
  };

  // 处理文本选择
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

  // 复制到剪贴板
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
      const referenceText = createReference(currentContent);
      const event = new CustomEvent("reference-text", {
        detail: { text: referenceText, chatId: currentChatId },
      });
      window.dispatchEvent(event);
    }
  };

  // 右键菜单项
  const contextMenuItems = [
    {
      key: "copy",
      label: "Copy",
      icon: <CopyOutlined />,
      onClick: () => {
        if (selectedText) {
          copyToClipboard(selectedText);
        } else {
          copyToClipboard(currentContent);
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

  // 判断背景颜色
  const getBackgroundColor = () => {
    if (isStreaming) {
      return isStreamingComplete
        ? token.colorBgContainer
        : token.colorBgElevated;
    }

    if (message.isToolResult) {
      return currentContent.includes("✅")
        ? token.colorSuccessBg
        : token.colorErrorBg;
    }

    return message.role === "user"
      ? token.colorPrimaryBg
      : message.role === "assistant"
      ? token.colorBgLayout
      : token.colorBgContainer;
  };

  // 判断边框颜色
  const getBorderColor = () => {
    if (message.isToolResult) {
      return currentContent.includes("✅")
        ? token.colorSuccessBorder
        : token.colorErrorBorder;
    }
    return undefined;
  };

  return (
    <div onContextMenu={(e) => handleMouseUp(e)} style={{ width: "100%" }}>
      <Dropdown menu={{ items: contextMenuItems }} trigger={["contextMenu"]}>
        <Card
          id={message.id ? `message-${message.id}` : undefined}
          ref={cardRef}
          style={{
            width: "100%",
            minWidth: "100%",
            maxWidth: "800px",
            margin: "0 auto",
            background: getBackgroundColor(),
            border: getBorderColor()
              ? `1px solid ${getBorderColor()}`
              : undefined,
            borderRadius: isStreaming
              ? token.borderRadius
              : token.borderRadiusLG,
            boxShadow: token.boxShadow,
            position: "relative",
            wordWrap: "break-word",
            overflowWrap: "break-word",
            padding: isStreaming ? token.padding : undefined,
            paddingBottom:
              currentProcessorUpdates.length > 0 ? token.paddingLG : undefined,
            transition: "all 0.3s ease",
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
              {message.role === "user"
                ? "You"
                : message.role === "assistant"
                ? "Assistant"
                : message.role}
            </Text>

            {/* 工具调用显示 */}
            {message.role === "assistant" && pendingToolCalls.length > 0 && (
              <ToolCallsSection
                toolCalls={pendingToolCalls}
                onApprove={handleToolApprove}
                onReject={handleToolReject}
              />
            )}

            {/* 内容显示（如果没有待处理工具调用或非助手消息） */}
            {!(message.role === "assistant" && pendingToolCalls.length > 0) && (
              <div>
                <MarkdownRenderer
                  content={currentContent || " "}
                  role={message.role}
                  enableBreaks={message.role === "user"}
                />
                {isStreaming && !isStreamingComplete && <TypingIndicator />}
              </div>
            )}

            {children}

            {/* 操作按钮 */}
            {!isStreaming && (
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
                    onClick={() => copyToClipboard(currentContent)}
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
            )}
          </Space>
        </Card>
      </Dropdown>

      {/* Processor 更新显示 */}
      <ProcessorUpdatesSection
        processorUpdates={currentProcessorUpdates}
        position={isStreaming ? "absolute" : undefined}
      />
    </div>
  );
};

export default UnifiedMessageCard;

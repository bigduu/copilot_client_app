import React, { useEffect, useRef, useState } from "react";
import { theme, notification } from "antd";
import { Channel } from "@tauri-apps/api/core";
import { Message, ToolApprovalMessages } from "../../../types/chat";
import { ToolCall, toolParser } from "../../../utils/toolParser";
import {
  ToolExecutionResult,
  ToolExecutionWithMessage,
  messageProcessor,
} from "../../../services/MessageProcessor";
import MarkdownRenderer from "../shared/MarkdownRenderer";
import ToolCallsSection from "../shared/ToolCallsSection";
import ProcessorUpdatesSection from "../shared/ProcessorUpdatesSection";
import TypingIndicator from "../shared/TypingIndicator";

const { useToken } = theme;

interface StreamingMessageItemProps {
  channel: Channel<string>;
  onComplete: (
    finalMessage: Message,
    toolExecutionResults?: ToolExecutionResult[],
    approvalMessages?: ToolApprovalMessages[]
  ) => void;
}

const StreamingMessageItem: React.FC<StreamingMessageItemProps> = ({
  channel,
  onComplete,
}) => {
  const [content, setContent] = useState("");
  const [processorUpdates, setProcessorUpdates] = useState<string[]>([]);
  const [isComplete, setIsComplete] = useState(false);
  const [toolCalls, setToolCalls] = useState<ToolCall[]>([]);
  const hasCompletedRef = useRef(false);
  const fullTextRef = useRef("");
  const processorUpdatesRef = useRef<string[]>([]);
  const receivedMessagesCount = useRef(0);
  const startTimeRef = useRef(Date.now());
  const isMountedRef = useRef(true);
  const minTimeElapsedRef = useRef(false);
  const { token } = useToken();

  // Complete message and process tool calls
  const completeMessage = async (finalContent: string) => {
    if (hasCompletedRef.current) {
      console.log(
        "[StreamingMessageItem] Already completed, skipping duplicate completion"
      );
      return;
    }

    // If component was unmounted, don't call callbacks
    if (!isMountedRef.current) {
      console.log(
        "[StreamingMessageItem] Not completing message - component unmounted"
      );
      return;
    }

    hasCompletedRef.current = true;
    setIsComplete(true);

    // 检查是否有工具调用并处理
    const detectedToolCalls =
      toolParser.parseToolCallsFromContent(finalContent);
    setToolCalls(detectedToolCalls);

    let approvalMessages: ToolApprovalMessages[] = [];

    if (detectedToolCalls.length > 0) {
      console.log(
        `[StreamingMessageItem] Detected ${detectedToolCalls.length} tool calls in response`
      );

      try {
        // 分类工具调用
        const safeCalls = detectedToolCalls.filter(
          (call) => !call.requires_approval
        );
        const dangerousCalls = detectedToolCalls.filter(
          (call) => call.requires_approval
        );

        console.log(
          `[StreamingMessageItem] ${safeCalls.length} safe tools, ${dangerousCalls.length} require approval`
        );

        // 自动执行安全工具并生成消息对
        if (safeCalls.length > 0) {
          const autoExecutedWithMessages =
            await messageProcessor.executeAutoApprovedToolsWithMessages(
              safeCalls
            );

          // 将自动执行的结果转换为消息对
          autoExecutedWithMessages.forEach(
            (execResult: ToolExecutionWithMessage) => {
              const userApprovalMessage: Message = {
                role: "user",
                content: execResult.userMessage,
                id: crypto.randomUUID(),
                isToolResult: false,
              };

              const toolResultMessage: Message = {
                role: "assistant",
                content: execResult.toolResult.success
                  ? `✅ 工具执行成功: ${execResult.toolResult.toolName}\n\n${execResult.toolResult.result}`
                  : `❌ 工具执行失败: ${execResult.toolResult.toolName}\n\n错误: ${execResult.toolResult.error}`,
                id: crypto.randomUUID(),
                isToolResult: true,
              };

              approvalMessages.push({
                userApproval: userApprovalMessage,
                toolResult: toolResultMessage,
              });
            }
          );

          notification.info({
            message: "工具自动执行完成",
            description: `${autoExecutedWithMessages.length} 个安全工具已自动执行`,
            placement: "bottomRight",
            duration: 3,
          });
        }

        // 设置需要审批的工具调用以供用户决策
        if (dangerousCalls.length > 0) {
          setToolCalls(dangerousCalls);

          // 如果有需要审批的工具，先完成当前消息但不传递批准消息
          onComplete(
            {
              role: "assistant",
              content: finalContent || "检测到工具调用，等待用户批准",
              processorUpdates: processorUpdatesRef.current,
            },
            undefined, // 没有自动执行的工具结果传递给旧接口
            approvalMessages.length > 0 ? approvalMessages : undefined // 自动执行的消息对
          );
          return;
        }
      } catch (error) {
        console.error(
          "[StreamingMessageItem] Error processing tool calls:",
          error
        );
        const errorMessage = `❌ 工具处理错误: ${error}`;
        processorUpdatesRef.current.push(errorMessage);
        setProcessorUpdates((prev) => [...prev, errorMessage]);
      }
    }

    // 完成消息，传递自动执行的批准消息
    onComplete(
      {
        role: "assistant",
        content: finalContent || "Message interrupted",
        processorUpdates: processorUpdatesRef.current,
      },
      undefined, // 不再使用旧的 toolExecutionResults 接口
      approvalMessages.length > 0 ? approvalMessages : undefined
    );
  };

  // Helper function to determine if a tool is dangerous
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

  useEffect(() => {
    console.log(
      "[StreamingMessageItem] Component mounted, setting up channel listener"
    );
    startTimeRef.current = Date.now();
    isMountedRef.current = true;

    // Set minimum time to wait before allowing component to complete
    // This prevents early unmounting
    const minTimeTimer = setTimeout(() => {
      console.log("[StreamingMessageItem] Minimum wait time elapsed (2s)");
      minTimeElapsedRef.current = true;
    }, 2000);

    const messageHandler = (rawText: string) => {
      if (rawText.startsWith("data:")) {
        rawText = rawText.substring(5);
      }
      receivedMessagesCount.current += 1;

      // Check if this is a standalone tool call message
      if (
        rawText.trim().startsWith("{") &&
        (rawText.includes('"use_tool"') ||
          rawText.includes('"tool_name"') ||
          rawText.includes('"execute_command"'))
      ) {
        console.log(
          "[StreamingMessageItem] Detected potential tool call in raw message:",
          rawText
        );
        try {
          // Try to parse it as JSON first
          const parsedJson = JSON.parse(rawText.trim());

          // Check if this is a tool call format
          if (parsedJson.use_tool === true || parsedJson.tool_name) {
            console.log(
              "[StreamingMessageItem] Detected direct tool call JSON:",
              parsedJson
            );

            // Create a tool call object
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

            // Set the tool call for display
            setToolCalls([toolCall]);

            // Also add the raw JSON to the content for processing
            fullTextRef.current = rawText.trim();
            setContent(fullTextRef.current);

            // Mark streaming as complete
            completeMessage(fullTextRef.current);
            return;
          }
        } catch (error) {
          console.error(
            "[StreamingMessageItem] Error parsing potential tool call:",
            error
          );
          // Continue with normal processing if parsing fails
        }
      }

      // Check if this is the "[DONE]" marker that indicates the end of streaming
      if (rawText.trim() === "[DONE]") {
        if (fullTextRef.current) {
          completeMessage(fullTextRef.current);
        } else {
          completeMessage("Message interrupted - No content received");
        }
        return;
      }

      try {
        // Parse the JSON string
        const response = JSON.parse(rawText);

        console.log("[StreamingMessageItem] Response:", response);

        // Check for processor updates
        if (
          response.type === "processor_update" &&
          response.source &&
          response.content
        ) {
          console.log(
            "[StreamingMessageItem] Received processor update:",
            response
          );
          const processorMessage = `[Processor: ${response.source}] ${response.content}`;
          // Add to processorUpdates state for live rendering
          setProcessorUpdates((prevUpdates) => [
            ...prevUpdates,
            processorMessage,
          ]);
          // Also add to ref for onComplete
          processorUpdatesRef.current.push(processorMessage);
          return;
        }

        // Check for error fields in the response
        if (response.error) {
          console.error(
            "[StreamingMessageItem] Error in response:",
            response.error
          );
          completeMessage(`Error: ${JSON.stringify(response.error)}`);
          return;
        }

        // Check if this is a valid response with choices
        if (response.choices && response.choices.length > 0) {
          const choice = response.choices[0];
          // Check if this is the final message with stop reason
          if (choice.finish_reason === "stop") {
            console.log("[StreamingMessageItem] Received finish_reason=stop");
            completeMessage(fullTextRef.current);
            return;
          }

          // For regular streaming updates with content
          if (choice.delta && typeof choice.delta.content !== "undefined") {
            let newContent = "";

            // Handle both string content and null content (end of message marker)
            if (choice.delta.content === null) {
              console.log("[StreamingMessageItem] Received null content");
              return;
            }

            if (typeof choice.delta.content === "string") {
              newContent = choice.delta.content;
            } else {
              try {
                newContent = String(choice.delta.content);
              } catch (e) {
                console.error(
                  "[StreamingMessageItem] Could not convert delta content to string:",
                  e
                );
                return;
              }
            }

            if (newContent) {
              console.log(
                `[StreamingMessageItem] Adding ${newContent.length} chars to content`
              );
              // Accumulate content
              fullTextRef.current += newContent;
              setContent(fullTextRef.current);
            }
          } else if (choice.delta) {
            console.log(
              "[StreamingMessageItem] Delta without content:",
              choice.delta
            );
          }
        }
      } catch (error) {
        console.error(
          "[StreamingMessageItem] Error parsing streaming response:",
          error
        );
        console.error(
          "[StreamingMessageItem] Raw text that caused error:",
          rawText
        );

        // Skip empty or obviously invalid responses
        if (!rawText || rawText.trim() === "" || rawText.trim() === "[DONE]") {
          return;
        }

        // Try to handle non-JSON responses gracefully by treating them as plain text
        if (typeof rawText === "string" && rawText.trim()) {
          // If it looks like it might be a partial JSON, try to extract content
          if (rawText.includes('"content"')) {
            try {
              const contentMatch = /"content"\s*:\s*"([^"]*)"/.exec(rawText);
              if (contentMatch && contentMatch[1]) {
                fullTextRef.current += contentMatch[1];
                setContent(fullTextRef.current);
                return;
              }
            } catch (e) {
              console.error(
                "[StreamingMessageItem] Failed to extract content from partial JSON:",
                e
              );
            }
          }

          // As a fallback, just add the raw text
          console.log("[StreamingMessageItem] Adding raw text as fallback");
          fullTextRef.current += rawText + "\n";
          setContent(fullTextRef.current);
        }
      }
    };

    // Set the message handler
    channel.onmessage = messageHandler;

    // Set a timeout to detect if we aren't getting any responses
    const responseTimeoutId = setTimeout(() => {
      if (
        receivedMessagesCount.current === 0 &&
        !hasCompletedRef.current &&
        isMountedRef.current
      ) {
        console.error(
          "[StreamingMessageItem] No responses received after 0 seconds"
        );
        completeMessage(
          "Message interrupted - No response received after 0 seconds"
        );
      }
    }, 30000);

    return () => {
      // Mark component as unmounted
      isMountedRef.current = false;

      // Clean up the channel listener if the component unmounts
      clearTimeout(responseTimeoutId);
      clearTimeout(minTimeTimer);

      // Minimum delay to ensure component isn't unmounted too early
      if (!minTimeElapsedRef.current && !hasCompletedRef.current) {
        console.log(
          "[StreamingMessageItem] Component unmounting too early, waiting for response"
        );
        // Don't attempt to complete if the minimum time hasn't elapsed
        return;
      }

      // Ensure we notify the parent that streaming is complete if we're unmounting
      if (!isComplete && !hasCompletedRef.current) {
        if (fullTextRef.current) {
          console.log(
            "[StreamingMessageItem] Forced completion on unmount with accumulated content"
          );
          // Note: We need to copy the content before completing, as the ref may be cleared during the process
          const finalContent = fullTextRef.current;
          // We're calling onComplete directly rather than through completeMessage
          // since completeMessage won't run for unmounted components
          onComplete({
            role: "assistant",
            content: finalContent,
            processorUpdates: processorUpdatesRef.current,
          });
        } else {
          onComplete({
            role: "assistant",
            content:
              "Message interrupted - Component unmounted before receiving content",
            processorUpdates: processorUpdatesRef.current,
          });
        }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Add handlers for tool approval and rejection
  const handleToolApprove = async (toolCall: ToolCall) => {
    console.log("[StreamingMessageItem] Tool approved:", toolCall);

    try {
      // 1. 创建用户批准消息
      const userApprovalMessage: Message = {
        role: "user",
        content: `已批准执行工具: ${toolCall.tool_name}`,
        id: crypto.randomUUID(),
        isToolResult: false,
      };

      // 2. 执行工具
      let toolResult: ToolExecutionResult;

      if (typeof (window as any).__executeApprovedTool === "function") {
        toolResult = await (window as any).__executeApprovedTool(toolCall);
      } else {
        // 备用执行逻辑 - 调用 MessageProcessor
        const results = await messageProcessor.executeApprovedTools([toolCall]);
        toolResult = results[0] || {
          success: false,
          error: "工具执行失败",
          toolName: toolCall.tool_name,
        };
      }

      // 3. 创建工具结果消息
      const toolResultMessage: Message = {
        role: "assistant",
        content: toolResult.success
          ? `✅ 工具执行成功: ${toolCall.tool_name}\n\n${toolResult.result}`
          : `❌ 工具执行失败: ${toolCall.tool_name}\n\n错误: ${toolResult.error}`,
        id: crypto.randomUUID(),
        isToolResult: true,
      };

      // 4. 显示成功通知
      notification.success({
        message: "工具已批准并执行",
        description: `${toolCall.tool_name} 执行${
          toolResult.success ? "成功" : "失败"
        }`,
        placement: "bottomRight",
        duration: 3,
      });

      // 5. 通过 onComplete 传递批准消息对
      const approvalMessages: ToolApprovalMessages[] = [
        {
          userApproval: userApprovalMessage,
          toolResult: toolResultMessage,
        },
      ];

      // 调用 onComplete 传递当前消息和批准消息
      onComplete(
        {
          role: "assistant",
          content: fullTextRef.current || "工具调用处理完成",
          processorUpdates: processorUpdatesRef.current,
        },
        undefined, // 没有自动执行的工具结果
        approvalMessages // 批准后的消息对
      );
    } catch (error) {
      console.error(
        "[StreamingMessageItem] Error executing approved tool:",
        error
      );

      // 创建错误消息
      const userApprovalMessage: Message = {
        role: "user",
        content: `已批准执行工具: ${toolCall.tool_name}`,
        id: crypto.randomUUID(),
        isToolResult: false,
      };

      const errorMessage: Message = {
        role: "assistant",
        content: `❌ 工具执行失败: ${toolCall.tool_name}\n\n错误: ${
          error instanceof Error ? error.message : String(error)
        }`,
        id: crypto.randomUUID(),
        isToolResult: true,
      };

      notification.error({
        message: "工具执行失败",
        description: `${toolCall.tool_name} 执行时发生错误`,
        placement: "bottomRight",
        duration: 5,
      });

      // 传递错误消息对
      const approvalMessages: ToolApprovalMessages[] = [
        {
          userApproval: userApprovalMessage,
          toolResult: errorMessage,
        },
      ];

      onComplete(
        {
          role: "assistant",
          content: fullTextRef.current || "工具调用处理完成",
          processorUpdates: processorUpdatesRef.current,
        },
        undefined,
        approvalMessages
      );
    }
  };

  const handleToolReject = (toolCall: ToolCall) => {
    console.log("[StreamingMessageItem] Tool rejected:", toolCall);
    notification.info({
      message: "工具已拒绝",
      description: `已拒绝执行: ${toolCall.tool_name}`,
      placement: "bottomRight",
      duration: 3,
    });
  };

  return (
    <div
      style={{
        width: "100%",
        position: "relative",
        background: isComplete ? token.colorBgContainer : token.colorBgElevated,
        borderRadius: token.borderRadius,
        padding: token.padding,
        paddingBottom:
          processorUpdates.length > 0 ? token.paddingLG : token.padding,
        border: `1px solid ${token.colorBorder}`,
        transition: "all 0.3s ease",
      }}
    >
      <div>
        {/* Show ToolCallsSection if tool calls are detected, hide markdown content */}
        {toolCalls.length > 0 ? (
          <ToolCallsSection
            toolCalls={toolCalls}
            onApprove={handleToolApprove}
            onReject={handleToolReject}
          />
        ) : (
          <div>
            <MarkdownRenderer content={content || " "} role="assistant" />
            {!isComplete && <TypingIndicator />}
          </div>
        )}
      </div>
      {/* Processor updates display, shown below the main content or tool approval */}
      <ProcessorUpdatesSection
        processorUpdates={processorUpdates}
        position="absolute"
      />
    </div>
  );
};

export default StreamingMessageItem;

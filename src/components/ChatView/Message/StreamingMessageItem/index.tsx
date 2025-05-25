import React, { useEffect, useRef, useState } from "react";
import { theme, notification } from "antd";
import { Channel } from "@tauri-apps/api/core";
import MarkdownRenderer from "../shared/MarkdownRenderer";
import ToolCallsSection from "../shared/ToolCallsSection";
import ProcessorUpdatesSection from "../shared/ProcessorUpdatesSection";
import TypingIndicator from "../shared/TypingIndicator";
import { Message, ToolApprovalMessages } from "../../../../types/chat";
import {
  messageProcessor,
  ToolExecutionResult,
} from "../../../../services/MessageProcessor";
import { ToolCall, toolParser } from "../../../../utils/toolParser";

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

    // Check for tool calls and process them
    const detectedToolCalls =
      toolParser.parseToolCallsFromContent(finalContent);
    setToolCalls(detectedToolCalls);

    let approvalMessages: ToolApprovalMessages[] = [];

    if (detectedToolCalls.length > 0) {
      console.log(
        `[StreamingMessageItem] Detected ${detectedToolCalls.length} tool calls in response`
      );

      try {
        // Classify tool calls
        const safeCalls = detectedToolCalls.filter(
          (call) => !call.requires_approval
        );
        const dangerousCalls = detectedToolCalls.filter(
          (call) => call.requires_approval
        );

        console.log(
          `[StreamingMessageItem] ${safeCalls.length} safe tools, ${dangerousCalls.length} require approval`
        );

        // Auto-execute safe tools (no approval messages needed for safe tools)
        if (safeCalls.length > 0) {
          console.log(
            `[StreamingMessageItem] Auto-executing ${safeCalls.length} safe tools`
          );

          // Execute safe tools directly and update processor updates
          const autoExecutedResults =
            await messageProcessor.executeApprovedTools(safeCalls);

          // Add execution results to processor updates instead of creating fake approval messages
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

        // Set tool calls that require approval for user decision
        if (dangerousCalls.length > 0) {
          setToolCalls(dangerousCalls);

          // If there are tools requiring approval, complete current message but don't pass approval messages
          onComplete(
            {
              role: "assistant",
              content:
                finalContent ||
                "Tool calls detected, waiting for user approval",
              processorUpdates: processorUpdatesRef.current,
            },
            undefined, // No auto-executed tool results passed to old interface
            approvalMessages.length > 0 ? approvalMessages : undefined // Auto-executed message pairs
          );
          return;
        }
      } catch (error) {
        console.error(
          "[StreamingMessageItem] Error processing tool calls:",
          error
        );
        const errorMessage = `❌ Tool processing error: ${error}`;
        processorUpdatesRef.current.push(errorMessage);
        setProcessorUpdates((prev) => [...prev, errorMessage]);
      }
    }

    // Complete message, pass auto-executed approval messages
    onComplete(
      {
        role: "assistant",
        content: finalContent || "Message interrupted",
        processorUpdates: processorUpdatesRef.current,
      },
      undefined, // No longer using old toolExecutionResults interface
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
      // 1. Create user approval message
      const userApprovalMessage: Message = {
        role: "user",
        content: `Approved tool execution: ${toolCall.tool_name}`,
        id: crypto.randomUUID(),
        isToolResult: false,
      };

      // 2. Execute tool
      let toolResult: ToolExecutionResult;

      if (typeof (window as any).__executeApprovedTool === "function") {
        toolResult = await (window as any).__executeApprovedTool(toolCall);
      } else {
        // Fallback execution logic - call MessageProcessor
        const results = await messageProcessor.executeApprovedTools([toolCall]);
        toolResult = results[0] || {
          success: false,
          error: "Tool execution failed",
          toolName: toolCall.tool_name,
        };
      }

      // 3. Create tool result message
      const toolResultMessage: Message = {
        role: "assistant",
        content: toolResult.success
          ? `✅ Tool executed successfully: ${toolCall.tool_name}\n\n${toolResult.result}`
          : `❌ Tool execution failed: ${toolCall.tool_name}\n\nError: ${toolResult.error}`,
        id: crypto.randomUUID(),
        isToolResult: true,
      };

      // 4. Show success notification
      notification.success({
        message: "Tool approved and executed",
        description: `${toolCall.tool_name} executed ${
          toolResult.success ? "successfully" : "with failure"
        }`,
        placement: "bottomRight",
        duration: 3,
      });

      // 5. Pass approval message pair through onComplete
      const approvalMessages: ToolApprovalMessages[] = [
        {
          userApproval: userApprovalMessage,
          toolResult: toolResultMessage,
        },
      ];

      // Call onComplete to pass current message and approval messages
      onComplete(
        {
          role: "assistant",
          content: fullTextRef.current || "Tool call processing completed",
          processorUpdates: processorUpdatesRef.current,
        },
        undefined, // No auto-executed tool results
        approvalMessages // Approved message pairs
      );
    } catch (error) {
      console.error(
        "[StreamingMessageItem] Error executing approved tool:",
        error
      );

      // Create error messages
      const userApprovalMessage: Message = {
        role: "user",
        content: `Approved tool execution: ${toolCall.tool_name}`,
        id: crypto.randomUUID(),
        isToolResult: false,
      };

      const errorMessage: Message = {
        role: "assistant",
        content: `❌ Tool execution failed: ${toolCall.tool_name}\n\nError: ${
          error instanceof Error ? error.message : String(error)
        }`,
        id: crypto.randomUUID(),
        isToolResult: true,
      };

      notification.error({
        message: "Tool execution failed",
        description: `${toolCall.tool_name} encountered an error during execution`,
        placement: "bottomRight",
        duration: 5,
      });

      // Pass error message pair
      const approvalMessages: ToolApprovalMessages[] = [
        {
          userApproval: userApprovalMessage,
          toolResult: errorMessage,
        },
      ];

      onComplete(
        {
          role: "assistant",
          content: fullTextRef.current || "Tool call processing completed",
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
      message: "Tool rejected",
      description: `Rejected execution of: ${toolCall.tool_name}`,
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

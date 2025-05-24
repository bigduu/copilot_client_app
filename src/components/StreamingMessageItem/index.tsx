import React, { useEffect, useRef, useState } from "react";
import { theme, Typography, Collapse, notification } from "antd";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { Channel } from "@tauri-apps/api/core";
import { Message } from "../../types/chat";
import { ToolCall, toolParser } from "../../utils/toolParser";
import { ToolExecutionResult } from "../../services/MessageProcessor";
import ToolApprovalCard from "../ToolApprovalCard";

const { Text } = Typography;
const { useToken } = theme;

// Typing indicator component
const TypingIndicator: React.FC = () => {
  const { token } = useToken();
  return (
    <div
      style={{
        display: "flex",
        gap: token.marginXXS,
        padding: token.paddingXXS,
        alignItems: "center",
      }}
    >
      {[1, 2, 3].map((i) => (
        <span
          key={i}
          style={{
            width: 4,
            height: 4,
            borderRadius: "50%",
            background: token.colorTextSecondary,
            opacity: 0.6,
            animation: `typing-dot ${0.8 + i * 0.2}s infinite ease-in-out`,
          }}
        />
      ))}
    </div>
  );
};

interface StreamingMessageItemProps {
  channel: Channel<string>;
  onComplete: (finalMessage: Message) => void;
}

const StreamingMessageItem: React.FC<StreamingMessageItemProps> = ({
  channel,
  onComplete,
}) => {
  const [content, setContent] = useState("");
  const [processorUpdates, setProcessorUpdates] = useState<string[]>([]);
  const [showProcessorUpdates, setShowProcessorUpdates] = useState(false);
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

  // Define markdown components for syntax highlighting and other formatting
  const markdownComponents = {
    code({ node, inline, className, children, ...props }: any) {
      const match = /language-(\w+)/.exec(className || "");
      return !inline && match ? (
        <SyntaxHighlighter
          style={oneDark}
          language={match[1]}
          PreTag="div"
          {...props}
        >
          {String(children).replace(/\n$/, "")}
        </SyntaxHighlighter>
      ) : (
        <code className={className} {...props}>
          {children}
        </code>
      );
    },
  };

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

    if (detectedToolCalls.length > 0) {
      console.log(
        `[StreamingMessageItem] Detected ${detectedToolCalls.length} tool calls in response`
      );

      // 处理工具调用结果
      try {
        // 检查是否有response processor
        if (typeof (window as any).__currentResponseProcessor === "function") {
          console.log(
            "[StreamingMessageItem] Executing response processor for tool calls"
          );
          const results = await (window as any).__currentResponseProcessor(
            finalContent
          );

          if (results && results.length > 0) {
            // Add tool execution results directly to content instead of just to processorUpdates
            let enhancedContent = finalContent;

            // Format tool execution results and add them to content
            const toolResultsText = results
              .map((result: ToolExecutionResult) => {
                const resultText = result.success
                  ? `\n\n**工具执行结果 (${result.toolName}):**\n\`\`\`\n${result.result}\n\`\`\``
                  : `\n\n**工具执行失败 (${result.toolName}):**\n\`\`\`\n${result.error}\n\`\`\``;

                // Also add to processor updates for tracking purposes
                const resultMessage = result.success
                  ? `✅ 工具执行成功: ${result.toolName} - ${result.result}`
                  : `❌ 工具执行失败: ${result.toolName} - ${result.error}`;

                processorUpdatesRef.current.push(resultMessage);
                setProcessorUpdates((prev) => [...prev, resultMessage]);

                return resultText;
              })
              .join("\n");

            // Append the tool results to the content
            enhancedContent += toolResultsText;

            // If there are tool execution results, complete the message with the enhanced content
            onComplete({
              role: "assistant",
              content: enhancedContent || "Message interrupted",
              processorUpdates: processorUpdatesRef.current,
            });

            // If tool results were added, show notification but return to avoid calling onComplete again
            if (results.length > 0) {
              notification.info({
                message: "工具执行完成",
                description: `${results.length} 个工具已自动执行`,
                placement: "bottomRight",
                duration: 3,
              });
              return;
            }
          }
        }
      } catch (error) {
        console.error(
          "[StreamingMessageItem] Error processing tool calls:",
          error
        );
        processorUpdatesRef.current.push(`❌ 工具处理错误: ${error}`);
        setProcessorUpdates((prev) => [...prev, `❌ 工具处理错误: ${error}`]);
      }
    }

    // If we didn't return early after processing tools, complete with original content
    onComplete({
      role: "assistant",
      content: finalContent || "Message interrupted",
      processorUpdates: processorUpdatesRef.current,
    });
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
          // Inside the if (fullTextRef.current) block
          onComplete({
            role: "assistant",
            content: finalContent,
            processorUpdates: processorUpdatesRef.current,
          });
        } else {
          // And in the else block
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
  const handleToolApprove = (toolCall: ToolCall) => {
    console.log("[StreamingMessageItem] Tool approved:", toolCall);
    // Here you would implement the execution of the approved tool
    notification.success({
      message: "工具已批准",
      description: `已批准执行: ${toolCall.tool_name}`,
      placement: "bottomRight",
      duration: 3,
    });

    // Call your tool execution logic here
    if (typeof (window as any).__executeApprovedTool === "function") {
      (window as any).__executeApprovedTool(toolCall);
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

  // Replace the ToolCallDisplay component with this:
  const renderToolCalls = () => {
    if (toolCalls.length === 0) return null;

    return (
      <div style={{ marginTop: token.marginMD }}>
        <Collapse
          ghost
          defaultActiveKey={["1"]}
          style={{ background: "transparent", padding: 0 }}
        >
          <Collapse.Panel
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
          </Collapse.Panel>
        </Collapse>
      </div>
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
        {/* Show special UI for tool calls if detected */}
        {toolCalls.length > 0 ? (
          <div>
            <div
              style={{
                background: "#f6f8fa",
                border: "1px solid #e1e4e8",
                borderRadius: "8px",
                padding: "12px",
                marginBottom: "16px",
              }}
            >
              <div
                style={{
                  fontWeight: "bold",
                  marginBottom: "8px",
                  color: "#0969da",
                  display: "flex",
                  alignItems: "center",
                }}
              >
                <span style={{ marginRight: "8px" }}>🤖</span>
                <span>AI 请求执行工具</span>
              </div>
              {renderToolCalls()}
            </div>

            {/* Hide the raw JSON from view but keep it for processing */}
            <div style={{ display: "none" }}>
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={markdownComponents}
              >
                {content || " "}
              </ReactMarkdown>
            </div>
          </div>
        ) : (
          <div>
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={markdownComponents}
            >
              {content || " "}
            </ReactMarkdown>
            {!isComplete && <TypingIndicator />}
          </div>
        )}
      </div>
    </div>
  );
};

export default StreamingMessageItem;

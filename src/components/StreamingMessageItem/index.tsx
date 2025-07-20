import React, { useEffect, useRef, useState } from "react";
import { theme, Typography, Collapse } from "antd";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { Channel } from "@tauri-apps/api/core";
import { Message } from "../../types/chat";

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
  const hasCompletedRef = useRef(false);
  const fullTextRef = useRef("");
  const processorUpdatesRef = useRef<string[]>([]); // Add this line
  const receivedMessagesCount = useRef(0);
  const startTimeRef = useRef(Date.now());
  const isMountedRef = useRef(true);
  const minTimeElapsedRef = useRef(false);
  const { token } = useToken();

  // Complete message and prevent duplicate completions
  const completeMessage = (finalContent: string) => {
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

    const completedMessage = {
      role: "assistant" as const,
      content: finalContent || "Message interrupted",
      processorUpdates: processorUpdatesRef.current,
    };

    onComplete(completedMessage);
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

      // Check if this is the "[DONE]" marker that indicates the end of streaming
      if (rawText.trim() === "[DONE]") {
        if (fullTextRef.current) {
          completeMessage(fullTextRef.current);
        } else {
          completeMessage("Message interrupted - No content received");
        }
        return;
      }

      // Skip empty messages
      if (!rawText || rawText.trim() === "") {
        return;
      }

      // Split multiple JSON objects and process each one
      const jsonObjects = rawText.split(/(?<=})\s*(?={)/);

      for (const jsonStr of jsonObjects) {
        if (!jsonStr.trim()) continue;

        try {
          const response = JSON.parse(jsonStr);
          // Check for processor updates
          if (
            response.type === "processor_update" &&
            response.source &&
            response.content
          ) {
            const processorMessage = `[Processor: ${response.source}] ${response.content}`;
            // Add to processorUpdates state for live rendering
            setProcessorUpdates((prevUpdates) => [
              ...prevUpdates,
              processorMessage,
            ]);
            // Also add to ref for onComplete
            processorUpdatesRef.current.push(processorMessage);
          } else if (response.choices && response.choices.length > 0) {
            // Handle normal streaming response
            const choice = response.choices[0];

            // Check if this is the final message with stop reason
            if (choice.finish_reason === "stop") {
              completeMessage(fullTextRef.current);
              return;
            }

            // For regular streaming updates with content
            if (choice.delta && typeof choice.delta.content !== "undefined") {
              let newContent = "";

              // Handle both string content and null content (end of message marker)
              if (choice.delta.content === null) {
                continue;
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
                  continue;
                }
              }

              if (newContent) {
                // Accumulate content
                fullTextRef.current += newContent;
                setContent(fullTextRef.current);
              }
            }
          }
        } catch (parseError) {
          console.error(
            "[StreamingMessageItem] Failed to parse JSON:",
            parseError
          );
          console.error("[StreamingMessageItem] JSON string:", jsonStr);

          // Don't show raw JSON to user - just log the error
          console.warn(
            "[StreamingMessageItem] Skipping malformed JSON data:",
            jsonStr.substring(0, 100) + "..."
          );
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

  return (
    <div style={{ position: "relative" }}>
      <div style={{ display: "flex", flexDirection: "column" }}>
        {processorUpdates.length > 0 && (
          <Collapse
            ghost
            size="small"
            activeKey={showProcessorUpdates ? ["1"] : []}
            onChange={() => setShowProcessorUpdates(!showProcessorUpdates)}
            style={{ marginBottom: token.marginXS }}
          >
            <Collapse.Panel header="View Processing Steps" key="1">
              {processorUpdates.map((update, index) => (
                <Text
                  key={`proc-${index}`}
                  style={{
                    display: "block", // Ensure each update is on a new line
                    fontSize: "0.9em",
                    color: token.colorTextSecondary,
                    fontStyle: "italic",
                    whiteSpace: "pre-wrap",
                    paddingLeft: token.paddingSM, // Indent content within panel
                  }}
                >
                  {update}
                </Text>
              ))}
            </Collapse.Panel>
          </Collapse>
        )}
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            p: ({ children }) => (
              <Text style={{ marginBottom: token.marginSM, display: "block" }}>
                {children}
              </Text>
            ),
            ol: ({ children }) => (
              <ol style={{ marginBottom: token.marginSM, paddingLeft: 20 }}>
                {children}
              </ol>
            ),
            ul: ({ children }) => (
              <ul style={{ marginBottom: token.marginSM, paddingLeft: 20 }}>
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
          }}
        >
          {content || " "}
        </ReactMarkdown>

        {/* Add blinking cursor at the end, only show when streaming message is not complete */}
        {!isComplete && content && (
          <span
            className="blinking-cursor"
            style={{
              display: "inline-block",
              marginTop: "-1.2em", // Move up to the last line of text
              marginLeft: "0.2em", // Add some spacing
              color: token.colorText,
            }}
          />
        )}
      </div>
      {!isComplete && <TypingIndicator />}
    </div>
  );
};

export default StreamingMessageItem;

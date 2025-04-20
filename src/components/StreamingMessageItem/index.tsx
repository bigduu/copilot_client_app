import React, { useState, useEffect, useRef } from "react";
import { Card, Typography } from "antd";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { Channel } from "@tauri-apps/api/core";
import { Message } from "../../types/chat";
import "../ChatView/styles.css";

const { Text } = Typography;

// Typing indicator component
const TypingIndicator: React.FC = () => (
  <div className="typing-indicator">
    <div className="typing-dot" />
    <div className="typing-dot" />
    <div className="typing-dot" />
  </div>
);

interface StreamingMessageItemProps {
  channel: Channel<string>;
  onComplete: (finalMessage: Message) => void;
}

const StreamingMessageItem: React.FC<StreamingMessageItemProps> = ({
  channel,
  onComplete,
}) => {
  const [content, setContent] = useState("");
  const [isComplete, setIsComplete] = useState(false);
  const hasCompletedRef = useRef(false);
  const fullTextRef = useRef("");
  const receivedMessagesCount = useRef(0);
  const startTimeRef = useRef(Date.now());
  const isMountedRef = useRef(true);
  const minTimeElapsedRef = useRef(false);

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

    onComplete({
      role: "assistant",
      content: finalContent || "Message interrupted",
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
          "[StreamingMessageItem] No responses received after 10 seconds"
        );
        completeMessage(
          "Message interrupted - No response received after 10 seconds"
        );
      }
    }, 10000);

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
          });
        } else {
          onComplete({
            role: "assistant",
            content:
              "Message interrupted - Component unmounted before receiving content",
          });
        }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="message-container assistant streaming">
      <Text strong>Assistant {!isComplete && <TypingIndicator />}</Text>
      <Card size="small" className="message-card assistant streaming">
        {content ? (
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              p: ({ children }) => (
                <p className="markdown-paragraph">{children}</p>
              ),
              ol: ({ children }) => (
                <ol className="markdown-list">{children}</ol>
              ),
              ul: ({ children }) => (
                <ul className="markdown-list">{children}</ul>
              ),
              li: ({ children }) => (
                <li className="markdown-list-item">{children}</li>
              ),
              code({ className, children, ...props }) {
                const match = /language-(\w+)/.exec(className || "");
                const language = match ? match[1] : "";
                const isInline = !match && !className;

                if (isInline) {
                  return (
                    <code className={className} {...props}>
                      {children}
                    </code>
                  );
                }

                return (
                  <SyntaxHighlighter
                    style={oneDark}
                    language={language || "text"}
                    PreTag="div"
                    customStyle={{
                      margin: "0.5em 0",
                      borderRadius: "6px",
                      fontSize: "14px",
                    }}
                  >
                    {String(children).replace(/\n$/, "")}
                  </SyntaxHighlighter>
                );
              },
            }}
          >
            {content}
          </ReactMarkdown>
        ) : (
          <div className="placeholder-text">Generating response...</div>
        )}
      </Card>
    </div>
  );
};

export default StreamingMessageItem;

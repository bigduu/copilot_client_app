import React, { useRef, useEffect, useState, useCallback } from "react";
import { Input, theme } from "antd";
import { ToolService } from "../../services/ToolService";

const { TextArea } = Input;
const { useToken } = theme;

interface ToolHighlightedInputProps {
  value: string;
  onChange: (value: string) => void;
  onKeyDown?: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onPaste?: (event: React.ClipboardEvent<HTMLTextAreaElement>) => void;
  placeholder?: string;
  disabled?: boolean;
  autoSize?: { minRows: number; maxRows: number };
  variant?: string;
  style?: React.CSSProperties;
}

interface ToolMatch {
  start: number;
  end: number;
  toolName: string;
}

const ToolHighlightedInput: React.FC<ToolHighlightedInputProps> = ({
  value,
  onChange,
  onKeyDown,
  onPaste,
  placeholder,
  disabled,
  autoSize,
  variant,
  style,
}) => {
  const { token } = useToken();
  const textAreaRef = useRef<HTMLTextAreaElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const [availableTools, setAvailableTools] = useState<string[]>([]);
  const toolService = ToolService.getInstance();

  // Fetch available tools on component mount
  useEffect(() => {
    const fetchTools = async () => {
      try {
        const tools = await toolService.getAvailableTools();
        setAvailableTools(tools.map((tool) => tool.name));
      } catch (error) {
        console.error("Failed to fetch available tools:", error);
      }
    };

    fetchTools();
  }, [toolService]);

  // Helper function to check if a string is a valid tool name
  const isValidToolName = useCallback(
    (toolName: string): boolean => {
      return availableTools.includes(toolName);
    },
    [availableTools]
  );

  // Helper function to find tool names in text
  const findToolMatches = useCallback(
    (text: string): ToolMatch[] => {
      const toolMatches: ToolMatch[] = [];
      const regex = /\/(\w+)/g;
      let match;

      while ((match = regex.exec(text)) !== null) {
        const toolName = match[1];
        if (isValidToolName(toolName)) {
          toolMatches.push({
            start: match.index,
            end: match.index + match[0].length,
            toolName: toolName,
          });
        }
      }

      return toolMatches;
    },
    [isValidToolName]
  );

  // Enhanced keydown handler with smart backspace
  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // Handle smart deletion for tool names
      if (
        event.key === "Backspace" &&
        !event.ctrlKey &&
        !event.altKey &&
        !event.metaKey
      ) {
        const textarea = event.currentTarget;
        const cursorPosition = textarea.selectionStart;
        const text = textarea.value;

        // Find all tool names in the text
        const toolMatches = findToolMatches(text);

        // Check if cursor is at the end of a tool name
        for (const match of toolMatches) {
          if (cursorPosition === match.end) {
            // Cursor is at the end of a tool name, delete the entire tool name
            event.preventDefault();
            const newText =
              text.substring(0, match.start) + text.substring(match.end);
            onChange(newText);

            // Set cursor position after deletion
            setTimeout(() => {
              textarea.setSelectionRange(match.start, match.start);
            }, 0);

            return;
          }
        }
      }

      // Call the original onKeyDown handler
      onKeyDown?.(event);
    },
    [findToolMatches, onChange, onKeyDown]
  );

  // Create highlighted text for overlay
  const createHighlightedText = useCallback(
    (text: string): string => {
      const toolMatches = findToolMatches(text);

      if (toolMatches.length === 0) {
        return text.replace(/\n/g, "<br>").replace(/ /g, "&nbsp;");
      }

      let result = "";
      let lastIndex = 0;

      toolMatches.forEach((match) => {
        // Add text before the tool name
        result += text
          .substring(lastIndex, match.start)
          .replace(/\n/g, "<br>")
          .replace(/ /g, "&nbsp;");

        // Add highlighted tool name
        result += `<span class="tool-highlight">/${match.toolName}</span>`;

        lastIndex = match.end;
      });

      // Add remaining text
      result += text
        .substring(lastIndex)
        .replace(/\n/g, "<br>")
        .replace(/ /g, "&nbsp;");

      return result;
    },
    [findToolMatches]
  );

  // Update overlay content when value changes
  useEffect(() => {
    if (overlayRef.current) {
      const highlightedText = createHighlightedText(value);
      overlayRef.current.innerHTML = highlightedText;
    }
  }, [value, createHighlightedText]);

  // Sync scroll position between textarea and overlay
  const handleScroll = useCallback(() => {
    if (textAreaRef.current && overlayRef.current) {
      overlayRef.current.scrollTop = textAreaRef.current.scrollTop;
      overlayRef.current.scrollLeft = textAreaRef.current.scrollLeft;
    }
  }, []);

  return (
    <div style={{ position: "relative", ...style }}>
      {/* Overlay for highlighting */}
      <div
        ref={overlayRef}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          padding: "4px 11px",
          border: "1px solid transparent",
          borderRadius: token.borderRadius,
          fontSize: "14px",
          lineHeight: "1.5715",
          fontFamily: "inherit",
          whiteSpace: "pre-wrap",
          wordWrap: "break-word",
          overflow: "hidden",
          pointerEvents: "none",
          color: "transparent",
          zIndex: 1,
        }}
        className="tool-highlight-overlay"
      />

      {/* Actual textarea */}
      <TextArea
        ref={textAreaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onPaste={onPaste}
        onScroll={handleScroll}
        placeholder={placeholder}
        disabled={disabled}
        autoSize={autoSize}
        variant={variant as any}
        style={{
          position: "relative",
          zIndex: 2,
          backgroundColor: "transparent",
          color: token.colorText,
        }}
      />

      {/* CSS for tool highlighting */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
          .tool-highlight {
            background: linear-gradient(135deg, ${token.colorPrimary}20, ${token.colorPrimary}40);
            color: ${token.colorPrimary} !important;
            font-weight: 600;
            border-radius: 4px;
            padding: 1px 3px;
            box-shadow: 0 1px 3px ${token.colorPrimary}30;
            border: 1px solid ${token.colorPrimary}50;
          }

          .tool-highlight-overlay {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'Noto Sans', sans-serif;
          }
        `,
        }}
      />
    </div>
  );
};

export default ToolHighlightedInput;

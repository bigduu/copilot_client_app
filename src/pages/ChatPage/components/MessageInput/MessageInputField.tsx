import React from "react";
import { Input, Typography } from "antd";
import type { TextAreaRef } from "antd/es/input/TextArea";

const { TextArea } = Input;
const { Text } = Typography;

interface HighlightSegment {
  type: "workflow" | "file" | "text";
  text: string;
}

interface MessageInputFieldProps {
  value: string;
  placeholder: string;
  disabled: boolean;
  token: any;
  highlightSegments: HighlightSegment[];
  textAreaRef: React.RefObject<TextAreaRef>;
  highlightOverlayRef: React.RefObject<HTMLDivElement>;
  onChange: (value: string) => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onPaste: (event: React.ClipboardEvent<HTMLTextAreaElement>) => void;
  onScrollSync: () => void;
}

const MessageInputField: React.FC<MessageInputFieldProps> = ({
  value,
  placeholder,
  disabled,
  token,
  highlightSegments,
  textAreaRef,
  highlightOverlayRef,
  onChange,
  onKeyDown,
  onPaste,
  onScrollSync,
}) => {
  const showHighlightOverlay =
    value.length > 0 &&
    highlightSegments.some((segment) => segment.type !== "text");

  return (
    <div
      style={{
        position: "relative",
        flex: 1,
      }}
    >
      {showHighlightOverlay ? (
        <div
          ref={highlightOverlayRef}
          aria-hidden
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            padding: "8px 0",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            overflowWrap: "anywhere",
            overflow: "hidden",
            pointerEvents: "none",
            color: token.colorText,
            fontSize: token.fontSize,
            lineHeight: 1.5,
            transform: "translate(0, 0)",
          }}
        >
          {highlightSegments.map((segment, index) => {
            let style: React.CSSProperties | undefined;
            if (segment.type === "workflow") {
              style = {
                backgroundColor: token.colorPrimaryBg,
                color: token.colorPrimary,
                fontWeight: 500,
              };
            } else if (segment.type === "file") {
              style = {
                backgroundColor: token.colorSuccessBg,
                color: token.colorSuccess,
              };
            }
            return (
              <span key={`segment-${index}`} style={style}>
                {segment.text}
              </span>
            );
          })}
          {value.endsWith("\n") ? "\n" : null}
        </div>
      ) : null}
      <TextArea
        ref={textAreaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
        placeholder={placeholder}
        disabled={disabled}
        autoSize={{ minRows: 2, maxRows: 6 }}
        variant="borderless"
        onScroll={onScrollSync}
        style={{
          resize: "none",
          flex: 1,
          fontSize: token.fontSize,
          padding: "8px 0",
          lineHeight: "1.5",
          border: "none",
          outline: "none",
          background: "transparent",
          color: showHighlightOverlay ? "transparent" : token.colorText,
          caretColor: token.colorText,
          position: "relative",
          zIndex: 1,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          overflowWrap: "anywhere",
          overflowY: "auto",
        }}
      />
    </div>
  );
};

export default MessageInputField;

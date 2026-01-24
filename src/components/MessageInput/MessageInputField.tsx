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
  return (
    <div
      style={{
        position: "relative",
        flex: 1,
      }}
    >
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
          pointerEvents: "none",
          color: token.colorText,
          fontSize: token.fontSize,
          lineHeight: 1.5,
          transform: "translate(0, 0)",
        }}
      >
        {value ? (
          highlightSegments.map((segment, index) => {
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
          })
        ) : (
          <Text style={{ color: token.colorTextQuaternary }}>
            {placeholder}
          </Text>
        )}
        {value.endsWith("\n") ? "\n" : null}
      </div>
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
          minHeight: "100%",
          height: "100%",
          lineHeight: "1.5",
          border: "none",
          outline: "none",
          background: "transparent",
          color: "transparent",
          caretColor: token.colorText,
          position: "relative",
          zIndex: 1,
        }}
      />
    </div>
  );
};

export default MessageInputField;

import React from "react";
import { Button } from "antd";

interface MermaidChartErrorProps {
  error: string;
  className?: string;
  style?: React.CSSProperties;
  token: any;
  onFix?: () => void;
  isFixing: boolean;
  fixError: string;
}

const MermaidChartError: React.FC<MermaidChartErrorProps> = ({
  error,
  className,
  style,
  token,
  onFix,
  isFixing,
  fixError,
}) => {
  const errorParts = error.split("\n\n");

  return (
    <div
      className={className}
      style={{
        color: token.colorError,
        padding: `${token.paddingXS}px ${token.paddingSM}px`,
        fontSize: token.fontSizeSM,
        background: token.colorErrorBg,
        borderRadius: token.borderRadiusSM,
        border: `1px solid ${token.colorErrorBorder}`,
        margin: `${token.marginXS}px 0`,
        minHeight: "60px",
        maxHeight: "120px",
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        justifyContent: "flex-start",
        overflow: "auto",
        position: "relative",
        maxWidth: "100%",
        boxSizing: "border-box",
        ...style,
      }}
      title={`Mermaid Error: ${error}\n\nCheck browser console for detailed error information.`}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          marginBottom: token.marginXXS,
        }}
      >
        <span
          style={{
            marginRight: token.marginXS,
            fontSize: "14px",
            flexShrink: 0,
            lineHeight: 1,
          }}
        >
          ⚠️
        </span>
        <span
          style={{
            fontWeight: 600,
            color: token.colorError,
          }}
        >
          Mermaid Diagram Error
        </span>
      </div>
      <div
        style={{
          fontSize: token.fontSizeSM,
          lineHeight: 1.4,
          wordBreak: "break-word",
          flex: 1,
          width: "100%",
        }}
      >
        {errorParts.map((part, index) => (
          <div
            key={`${index}-${part.substring(0, 12)}`}
            style={{
              marginBottom: index < errorParts.length - 1 ? token.marginXS : 0,
              ...(part.startsWith("💡")
                ? {
                    backgroundColor: token.colorInfoBg,
                    border: `1px solid ${token.colorInfoBorder}`,
                    borderRadius: token.borderRadiusSM,
                    padding: token.paddingXS,
                    marginTop: token.marginXS,
                    color: token.colorInfo,
                    fontWeight: 500,
                  }
                : {}),
            }}
          >
            {part}
          </div>
        ))}
      </div>
      {onFix && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: token.marginXS,
            marginTop: token.marginXS,
            width: "100%",
          }}
        >
          <Button
            size="small"
            type="primary"
            onClick={onFix}
            loading={isFixing}
          >
            Fix Mermaid
          </Button>
          {fixError && (
            <span
              style={{
                color: token.colorError,
                fontSize: token.fontSizeSM,
                wordBreak: "break-word",
                flex: 1,
              }}
            >
              {fixError}
            </span>
          )}
        </div>
      )}
      <div
        style={{
          fontSize: token.fontSizeSM,
          color: token.colorTextSecondary,
          marginTop: token.marginXS,
          fontStyle: "italic",
        }}
      >
        💡 Check browser console (F12) for detailed error information
      </div>
    </div>
  );
};

export default MermaidChartError;

import React from "react";
import { theme } from "antd";

const { useToken } = theme;

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
      <style>{`
        @keyframes typing-dot {
          0%, 80%, 100% {
            opacity: 0.3;
            transform: scale(0.8);
          }
          40% {
            opacity: 1;
            transform: scale(1);
          }
        }
      `}</style>
    </div>
  );
};

export default TypingIndicator;

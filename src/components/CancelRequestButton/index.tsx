import React from "react";
import { Button, Space, Spin, theme } from "antd";
import { StopOutlined } from "@ant-design/icons";

const { useToken } = theme;

interface CancelRequestButtonProps {
  onCancel: () => void;
  disabled?: boolean;
}

export const CancelRequestButton: React.FC<CancelRequestButtonProps> = ({
  onCancel,
  disabled = false,
}) => {
  const { token } = useToken();

  return (
    <Space
      style={{
        marginTop: token.marginSM,
        fontSize: token.fontSizeSM,
        color: token.colorTextSecondary,
      }}
      size={token.marginXS}
    >
      <Spin size="small" />
      <span>AI is thinking...</span>
      <Button
        type="text"
        size="small"
        icon={<StopOutlined />}
        onClick={onCancel}
        disabled={disabled}
        danger
        style={{
          fontSize: token.fontSizeSM,
          height: "auto",
          padding: `${token.paddingXXS}px ${token.paddingXS}px`,
        }}
      >
        Cancel
      </Button>
    </Space>
  );
};

export default CancelRequestButton;

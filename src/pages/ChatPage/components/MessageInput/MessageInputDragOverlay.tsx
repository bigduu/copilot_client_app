import React from "react";
import { Space, Typography } from "antd";
import { PictureOutlined } from "@ant-design/icons";

const { Text } = Typography;

interface MessageInputDragOverlayProps {
  visible: boolean;
  token: any;
}

const MessageInputDragOverlay: React.FC<MessageInputDragOverlayProps> = ({
  visible,
  token,
}) => {
  if (!visible) return null;

  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: token.colorPrimaryBg,
        borderRadius: token.borderRadius,
        zIndex: 10,
        pointerEvents: "none",
      }}
    >
      <Space direction="vertical" align="center">
        <PictureOutlined style={{ fontSize: 32, color: token.colorPrimary }} />
        <Text style={{ color: token.colorPrimary, fontWeight: 500 }}>
          Drop images here
        </Text>
      </Space>
    </div>
  );
};

export default MessageInputDragOverlay;

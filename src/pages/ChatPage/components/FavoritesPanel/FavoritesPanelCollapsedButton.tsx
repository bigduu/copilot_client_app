import React from "react";
import { Button } from "antd";
import { BookOutlined } from "@ant-design/icons";

interface FavoritesPanelCollapsedButtonProps {
  onExpand: () => void;
  screens: Record<string, boolean>;
}

const FavoritesPanelCollapsedButton: React.FC<
  FavoritesPanelCollapsedButtonProps
> = ({ onExpand, screens }) => {
  return (
    <Button
      type="primary"
      icon={<BookOutlined />}
      onClick={onExpand}
      style={{
        position: "fixed",
        right: 0,
        top: "50%",
        transform: "translateY(-50%)",
        zIndex: 1000,
        borderTopRightRadius: 0,
        borderBottomRightRadius: 0,
      }}
      size={screens.xs ? "small" : "middle"}
    />
  );
};

export default FavoritesPanelCollapsedButton;

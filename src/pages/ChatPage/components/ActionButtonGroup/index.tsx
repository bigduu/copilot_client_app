import React from "react";
import { Button, Flex, Tooltip, theme, Grid } from "antd";
import { CopyOutlined, StarOutlined, BookOutlined } from "@ant-design/icons";

const { useToken } = theme;
const { useBreakpoint } = Grid;

export interface ActionButton {
  key: string;
  icon: React.ReactNode;
  title: string;
  onClick: () => void;
  disabled?: boolean;
}

export interface ActionButtonGroupProps {
  buttons: ActionButton[];
  isVisible: boolean;
  className?: string;
  style?: React.CSSProperties;
  position?: {
    bottom?: string | number;
    right?: string | number;
    top?: string | number;
    left?: string | number;
  };
}

export const ActionButtonGroup: React.FC<ActionButtonGroupProps> = ({
  buttons,
  isVisible,
  className,
  style,
  position = { bottom: "8px", right: "8px" },
}) => {
  const { token } = useToken();
  const screens = useBreakpoint();

  const getActionButtonSize = (): "small" | "middle" | "large" => {
    return screens.xs ? "small" : "small";
  };

  return (
    <Flex
      justify="flex-end"
      gap={token.marginXS}
      className={className}
      style={{
        marginTop: token.marginXS,
        position: "absolute",
        bottom: position.bottom,
        right: position.right,
        top: position.top,
        left: position.left,
        background: "transparent",
        zIndex: 1,
        opacity: isVisible ? 1 : 0,
        transition: "opacity 0.2s ease",
        pointerEvents: isVisible ? "auto" : "none",
        ...style,
      }}
    >
      {buttons.map((button) => (
        <Tooltip key={button.key} title={button.title}>
          <Button
            icon={button.icon}
            size={getActionButtonSize()}
            type="text"
            onClick={button.onClick}
            disabled={button.disabled}
            style={{
              background: token.colorBgElevated,
              borderRadius: token.borderRadiusSM,
            }}
          />
        </Tooltip>
      ))}
    </Flex>
  );
};

// Predefined common action button configurations
export const createCopyButton = (onCopy: () => void): ActionButton => ({
  key: "copy",
  icon: <CopyOutlined />,
  title: "Copy message",
  onClick: onCopy,
});

export const createFavoriteButton = (onFavorite: () => void): ActionButton => ({
  key: "favorite",
  icon: <StarOutlined />,
  title: "Add to favorites",
  onClick: onFavorite,
});

export const createReferenceButton = (
  onReference: () => void,
): ActionButton => ({
  key: "reference",
  icon: <BookOutlined />,
  title: "Reference message",
  onClick: onReference,
});

export default ActionButtonGroup;

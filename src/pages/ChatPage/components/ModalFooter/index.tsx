import React from "react";
import { Button, Space } from "antd";

export interface ModalFooterButton {
  key: string;
  text: string;
  type?: "default" | "primary" | "dashed" | "link" | "text";
  disabled?: boolean;
  loading?: boolean;
  danger?: boolean;
  onClick: () => void;
  icon?: React.ReactNode;
}

export interface ModalFooterProps {
  buttons: ModalFooterButton[];
  className?: string;
  style?: React.CSSProperties;
  size?: "small" | "middle" | "large";
  align?: "left" | "center" | "right";
}

export const ModalFooter: React.FC<ModalFooterProps> = ({
  buttons,
  className,
  style,
  size = "middle",
  align = "right",
}) => {
  const spaceProps = {
    className,
    style: {
      width: "100%",
      justifyContent:
        align === "left"
          ? "flex-start"
          : align === "center"
            ? "center"
            : "flex-end",
      ...style,
    },
  };

  return (
    <Space {...spaceProps}>
      {buttons.map((button) => (
        <Button
          key={button.key}
          type={button.type || "default"}
          disabled={button.disabled}
          loading={button.loading}
          danger={button.danger}
          onClick={button.onClick}
          size={size}
          icon={button.icon}
        >
          {button.text}
        </Button>
      ))}
    </Space>
  );
};

// Predefined common button configurations
export const createCancelButton = (
  onCancel: () => void,
): ModalFooterButton => ({
  key: "cancel",
  text: "Cancel",
  type: "default",
  onClick: onCancel,
});

export const createOkButton = (
  onOk: () => void,
  options?: {
    text?: string;
    disabled?: boolean;
    loading?: boolean;
  },
): ModalFooterButton => ({
  key: "ok",
  text: options?.text || "OK",
  type: "primary",
  disabled: options?.disabled,
  loading: options?.loading,
  onClick: onOk,
});

export const createApplyButton = (
  onApply: () => void,
  options?: {
    text?: string;
    disabled?: boolean;
    loading?: boolean;
  },
): ModalFooterButton => ({
  key: "apply",
  text: options?.text || "Apply",
  type: "primary",
  disabled: options?.disabled,
  loading: options?.loading,
  onClick: onApply,
});

export const createSaveButton = (
  onSave: () => void,
  options?: {
    disabled?: boolean;
    loading?: boolean;
  },
): ModalFooterButton => ({
  key: "save",
  text: "Save",
  type: "primary",
  disabled: options?.disabled,
  loading: options?.loading,
  onClick: onSave,
});

export const createDeleteButton = (
  onDelete: () => void,
  options?: {
    text?: string;
    disabled?: boolean;
    loading?: boolean;
  },
): ModalFooterButton => ({
  key: "delete",
  text: options?.text || "Delete",
  type: "primary",
  danger: true,
  disabled: options?.disabled,
  loading: options?.loading,
  onClick: onDelete,
});

export default ModalFooter;

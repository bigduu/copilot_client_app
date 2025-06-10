import React, { useState } from "react";
import { List, Button, Input, Checkbox, Tooltip } from "antd";
import {
  DeleteOutlined,
  PushpinFilled,
  PushpinOutlined,
  EditOutlined,
  CheckOutlined,
  CloseOutlined,
} from "@ant-design/icons";
import { ChatItem as ChatItemType } from "../../types/chat";
import theme from "../../styles/theme";

interface ChatItemProps {
  chat: ChatItemType;
  isSelected: boolean;
  onSelect: (chatId: string) => void;
  onDelete: (chatId: string) => void;
  onPin: (chatId: string) => void;
  onUnpin: (chatId: string) => void;
  onEdit?: (chatId: string, newTitle: string) => void;
  SelectMode?: boolean;
  checked?: boolean;
  onCheck?: (chatId: string, checked: boolean) => void;
}

export const ChatItem: React.FC<ChatItemProps> = ({
  chat,
  isSelected,
  onSelect,
  onDelete,
  onPin,
  onUnpin,
  onEdit,
  SelectMode,
  checked,
  onCheck,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(chat.title);

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDelete(chat.id);
  };

  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsEditing(true);
  };

  const handleSave = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onEdit && editValue.trim()) {
      onEdit(chat.id, editValue.trim());
    }
    setIsEditing(false);
  };

  const handleCancel = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditValue(chat.title);
    setIsEditing(false);
  };

  // Dynamic style calculation
  const itemStyle: React.CSSProperties = {
    padding: theme.components.chatItem.padding,
    borderRadius: theme.components.chatItem.borderRadius,
    marginBottom: theme.components.chatItem.marginBottom,
    cursor: "pointer",
    transition: theme.components.chatItem.transition,
    backgroundColor: isSelected ? `var(--ant-color-primary-bg)` : "transparent",
    borderLeft: isSelected
      ? `3px solid ${theme.colors.primary}`
      : "3px solid transparent",
  };

  const titleStyle: React.CSSProperties = {
    flex: 1,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    fontSize: theme.components.chatItem.fontSize,
    fontWeight: isSelected
      ? theme.components.chatItem.selected.fontWeight
      : "normal",
    color: isSelected ? theme.colors.primary : theme.colors.text,
  };

  const editInputStyle: React.CSSProperties = {
    flex: 1,
    fontSize: theme.components.chatItem.editInput.fontSize,
    marginRight: theme.components.chatItem.editInput.marginRight,
  };

  // Build List.Item actions
  const actions = [
    // Pin/Unpin button
    <Tooltip key="pin" title={chat.pinned ? "Unpin" : "Pin"}>
      <Button
        type="text"
        size="small"
        icon={
          chat.pinned ? (
            <PushpinFilled style={{ color: theme.colors.pinned }} />
          ) : (
            <PushpinOutlined />
          )
        }
        onClick={(e) => {
          e.stopPropagation();
          chat.pinned ? onUnpin(chat.id) : onPin(chat.id);
        }}
        style={{
          opacity: chat.pinned ? 1 : undefined, // Always show when pinned
        }}
      />
    </Tooltip>,

    // Edit related buttons
    ...(isEditing
      ? [
          <Tooltip key="save" title="Save">
            <Button
              type="text"
              size="small"
              icon={<CheckOutlined style={{ color: theme.colors.success }} />}
              onClick={handleSave}
            />
          </Tooltip>,
          <Tooltip key="cancel" title="Cancel">
            <Button
              type="text"
              size="small"
              icon={<CloseOutlined style={{ color: theme.colors.error }} />}
              onClick={handleCancel}
            />
          </Tooltip>,
        ]
      : [
          <Tooltip key="edit" title="Edit">
            <Button
              type="text"
              size="small"
              icon={<EditOutlined />}
              onClick={handleEdit}
            />
          </Tooltip>,
        ]),

    // Delete button
    <Tooltip key="delete" title="Delete">
      <Button
        type="text"
        size="small"
        icon={<DeleteOutlined />}
        onClick={handleDelete}
        danger
      />
    </Tooltip>,
  ];

  return (
    <List.Item
      style={itemStyle}
      onClick={() => !isEditing && onSelect(chat.id)}
      actions={actions}
      className="chat-item" // Keep class name for CSS hover effects
    >
      <List.Item.Meta
        avatar={
          SelectMode && (
            <Checkbox
              checked={!!checked}
              onChange={(e) => {
                if (onCheck) onCheck(chat.id, e.target.checked);
              }}
              onClick={(e) => e.stopPropagation()}
            />
          )
        }
        title={
          isEditing ? (
            <Input
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              onPressEnter={(e) => {
                e.preventDefault();
                handleSave(e as any);
              }}
              autoFocus
              style={editInputStyle}
              variant="borderless"
              size="small"
            />
          ) : (
            <div style={titleStyle}>{chat.title}</div>
          )
        }
      />
    </List.Item>
  );
};

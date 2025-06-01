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

  // 动态样式计算
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

  // 构建List.Item的actions
  const actions = [
    // Pin/Unpin按钮
    <Tooltip key="pin" title={chat.pinned ? "取消置顶" : "置顶"}>
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
          opacity: chat.pinned ? 1 : undefined, // 置顶状态下始终显示
        }}
      />
    </Tooltip>,

    // 编辑相关按钮
    ...(isEditing
      ? [
          <Tooltip key="save" title="保存">
            <Button
              type="text"
              size="small"
              icon={<CheckOutlined style={{ color: theme.colors.success }} />}
              onClick={handleSave}
            />
          </Tooltip>,
          <Tooltip key="cancel" title="取消">
            <Button
              type="text"
              size="small"
              icon={<CloseOutlined style={{ color: theme.colors.error }} />}
              onClick={handleCancel}
            />
          </Tooltip>,
        ]
      : [
          <Tooltip key="edit" title="编辑">
            <Button
              type="text"
              size="small"
              icon={<EditOutlined />}
              onClick={handleEdit}
            />
          </Tooltip>,
        ]),

    // 删除按钮
    <Tooltip key="delete" title="删除">
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
      className="chat-item" // 保持类名用于CSS悬停效果
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

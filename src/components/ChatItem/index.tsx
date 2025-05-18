import React, { useState } from "react";
import { Button, Input } from "antd";
import {
  DeleteOutlined,
  PushpinFilled,
  PushpinOutlined,
  EditOutlined,
  CheckOutlined,
  CloseOutlined,
} from "@ant-design/icons";
import { ChatItem as ChatItemType } from "../../types/chat";
import "./styles.css";

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

  return (
    <div
      onClick={() => !isEditing && onSelect(chat.id)}
      className={`chat-item ${isSelected ? "selected" : ""}`}
    >
      {SelectMode && (
        <input
          type="checkbox"
          checked={!!checked}
          onChange={(e) => {
            if (onCheck) onCheck(chat.id, e.target.checked);
          }}
          onClick={(e) => e.stopPropagation()}
          style={{ marginRight: 8 }}
        />
      )}
      {isEditing ? (
        <Input
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onClick={(e) => e.stopPropagation()}
          onPressEnter={(e) => {
            e.preventDefault();
            handleSave(e as any);
          }}
          autoFocus
          className="edit-input"
        />
      ) : (
        <div className="title">{chat.title}</div>
      )}
      <div className="button-group">
        <Button
          type="text"
          size="small"
          icon={
            chat.pinned ? (
              <PushpinFilled style={{ color: "#faad14" }} />
            ) : (
              <PushpinOutlined />
            )
          }
          onClick={(e) => {
            e.stopPropagation();
            chat.pinned ? onUnpin(chat.id) : onPin(chat.id);
          }}
          className={`${chat.pinned ? "pin-button-active" : "pin-button"}`}
        />
        {isEditing ? (
          <>
            <Button
              type="text"
              size="small"
              icon={<CheckOutlined style={{ color: "#52c41a" }} />}
              onClick={handleSave}
              className="edit-button"
            />
            <Button
              type="text"
              size="small"
              icon={<CloseOutlined style={{ color: "#ff4d4f" }} />}
              onClick={handleCancel}
              className="edit-button"
            />
          </>
        ) : (
          <Button
            type="text"
            size="small"
            icon={<EditOutlined />}
            onClick={handleEdit}
            className="edit-button"
          />
        )}
        <Button
          type="text"
          size="small"
          icon={<DeleteOutlined />}
          onClick={handleDelete}
          className="delete-button"
        />
      </div>
    </div>
  );
};

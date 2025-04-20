import React from "react";
import { Button, Tooltip } from "antd";
import { DeleteOutlined } from "@ant-design/icons";
import { ChatItem as ChatItemType } from "../../types/chat";
import "./styles.css";

interface ChatItemProps {
  chat: ChatItemType;
  isSelected: boolean;
  onSelect: (chatId: string) => void;
  onDelete: (chatId: string) => void;
}

export const ChatItem: React.FC<ChatItemProps> = ({
  chat,
  isSelected,
  onSelect,
  onDelete,
}) => {
  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDelete(chat.id);
  };

  return (
    <div
      onClick={() => onSelect(chat.id)}
      className={`chat-item ${isSelected ? "selected" : ""}`}
    >
      <Tooltip title={chat.title} placement="right">
        <div className="title">{chat.title}</div>
      </Tooltip>
      <Button
        type="text"
        size="small"
        icon={<DeleteOutlined />}
        onClick={handleDelete}
        className="delete-button"
      />
    </div>
  );
};

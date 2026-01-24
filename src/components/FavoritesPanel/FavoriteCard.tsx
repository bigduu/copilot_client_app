import React, { useMemo } from "react";
import { Button, Card, Flex, Space, Tooltip, Typography } from "antd";
import {
  BookOutlined,
  CopyOutlined,
  DeleteOutlined,
  EditOutlined,
  EnvironmentOutlined,
} from "@ant-design/icons";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { FavoriteItem } from "../../types/chat";
import { createFavoritesMarkdownComponents } from "./favoritesMarkdownComponents";

const { Text } = Typography;

interface FavoriteCardProps {
  favorite: FavoriteItem;
  token: any;
  formattedDate: string;
  onCopy: (content: string) => void;
  onAddNote: (favorite: FavoriteItem) => void;
  onReference: (content: string) => void;
  onLocateMessage: (messageId: string) => void;
  onRemove: (favoriteId: string) => void;
}

const FavoriteCard: React.FC<FavoriteCardProps> = ({
  favorite,
  token,
  formattedDate,
  onCopy,
  onAddNote,
  onReference,
  onLocateMessage,
  onRemove,
}) => {
  const markdownComponents = useMemo(
    () => createFavoritesMarkdownComponents(token),
    [token],
  );

  return (
    <Card
      size="small"
      variant="outlined"
      style={{
        width: "100%",
        background:
          favorite.role === "user" ? token.colorPrimaryBg : token.colorBgLayout,
        borderRadius: token.borderRadiusSM,
        border: `1px solid ${token.colorBorderSecondary}`,
      }}
      styles={{ body: { padding: token.paddingSM } }}
    >
      <Space
        direction="vertical"
        size={token.marginXS}
        style={{ width: "100%" }}
      >
        <Flex
          justify="space-between"
          align="center"
          style={{
            borderBottom: `1px solid ${token.colorBorderSecondary}`,
            paddingBottom: token.paddingXS,
            marginBottom: token.marginXS,
          }}
        >
          <Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
            {favorite.role === "user" ? "You" : "Assistant"}
          </Text>
          <Text type="secondary" style={{ fontSize: token.fontSizeSM * 0.85 }}>
            {formattedDate}
          </Text>
        </Flex>

        <Flex vertical style={{ fontSize: token.fontSizeSM }}>
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={markdownComponents}
          >
            {favorite.content}
          </ReactMarkdown>
        </Flex>

        {favorite.note && (
          <Card
            size="small"
            style={{ background: token.colorBgTextHover }}
            styles={{ body: { padding: token.paddingXS } }}
          >
            <Space align="start">
              <Text strong style={{ fontSize: token.fontSizeSM * 0.85 }}>
                Note:
              </Text>
              {favorite.note}
            </Space>
          </Card>
        )}

        <Flex justify="flex-end" gap={token.marginXS} wrap="wrap">
          <Tooltip title="Copy">
            <Button
              icon={<CopyOutlined />}
              size="small"
              type="text"
              onClick={() => onCopy(favorite.content)}
            />
          </Tooltip>
          <Tooltip title="Add Note">
            <Button
              icon={<EditOutlined />}
              size="small"
              type="text"
              onClick={() => onAddNote(favorite)}
            />
          </Tooltip>
          <Tooltip title="Reference">
            <Button
              icon={<BookOutlined />}
              size="small"
              type="text"
              onClick={() => onReference(favorite.content)}
            />
          </Tooltip>
          {favorite.messageId && (
            <Tooltip title="Locate Message">
              <Button
                icon={<EnvironmentOutlined />}
                size="small"
                type="text"
                onClick={() => onLocateMessage(favorite.messageId)}
              />
            </Tooltip>
          )}
          <Tooltip title="Remove">
            <Button
              icon={<DeleteOutlined />}
              size="small"
              type="text"
              onClick={() => onRemove(favorite.id)}
              danger
            />
          </Tooltip>
        </Flex>
      </Space>
    </Card>
  );
};

export default FavoriteCard;

import React from "react";
import { Empty, Flex, List } from "antd";
import type { FavoriteItem } from "../../types/chat";
import FavoriteCard from "./FavoriteCard";
import { formatFavoriteDate } from "./favoritesUtils";

interface FavoritesPanelListProps {
  favorites: FavoriteItem[];
  token: any;
  onCopy: (content: string) => void;
  onAddNote: (favorite: FavoriteItem) => void;
  onReference: (content: string) => void;
  onLocateMessage: (messageId: string) => void;
  onRemove: (favoriteId: string) => void;
}

const FavoritesPanelList: React.FC<FavoritesPanelListProps> = ({
  favorites,
  token,
  onCopy,
  onAddNote,
  onReference,
  onLocateMessage,
  onRemove,
}) => {
  if (favorites.length === 0) {
    return (
      <Empty
        description="No favorites yet"
        image={Empty.PRESENTED_IMAGE_SIMPLE}
      />
    );
  }

  return (
    <List
      dataSource={favorites}
      style={{ flex: 1, overflow: "auto" }}
      renderItem={(favorite: FavoriteItem) => (
        <List.Item style={{ padding: token.paddingXS }}>
          <FavoriteCard
            favorite={favorite}
            token={token}
            formattedDate={formatFavoriteDate(favorite.createdAt)}
            onCopy={onCopy}
            onAddNote={onAddNote}
            onReference={onReference}
            onLocateMessage={onLocateMessage}
            onRemove={onRemove}
          />
        </List.Item>
      )}
    />
  );
};

export default FavoritesPanelList;

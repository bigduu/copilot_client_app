import React, { useMemo, useState } from "react";
import { Flex, Grid, Layout, theme } from "antd";
import { useChatManager } from "../../hooks/useChatManager";
import { useFavorites } from "../../hooks/useFavorites";
import type { FavoriteItem } from "../../types/chat";
import FavoritesPanelCollapsedButton from "./FavoritesPanelCollapsedButton";
import FavoritesPanelHeader from "./FavoritesPanelHeader";
import FavoritesPanelList from "./FavoritesPanelList";
import FavoritesPanelNoteModal from "./FavoritesPanelNoteModal";
import { copyToClipboard, createReference } from "./favoritesUtils";
import { useFavoritesPanelActions } from "./useFavoritesPanelActions";

const { Sider } = Layout;
const { useToken } = theme;
const { useBreakpoint } = Grid;

export const FavoritesPanel: React.FC = () => {
  const { token } = useToken();
  const screens = useBreakpoint();
  const { currentChatId, createNewChat, sendMessage } = useChatManager();
  const {
    favorites: allFavorites,
    removeFavorite,
    updateFavorite,
  } = useFavorites();

  const [sortOrder, setSortOrder] = useState<"descending" | "ascending">(
    "descending",
  );
  const [sortField, setSortField] = useState<"createdAt" | "role">("createdAt");
  const [collapsed, setCollapsed] = useState(true);
  const [noteModalVisible, setNoteModalVisible] = useState(false);
  const [currentFavoriteId, setCurrentFavoriteId] = useState<string | null>(
    null,
  );
  const [noteText, setNoteText] = useState("");

  const currentChatFavorites = useMemo(() => {
    if (!currentChatId) return [];
    return allFavorites.filter((fav) => fav.chatId === currentChatId);
  }, [allFavorites, currentChatId]);

  const { exportFavorites, summarizeFavorites, isExporting, isSummarizing } =
    useFavoritesPanelActions({
      currentChatId,
      favorites: currentChatFavorites,
      createNewChat,
      sendMessage,
      token,
    });

  const sortedFavorites = useMemo(() => {
    return [...currentChatFavorites].sort((a, b) => {
      if (sortField === "role") {
        const roleComparison = a.role.localeCompare(b.role);
        return sortOrder === "ascending" ? roleComparison : -roleComparison;
      }
      return sortOrder === "ascending"
        ? a.createdAt - b.createdAt
        : b.createdAt - a.createdAt;
    });
  }, [currentChatFavorites, sortField, sortOrder]);

  const navigateToMessage = (messageId: string) => {
    if (!messageId) {
      console.warn("No messageId provided for navigation");
      return;
    }

    const event = new CustomEvent("navigate-to-message", {
      detail: { messageId },
    });
    window.dispatchEvent(event);
  };

  const openNoteModal = (favorite: FavoriteItem) => {
    setCurrentFavoriteId(favorite.id);
    setNoteText(favorite.note || "");
    setNoteModalVisible(true);
  };

  const saveNote = () => {
    if (currentFavoriteId) {
      updateFavorite(currentFavoriteId, { note: noteText });
      setNoteModalVisible(false);
      setCurrentFavoriteId(null);
      setNoteText("");
    }
  };

  const referenceFavorite = (content: string) => {
    const referenceText = createReference(content);
    const event = new CustomEvent("reference-text", {
      detail: { text: referenceText, chatId: currentChatId },
    });
    window.dispatchEvent(event);
  };

  if (collapsed) {
    return (
      <FavoritesPanelCollapsedButton
        onExpand={() => setCollapsed(false)}
        screens={screens}
      />
    );
  }

  return (
    <>
      <Sider
        breakpoint="md"
        collapsedWidth={0}
        width={
          screens.xs
            ? 300
            : screens.sm
              ? 350
              : screens.md
                ? 400
                : screens.lg
                  ? 450
                  : 500
        }
        style={{
          background: token.colorBgContainer,
          borderLeft: `1px solid ${token.colorBorderSecondary}`,
          overflowY: "auto",
          height: "100vh",
        }}
      >
        <Flex
          vertical
          style={{
            padding: token.paddingMD,
            height: "100%",
          }}
        >
          <FavoritesPanelHeader
            token={token}
            screens={screens}
            sortField={sortField}
            sortOrder={sortOrder}
            onSortFieldChange={setSortField}
            onSortOrderToggle={() =>
              setSortOrder(
                sortOrder === "descending" ? "ascending" : "descending",
              )
            }
            onExport={exportFavorites}
            onSummarize={summarizeFavorites}
            onCollapse={() => setCollapsed(true)}
            isExporting={isExporting}
            isSummarizing={isSummarizing}
            hasFavorites={currentChatFavorites.length > 0}
          />

          <Flex vertical style={{ flex: 1, overflow: "hidden" }}>
            <FavoritesPanelList
              favorites={sortedFavorites}
              token={token}
              onCopy={copyToClipboard}
              onAddNote={openNoteModal}
              onReference={referenceFavorite}
              onLocateMessage={navigateToMessage}
              onRemove={removeFavorite}
            />
          </Flex>
        </Flex>
      </Sider>

      <FavoritesPanelNoteModal
        visible={noteModalVisible}
        noteText={noteText}
        onChange={setNoteText}
        onSave={saveNote}
        onCancel={() => setNoteModalVisible(false)}
      />
    </>
  );
};

export default FavoritesPanel;

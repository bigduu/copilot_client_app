import React, { useState } from "react";
import {
  Layout,
  Typography,
  List,
  Card,
  Space,
  Button,
  Empty,
  Switch,
  Tooltip,
  Dropdown,
  theme,
  Input,
  Modal,
  Select,
} from "antd";
import {
  DeleteOutlined,
  CopyOutlined,
  ExportOutlined,
  BookOutlined,
  SortAscendingOutlined,
  SortDescendingOutlined,
  EditOutlined,
  EnvironmentOutlined,
} from "@ant-design/icons";
import { useChat } from "../../contexts/ChatContext";
import { FavoriteItem } from "../../types/chat";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const { Sider } = Layout;
const { Title, Text } = Typography;
const { useToken } = theme;
const { TextArea } = Input;
const { Option } = Select;

export const FavoritesPanel: React.FC = () => {
  const { token } = useToken();
  const {
    getCurrentChatFavorites,
    removeFavorite,
    exportFavorites,
    updateFavorite,
    navigateToMessage,
  } = useChat();

  const [sortOrder, setSortOrder] = useState<"descending" | "ascending">(
    "descending"
  );
  const [sortField, setSortField] = useState<"createdAt" | "role">("createdAt");
  const [collapsed, setCollapsed] = useState(false);
  const [noteModalVisible, setNoteModalVisible] = useState(false);
  const [currentFavoriteId, setCurrentFavoriteId] = useState<string | null>(
    null
  );
  const [noteText, setNoteText] = useState("");

  // Get favorites for the current chat
  const favorites = getCurrentChatFavorites();

  // Sort favorites based on current sorting options
  const sortedFavorites = [...favorites].sort((a, b) => {
    if (sortField === "role") {
      // Sort by role (user/assistant)
      const roleComparison = a.role.localeCompare(b.role);
      return sortOrder === "ascending" ? roleComparison : -roleComparison;
    } else {
      // Sort by creation date
      return sortOrder === "ascending"
        ? a.createdAt - b.createdAt
        : b.createdAt - a.createdAt;
    }
  });

  // Copy to clipboard
  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch (e) {
      console.error("Failed to copy text:", e);
    }
  };

  // Create reference text
  const createReference = (content: string) => {
    return `> ${content.replace(/\n/g, "\n> ")}`;
  };

  // Format date for display
  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // Open note modal for a favorite
  const openNoteModal = (favorite: FavoriteItem) => {
    setCurrentFavoriteId(favorite.id);
    setNoteText(favorite.note || "");
    setNoteModalVisible(true);
  };

  // Save note for a favorite
  const saveNote = () => {
    if (currentFavoriteId) {
      updateFavorite(currentFavoriteId, { note: noteText });
      setNoteModalVisible(false);
      setCurrentFavoriteId(null);
      setNoteText("");
    }
  };

  // Reference a favorite
  const referenceFavorite = (content: string) => {
    const referenceText = createReference(content);

    // Dispatch event for InputContainer to catch
    const event = new CustomEvent("reference-text", {
      detail: { text: referenceText },
    });
    window.dispatchEvent(event);
  };

  if (collapsed) {
    return (
      <div
        style={{
          position: "fixed",
          right: 0,
          top: "50%",
          transform: "translateY(-50%)",
          zIndex: 1000,
        }}
      >
        <Button
          type="primary"
          icon={<BookOutlined />}
          onClick={() => setCollapsed(false)}
          style={{ borderTopRightRadius: 0, borderBottomRightRadius: 0 }}
        />
      </div>
    );
  }

  return (
    <>
      <Sider
        width={500}
        style={{
          background: token.colorBgContainer,
          borderLeft: `1px solid ${token.colorBorderSecondary}`,
          overflowY: "auto",
          height: "100vh",
        }}
      >
        <div style={{ padding: token.paddingMD }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: token.marginMD,
            }}
          >
            <Title level={4} style={{ margin: 0 }}>
              Favorites
            </Title>
            <Space>
              <Space.Compact>
                <Select
                  value={sortField}
                  onChange={(value) => setSortField(value)}
                  size="small"
                  style={{ width: 100 }}
                >
                  <Option value="createdAt">日期</Option>
                  <Option value="role">角色</Option>
                </Select>
                <Button
                  icon={
                    sortOrder === "descending" ? (
                      <SortDescendingOutlined />
                    ) : (
                      <SortAscendingOutlined />
                    )
                  }
                  onClick={() =>
                    setSortOrder(
                      sortOrder === "descending" ? "ascending" : "descending"
                    )
                  }
                  size="small"
                  type="default"
                />
              </Space.Compact>
              <Dropdown
                menu={{
                  items: [
                    {
                      key: "markdown",
                      label: "Export as Markdown",
                      onClick: () => exportFavorites("markdown"),
                    },
                    {
                      key: "pdf",
                      label: "Export as PDF",
                      onClick: () => exportFavorites("pdf"),
                    },
                  ],
                }}
                placement="bottomRight"
              >
                <Button icon={<ExportOutlined />} size="small" type="text" />
              </Dropdown>
              <Button
                icon={<BookOutlined />}
                onClick={() => setCollapsed(true)}
                size="small"
                type="text"
              />
            </Space>
          </div>

          {sortedFavorites.length === 0 ? (
            <Empty
              description="No favorites yet"
              image={Empty.PRESENTED_IMAGE_SIMPLE}
            />
          ) : (
            <List
              dataSource={sortedFavorites}
              renderItem={(favorite: FavoriteItem) => (
                <List.Item
                  key={favorite.id}
                  style={{ padding: token.paddingXS }}
                >
                  <Card
                    size="small"
                    style={{
                      width: "100%",
                      background:
                        favorite.role === "user"
                          ? token.colorPrimaryBg
                          : token.colorBgLayout,
                      borderRadius: token.borderRadiusSM,
                      boxShadow: token.boxShadowTertiary,
                      border: `1px solid ${token.colorBorderSecondary}`,
                    }}
                    bodyStyle={{ padding: token.paddingSM }}
                  >
                    <Space
                      direction="vertical"
                      size={token.marginXS}
                      style={{ width: "100%" }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          borderBottom: `1px solid ${token.colorBorderSecondary}`,
                          paddingBottom: token.paddingXS,
                          marginBottom: token.marginXS,
                        }}
                      >
                        <Text
                          type="secondary"
                          style={{ fontSize: token.fontSizeSM }}
                        >
                          {favorite.role === "user" ? "You" : "Assistant"}
                        </Text>
                        <Text
                          type="secondary"
                          style={{ fontSize: token.fontSizeSM * 0.85 }}
                        >
                          {formatDate(favorite.createdAt)}
                        </Text>
                      </div>

                      <div style={{ fontSize: token.fontSizeSM }}>
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {favorite.content}
                        </ReactMarkdown>
                      </div>

                      {favorite.note && (
                        <div
                          style={{
                            fontSize: token.fontSizeSM * 0.85,
                            color: token.colorTextSecondary,
                            background: token.colorBgTextHover,
                            padding: token.paddingXS,
                            borderRadius: token.borderRadiusSM,
                          }}
                        >
                          <Space align="start">
                            <Text
                              strong
                              style={{ fontSize: token.fontSizeSM * 0.85 }}
                            >
                              Note:
                            </Text>
                            {favorite.note}
                          </Space>
                        </div>
                      )}

                      <div
                        style={{
                          display: "flex",
                          justifyContent: "flex-end",
                          gap: token.marginXS,
                        }}
                      >
                        <Tooltip title="Copy">
                          <Button
                            icon={<CopyOutlined />}
                            size="small"
                            type="text"
                            onClick={() => copyToClipboard(favorite.content)}
                          />
                        </Tooltip>
                        <Tooltip title="Add Note">
                          <Button
                            icon={<EditOutlined />}
                            size="small"
                            type="text"
                            onClick={() => openNoteModal(favorite)}
                          />
                        </Tooltip>
                        <Tooltip title="Reference">
                          <Button
                            icon={<BookOutlined />}
                            size="small"
                            type="text"
                            onClick={() => referenceFavorite(favorite.content)}
                          />
                        </Tooltip>
                        {favorite.messageId && (
                          <Tooltip title="Locate Message">
                            <Button
                              icon={<EnvironmentOutlined />}
                              size="small"
                              type="text"
                              onClick={() =>
                                navigateToMessage(favorite.messageId)
                              }
                            />
                          </Tooltip>
                        )}
                        <Tooltip title="Remove">
                          <Button
                            icon={<DeleteOutlined />}
                            size="small"
                            type="text"
                            onClick={() => removeFavorite(favorite.id)}
                            danger
                          />
                        </Tooltip>
                      </div>
                    </Space>
                  </Card>
                </List.Item>
              )}
            />
          )}
        </div>
      </Sider>

      {/* Note Modal */}
      <Modal
        title="Add Note"
        open={noteModalVisible}
        onOk={saveNote}
        onCancel={() => setNoteModalVisible(false)}
        okText="Save"
        destroyOnClose
      >
        <TextArea
          value={noteText}
          onChange={(e) => setNoteText(e.target.value)}
          placeholder="Add a note to this favorite..."
          autoSize={{ minRows: 3, maxRows: 6 }}
          style={{ marginTop: token.marginSM }}
        />
      </Modal>
    </>
  );
};

export default FavoritesPanel;

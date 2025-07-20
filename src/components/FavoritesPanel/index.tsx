import React, { useState } from "react";
import {
  Layout,
  Typography,
  List,
  Card,
  Space,
  Button,
  Empty,
  Tooltip,
  Dropdown,
  theme,
  Input,
  Modal,
  Select,
  Grid,
  Flex,
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
  FileTextOutlined,
} from "@ant-design/icons";
import { useChats } from "../../hooks/useChats";
import { FavoriteItem } from "../../types/chat";
import { useChatManager } from "../../hooks/useChatManager";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";

const { Sider } = Layout;
const { Title, Text } = Typography;
const { useToken } = theme;
const { TextArea } = Input;
const { Option } = Select;
const { useBreakpoint } = Grid;

export const FavoritesPanel: React.FC = () => {
  const { token } = useToken();
  const screens = useBreakpoint();
  const { currentChatId } = useChats();

  // Get favorites functionality from useChatManager
  const {
    getCurrentChatFavorites,
    removeFavorite,
    updateFavorite,
    exportFavorites,
    summarizeFavorites,
  } = useChatManager();

  // TODO: Implement message navigation functionality
  const navigateToMessage = (messageId: string) =>
    console.log("navigateToMessage", messageId);

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
      const roleComparison = a.role.localeCompare(b.role);
      return sortOrder === "ascending" ? roleComparison : -roleComparison;
    } else {
      return sortOrder === "ascending"
        ? a.createdAt - b.createdAt
        : b.createdAt - a.createdAt;
    }
  });

  // Responsive width calculation
  const getSiderWidth = () => {
    if (screens.xs) return 300;
    if (screens.sm) return 350;
    if (screens.md) return 400;
    if (screens.lg) return 450;
    return 500;
  };

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
    const event = new CustomEvent("reference-text", {
      detail: { text: referenceText, chatId: currentChatId },
    });
    window.dispatchEvent(event);
  };

  if (collapsed) {
    return (
      <Flex
        align="center"
        justify="center"
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
          size={screens.xs ? "small" : "middle"}
        />
      </Flex>
    );
  }

  return (
    <>
      <Sider
        width={getSiderWidth()}
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
          {/* Header */}
          <Flex
            justify="space-between"
            align="center"
            style={{ marginBottom: token.marginMD }}
          >
            <Title level={4} style={{ margin: 0 }}>
              Favorites
            </Title>
            <Space size="small">
              <Tooltip title="Summarize">
                <Button
                  icon={<FileTextOutlined />}
                  onClick={summarizeFavorites}
                  size="small"
                  type="primary"
                  disabled={favorites.length === 0}
                />
              </Tooltip>
              <Space.Compact>
                <Select
                  value={sortField}
                  onChange={(value) => setSortField(value)}
                  size="small"
                  style={{ width: screens.xs ? 80 : 100 }}
                >
                  <Option value="createdAt">Date</Option>
                  <Option value="role">Role</Option>
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
          </Flex>

          {/* Content */}
          <Flex vertical style={{ flex: 1, overflow: "hidden" }}>
            {sortedFavorites.length === 0 ? (
              <Empty
                description="No favorites yet"
                image={Empty.PRESENTED_IMAGE_SIMPLE}
              />
            ) : (
              <List
                dataSource={sortedFavorites}
                style={{ flex: 1, overflow: "auto" }}
                renderItem={(favorite: FavoriteItem) => (
                  <List.Item style={{ padding: token.paddingXS }}>
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
                      styles={{ body: { padding: token.paddingSM } }}
                    >
                      <Space
                        direction="vertical"
                        size={token.marginXS}
                        style={{ width: "100%" }}
                      >
                        {/* Header */}
                        <Flex
                          justify="space-between"
                          align="center"
                          style={{
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
                        </Flex>

                        {/* Content */}
                        <div style={{ fontSize: token.fontSizeSM }}>
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            components={{
                              p: ({ children }) => (
                                <Text
                                  style={{
                                    marginBottom: token.marginSM,
                                    display: "block",
                                  }}
                                >
                                  {children}
                                </Text>
                              ),
                              ol: ({ children }) => (
                                <ol
                                  style={{
                                    marginBottom: token.marginSM,
                                    paddingLeft: 20,
                                  }}
                                >
                                  {children}
                                </ol>
                              ),
                              ul: ({ children }) => (
                                <ul
                                  style={{
                                    marginBottom: token.marginSM,
                                    paddingLeft: 20,
                                  }}
                                >
                                  {children}
                                </ul>
                              ),
                              li: ({ children }) => (
                                <li style={{ marginBottom: token.marginXS }}>
                                  {children}
                                </li>
                              ),
                              blockquote: ({ children }) => (
                                <div
                                  style={{
                                    borderLeft: `3px solid ${token.colorPrimary}`,
                                    background: token.colorPrimaryBg,
                                    padding: `${token.paddingXS}px ${token.padding}px`,
                                    margin: `${token.marginXS}px 0`,
                                    color: token.colorTextSecondary,
                                    fontStyle: "italic",
                                  }}
                                >
                                  {children}
                                </div>
                              ),
                              code({ className, children, ...props }) {
                                const match = /language-(\w+)/.exec(
                                  className || ""
                                );
                                const language = match ? match[1] : "";
                                const isInline = !match && !className;
                                const codeString = String(children).replace(
                                  /\n$/,
                                  ""
                                );

                                if (isInline) {
                                  return (
                                    <Text code className={className} {...props}>
                                      {children}
                                    </Text>
                                  );
                                }

                                return (
                                  <div
                                    style={{
                                      position: "relative",
                                      overflowX: "auto",
                                    }}
                                  >
                                    <SyntaxHighlighter
                                      style={oneDark}
                                      language={language || "text"}
                                      PreTag="div"
                                      customStyle={{
                                        margin: `${token.marginXS}px 0`,
                                        borderRadius: token.borderRadiusSM,
                                        fontSize: token.fontSizeSM,
                                      }}
                                    >
                                      {codeString}
                                    </SyntaxHighlighter>
                                  </div>
                                );
                              },
                            }}
                          >
                            {favorite.content}
                          </ReactMarkdown>
                        </div>

                        {/* Note */}
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

                        {/* Actions */}
                        <Flex
                          justify="flex-end"
                          gap={token.marginXS}
                          wrap="wrap"
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
                              onClick={() =>
                                referenceFavorite(favorite.content)
                              }
                            />
                          </Tooltip>
                          {favorite.messageId && (
                            <Tooltip title="Locate Message">
                              <Button
                                icon={<EnvironmentOutlined />}
                                size="small"
                                type="text"
                                onClick={() =>
                                  favorite.messageId &&
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
                        </Flex>
                      </Space>
                    </Card>
                  </List.Item>
                )}
              />
            )}
          </Flex>
        </Flex>
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

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
  message,
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
import { useChatList } from "../../hooks/useChatList";
import { useChatController } from "../../hooks/useChatController";
import { FavoriteItem } from "../../types/chat";
import { useAppStore } from "../../store";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { ExportService } from "../../services/ExportService";
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
  const { currentChatId, createNewChat } = useChatList();
  const { sendMessage } = useChatController();

  // Get favorites functionality from Zustand store
  const allFavorites = useAppStore((state) => state.favorites);
  const removeFavorite = useAppStore((state) => state.removeFavorite);
  const updateFavorite = useAppStore((state) => state.updateFavorite);

  // Get current chat favorites
  const getCurrentChatFavorites = () => {
    if (!currentChatId) return [];
    return allFavorites.filter((fav) => fav.chatId === currentChatId);
  };

  // Export favorites functionality with improved PDF support
  const exportFavorites = async (format: "markdown" | "pdf") => {
    const chatFavorites = getCurrentChatFavorites();
    if (chatFavorites.length === 0) {
      message.warning("No favorites to export");
      return;
    }

    setIsExporting(true);
    const hideLoading = message.loading(
      `Exporting favorites as ${format.toUpperCase()}...`,
      0
    );

    try {
      if (format === "markdown") {
        const filename = await exportAsMarkdown(chatFavorites);
        message.success({
          content: (
            <div>
              <div>✅ Markdown file exported successfully!</div>
              <div
                style={{ fontSize: "12px", color: "#666", marginTop: "4px" }}
              >
                File name: {filename}
              </div>
              <div style={{ fontSize: "12px", color: "#666" }}>
                Saved to: User selected location
              </div>
            </div>
          ),
          duration: 4,
        });
      } else if (format === "pdf") {
        const filename = await exportAsPDF(chatFavorites);
        message.success({
          content: (
            <div>
              <div>✅ PDF file exported successfully!</div>
              <div
                style={{ fontSize: "12px", color: "#666", marginTop: "4px" }}
              >
                File name: {filename}
              </div>
              <div style={{ fontSize: "12px", color: "#666" }}>
                Saved to: User selected location
              </div>
              <div
                style={{ fontSize: "12px", color: "#52c41a", marginTop: "4px" }}
              >
                💡 File saved to your chosen location, ready to open
              </div>
            </div>
          ),
          duration: 5,
        });
      }
    } catch (error) {
      console.error(`Failed to export as ${format}:`, error);
      message.error(
        `Failed to export favorites as ${format.toUpperCase()}. Please try again.`
      );
    } finally {
      hideLoading();
      setIsExporting(false);
    }
  };

  // Export as Markdown file using unified ExportService
  const exportAsMarkdown = async (
    favorites: FavoriteItem[]
  ): Promise<string> => {
    if (!currentChatId) {
      throw new Error("No chat selected");
    }

    const result = await ExportService.exportFavorites({
      format: "markdown",
      data: favorites,
      chatId: currentChatId,
    });

    if (!result.success) {
      throw new Error(result.error || "Export failed");
    }

    return result.filename;
  };

  // Export as PDF using unified ExportService
  const exportAsPDF = async (favorites: FavoriteItem[]) => {
    if (!currentChatId) {
      throw new Error("No chat selected");
    }

    const result = await ExportService.exportFavorites({
      format: "pdf",
      data: favorites,
      chatId: currentChatId,
    });

    if (!result.success) {
      throw new Error(result.error || "Export failed");
    }

    return result.filename;
  };

  // Summarize favorites functionality - creates new chat with summary request
  const summarizeFavorites = async () => {
    const chatFavorites = getCurrentChatFavorites();
    if (chatFavorites.length === 0) {
      message.warning("No favorites to summarize");
      return;
    }

    setIsSummarizing(true);
    const hideLoading = message.loading("Creating favorites summary...", 0);

    try {
      // Generate summary content
      let summaryContent =
        "Please provide a comprehensive summary of the following favorite messages from our conversation:\n\n";

      chatFavorites.forEach((fav, index) => {
        summaryContent += `### ${
          fav.role === "user" ? "User" : "Assistant"
        } Message ${index + 1}\n`;
        summaryContent += `**Created:** ${formatDate(fav.createdAt)}\n\n`;
        summaryContent += fav.content + "\n\n";

        if (fav.note) {
          summaryContent += `**Note:** ${fav.note}\n\n`;
        }

        summaryContent += "---\n\n";
      });

      summaryContent += "Please analyze these favorites and provide:\n";
      summaryContent +=
        "1. **Key Topics**: Main themes and subjects discussed\n";
      summaryContent +=
        "2. **Important Insights**: Key learnings or conclusions\n";
      summaryContent +=
        "3. **Action Items**: Any tasks or follow-ups mentioned\n";
      summaryContent +=
        "4. **Summary**: A concise overview of the conversation highlights\n\n";
      summaryContent += `Total favorites analyzed: ${chatFavorites.length}`;

      // Create new chat with summary request
      createNewChat(`📋 Favorites Summary - ${formatDate(Date.now())}`);

      // Send the summary content as the first message
      setTimeout(async () => {
        try {
          await sendMessage(summaryContent);
          console.log("Sent favorites summary message to new chat");
        } catch (error) {
          console.error("Failed to send summary message:", error);
        }
      }, 100); // Small delay to ensure chat is created

      message.success("Favorites summary chat created successfully!");
      console.log("Created new chat with favorites summary");
    } catch (error) {
      console.error("Failed to create favorites summary:", error);
      message.error("Failed to create favorites summary. Please try again.");
    } finally {
      hideLoading();
      setIsSummarizing(false);
    }
  };

  // Navigate to message in chat view
  const navigateToMessage = (messageId: string) => {
    if (!messageId) {
      console.warn("No messageId provided for navigation");
      return;
    }

    // Dispatch custom event to ChatView for message navigation
    const event = new CustomEvent("navigate-to-message", {
      detail: { messageId },
    });
    window.dispatchEvent(event);
  };

  const [sortOrder, setSortOrder] = useState<"descending" | "ascending">(
    "descending"
  );
  const [sortField, setSortField] = useState<"createdAt" | "role">("createdAt");
  const [collapsed, setCollapsed] = useState(true);
  const [noteModalVisible, setNoteModalVisible] = useState(false);
  const [currentFavoriteId, setCurrentFavoriteId] = useState<string | null>(
    null
  );
  const [noteText, setNoteText] = useState("");
  const [isExporting, setIsExporting] = useState(false);
  const [isSummarizing, setIsSummarizing] = useState(false);

  // Get favorites for the current chat
  const currentChatFavorites = getCurrentChatFavorites();

  // Sort favorites based on current sorting options
  const sortedFavorites = [...currentChatFavorites].sort((a, b) => {
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

  // Format date for display in English
  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString("en-US", {
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
                  disabled={currentChatFavorites.length === 0}
                  loading={isSummarizing}
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
                <Button
                  icon={<ExportOutlined />}
                  size="small"
                  type="text"
                  loading={isExporting}
                  disabled={currentChatFavorites.length === 0}
                />
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

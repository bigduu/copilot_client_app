import React, { useState, useEffect } from "react";
import {
  Modal,
  List,
  Radio,
  theme,
  Typography,
  Space,
  Empty,
  Tag,
  Button,
  Card,
  message,
} from "antd";
import {
  ModalFooter,
  createCancelButton,
  createOkButton,
} from "../ModalFooter";
import {
  ToolOutlined,
  EyeOutlined,
  EyeInvisibleOutlined,
  CopyOutlined,
} from "@ant-design/icons";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { UserSystemPrompt } from "../../types/chat";
import { useAppStore } from "../../store";

const { Text, Paragraph } = Typography;
const { useToken } = theme;

interface SystemPromptSelectorProps {
  open: boolean;
  onClose: () => void;
  onSelect: (prompt: UserSystemPrompt) => void;
  prompts: UserSystemPrompt[];
  title?: string;
  showCancelButton?: boolean;
}

const SystemPromptSelector: React.FC<SystemPromptSelectorProps> = ({
  open,
  onClose,
  onSelect,
  prompts,
  title = "Select System Prompt",
  showCancelButton = true,
}) => {
  const { token } = useToken();
  const [messageApi, contextHolder] = message.useMessage();
  const lastSelectedPromptId = useAppStore(
    (state) => state.lastSelectedPromptId,
  );
  const setLastSelectedPromptId = useAppStore(
    (state) => state.setLastSelectedPromptId,
  );

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expandedPreviewId, setExpandedPreviewId] = useState<string | null>(
    null,
  );

  const handleCopyPrompt = async (
    event: React.MouseEvent,
    prompt: UserSystemPrompt,
  ) => {
    event.stopPropagation();

    const content = prompt.content ?? "";

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(content);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = content;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }

      messageApi.success(`Copied "${prompt.name}" prompt`);
    } catch (error) {
      console.error("[SystemPromptSelector] Failed to copy prompt:", error);
      messageApi.error("Failed to copy prompt content");
    }
  };

  useEffect(() => {
    if (open) {
      // When the modal opens, initialize the selection with the last used prompt ID
      // or the first default prompt if none was selected.
      const defaultPrompt = prompts.find((p) => p.isDefault);
      setSelectedId(lastSelectedPromptId || defaultPrompt?.id || null);
    }
  }, [open, lastSelectedPromptId, prompts]);

  const handleSelect = (prompt: UserSystemPrompt) => {
    setSelectedId(prompt.id);
    setLastSelectedPromptId(prompt.id);
    onSelect(prompt);
    onClose();
  };

  const handleCancel = () => {
    onClose();
  };

  const renderPromptItem = (prompt: UserSystemPrompt) => {
    const isSelected = selectedId === prompt.id;
    const isExpanded = expandedPreviewId === prompt.id;
    const content = prompt.content || "";
    const lines = content ? content.split(/\r?\n/) : [];
    const nonEmptyLineCount = lines.filter(
      (line) => line.trim().length > 0,
    ).length;
    const wordCount = content.trim()
      ? content.trim().split(/\s+/).filter(Boolean).length
      : 0;
    const characterCount = content.length;
    const showGradient = !isExpanded && characterCount > 600;

    return (
      <List.Item
        key={prompt.id}
        style={{
          cursor: "pointer",
          padding: token.paddingMD,
          borderRadius: token.borderRadius,
          border: isSelected
            ? `2px solid ${token.colorPrimary}`
            : `1px solid ${token.colorBorderSecondary}`,
          marginBottom: token.marginXS,
          backgroundColor: isSelected
            ? token.colorPrimaryBg
            : token.colorBgContainer,
          transition: "all 0.2s ease",
        }}
        onClick={() => setSelectedId(prompt.id)}
      >
        <Space
          direction="vertical"
          style={{ width: "100%" }}
          size={token.marginSM}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              width: "100%",
              gap: token.marginSM,
            }}
          >
            <Space align="start">
              <Radio
                checked={isSelected}
                onChange={() => setSelectedId(prompt.id)}
                onClick={(e) => e.stopPropagation()}
              />
              <div>
                <Text strong>{prompt.name || prompt.id}</Text>
                <div>
                  <Text
                    code
                    style={{
                      fontSize: token.fontSizeSM,
                      color: token.colorTextSecondary,
                    }}
                  >
                    {prompt.id}
                  </Text>
                </div>
              </div>
              {prompt.isDefault && <Tag color="gold">Default</Tag>}
            </Space>

            <Space size="small">
              <Button
                type="text"
                size="small"
                icon={isExpanded ? <EyeInvisibleOutlined /> : <EyeOutlined />}
                onClick={(e) => {
                  e.stopPropagation();
                  setExpandedPreviewId(isExpanded ? null : prompt.id);
                }}
              >
                {isExpanded ? "Hide" : "Preview"}
              </Button>
              <Button
                type="text"
                size="small"
                icon={<CopyOutlined />}
                onClick={(event) => handleCopyPrompt(event, prompt)}
              >
                Copy
              </Button>
            </Space>
          </div>

          {prompt.description && (
            <Text
              type="secondary"
              style={{
                marginLeft: token.marginLG,
                fontSize: token.fontSizeSM,
              }}
            >
              {prompt.description}
            </Text>
          )}

          <Space size="small" wrap style={{ marginLeft: token.marginLG }}>
            <Tag color="geekblue">Lines: {nonEmptyLineCount}</Tag>
            <Tag color="purple">Words: {wordCount}</Tag>
            <Tag color="green">Chars: {characterCount}</Tag>
          </Space>

          {!isExpanded && (
            <Paragraph
              type="secondary"
              ellipsis={{ rows: 3 }}
              style={{
                marginLeft: token.marginLG,
                marginBottom: 0,
                color: token.colorTextSecondary,
              }}
            >
              {content || "No content available."}
            </Paragraph>
          )}

          {isExpanded && (
            <Card
              size="small"
              style={{
                marginLeft: token.marginLG,
                marginTop: token.marginXS,
                backgroundColor: token.colorBgLayout,
                borderColor: token.colorBorderSecondary,
              }}
              bodyStyle={{ padding: token.paddingMD }}
              onClick={(e) => e.stopPropagation()}
            >
              <div
                style={{
                  maxHeight: "60vh",
                  overflowY: "auto",
                  position: "relative",
                  paddingRight: token.paddingXS,
                }}
              >
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    p: ({ children }) => (
                      <Paragraph style={{ marginBottom: token.marginSM }}>
                        {children}
                      </Paragraph>
                    ),
                    ol: ({ children }) => (
                      <ol
                        style={{
                          marginBottom: token.marginSM,
                          paddingLeft: token.paddingLG,
                        }}
                      >
                        {children}
                      </ol>
                    ),
                    ul: ({ children }) => (
                      <ul
                        style={{
                          marginBottom: token.marginSM,
                          paddingLeft: token.paddingLG,
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
                    h1: ({ children }) => (
                      <Text
                        strong
                        style={{
                          fontSize: token.fontSizeHeading3,
                          marginBottom: token.marginSM,
                          display: "block",
                        }}
                      >
                        {children}
                      </Text>
                    ),
                    h2: ({ children }) => (
                      <Text
                        strong
                        style={{
                          fontSize: token.fontSizeHeading4,
                          marginBottom: token.marginSM,
                          display: "block",
                        }}
                      >
                        {children}
                      </Text>
                    ),
                    code: ({ inline, className, children, ...props }: any) => {
                      const match = /language-(\w+)/.exec(className || "");
                      if (!inline) {
                        return (
                          <SyntaxHighlighter
                            style={oneDark}
                            language={match?.[1] || "text"}
                            PreTag="div"
                            wrapLongLines
                          >
                            {String(children).replace(/\n$/, "")}
                          </SyntaxHighlighter>
                        );
                      }

                      return (
                        <code
                          className={className}
                          style={{
                            backgroundColor: token.colorFillTertiary,
                            padding: "0 4px",
                            borderRadius: token.borderRadiusSM,
                            fontSize: token.fontSizeSM,
                          }}
                          {...props}
                        >
                          {children}
                        </code>
                      );
                    },
                  }}
                >
                  {content || "No content available."}
                </ReactMarkdown>

                {showGradient && (
                  <div
                    style={{
                      position: "sticky",
                      bottom: 0,
                      height: 48,
                      background: `linear-gradient(180deg, transparent, ${token.colorBgLayout})`,
                      pointerEvents: "none",
                      marginTop: -48,
                    }}
                  />
                )}
              </div>
            </Card>
          )}
        </Space>
      </List.Item>
    );
  };

  return (
    <>
      {contextHolder}
      <Modal
        title={
          <Space>
            <ToolOutlined />
            {title}
          </Space>
        }
        open={open}
        onCancel={handleCancel}
        width={700}
        footer={
          <ModalFooter
            buttons={[
              ...(showCancelButton ? [createCancelButton(handleCancel)] : []),
              createOkButton(
                () => {
                  const prompt = prompts.find((p) => p.id === selectedId);
                  if (prompt) {
                    handleSelect(prompt);
                  }
                },
                {
                  text: "Create New Chat",
                  disabled: !selectedId,
                },
              ),
            ]}
          />
        }
        styles={{
          body: {
            maxHeight: "70vh",
            overflowY: "auto",
            padding: token.paddingMD,
          },
        }}
      >
        <div style={{ marginBottom: token.marginMD }}>
          <Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
            Select a base system prompt for the AI. You can add or edit prompts
            in the System Settings.
          </Text>
        </div>

        {prompts.length === 0 ? (
          <Empty
            description="No system prompts found. Add one in System Settings."
            style={{ margin: token.marginLG }}
          />
        ) : (
          <List
            dataSource={prompts}
            renderItem={renderPromptItem}
            split={false}
          />
        )}
      </Modal>
    </>
  );
};

export default SystemPromptSelector;

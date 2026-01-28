import React, { useMemo, useState } from "react";
import {
  Button,
  Card,
  Dropdown,
  Flex,
  Input,
  List,
  Tooltip,
  Typography,
  theme,
} from "antd";
import {
  CompressOutlined,
  CopyOutlined,
  DownOutlined,
  ExperimentOutlined,
  ExpandOutlined,
  HistoryOutlined,
  SettingOutlined,
  SendOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons";

const { Text } = Typography;

export type QueuedPrompt = { id: string; prompt: string; model: string };

type ModelOption = {
  id: string;
  name: string;
  description: string;
  short: string;
};

type ThinkingMode = {
  id: string;
  name: string;
  description: string;
  short: string;
};

const MODEL_OPTIONS: ModelOption[] = [
  {
    id: "sonnet",
    name: "Claude 4 Sonnet",
    description: "Faster, efficient for most tasks",
    short: "S",
  },
  {
    id: "opus",
    name: "Claude 4 Opus",
    description: "More capable, better for complex tasks",
    short: "O",
  },
  {
    id: "haiku",
    name: "Claude 3.5 Haiku",
    description: "Fast, lightweight",
    short: "H",
  },
];

const THINKING_MODES: ThinkingMode[] = [
  {
    id: "auto",
    name: "Auto",
    description: "Let Claude decide",
    short: "A",
  },
  {
    id: "think",
    name: "Think",
    description: "Basic reasoning",
    short: "T",
  },
  {
    id: "think_hard",
    name: "Think Hard",
    description: "Deeper analysis",
    short: "T+",
  },
  {
    id: "think_harder",
    name: "Think Harder",
    description: "Extensive reasoning",
    short: "T++",
  },
  {
    id: "ultrathink",
    name: "Ultrathink",
    description: "Maximum computation",
    short: "Ultra",
  },
];

export type AgentInputPanelProps = {
  token: ReturnType<typeof theme.useToken>["token"];
  model: string;
  thinkingMode: string;
  promptDraft: string;
  queuedPrompts: QueuedPrompt[];
  isRunning: boolean;
  projectPathValid: boolean;
  onModelChange: (value: string) => void;
  onThinkingModeChange: (value: string) => void;
  onPromptChange: (value: string) => void;
  onSendPrompt: () => void;
  onRemoveQueuedPrompt: (id: string) => void;
  onOpenTools?: () => void;
  onToolsTabChange?: (value: string) => void;
  onCopyConversation?: () => void;
};

export const AgentInputPanel: React.FC<AgentInputPanelProps> = React.memo(
  ({
    token,
    model,
    thinkingMode,
    promptDraft,
    queuedPrompts,
    isRunning,
    projectPathValid,
    onModelChange,
    onThinkingModeChange,
    onPromptChange,
    onSendPrompt,
    onRemoveQueuedPrompt,
    onOpenTools,
    onToolsTabChange,
    onCopyConversation,
  }: AgentInputPanelProps) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const activeModel = useMemo(
      () => MODEL_OPTIONS.find((option) => option.id === model) ?? null,
      [model],
    );
    const activeThinkingMode = useMemo(
      () => THINKING_MODES.find((option) => option.id === thinkingMode) ?? null,
      [thinkingMode],
    );

    const modelMenu = useMemo(
      () => ({
        items: MODEL_OPTIONS.map((option) => ({
          key: option.id,
          label: (
            <Flex align="center" gap={10}>
              <ThunderboltOutlined />
              <Flex vertical>
                <Text strong>{option.name}</Text>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {option.description}
                </Text>
              </Flex>
            </Flex>
          ),
        })),
        onClick: ({ key }: { key: string }) => onModelChange(key),
      }),
      [onModelChange],
    );

    const thinkingMenu = useMemo(
      () => ({
        items: THINKING_MODES.map((option) => ({
          key: option.id,
          label: (
            <Flex align="center" gap={10}>
              <ExperimentOutlined />
              <Flex vertical>
                <Text strong>{option.name}</Text>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {option.description}
                </Text>
              </Flex>
            </Flex>
          ),
        })),
        onClick: ({ key }: { key: string }) => onThinkingModeChange(key),
      }),
      [onThinkingModeChange],
    );

    const handleOpenToolsTab = (tab: string) => {
      if (!onOpenTools) return;
      if (onToolsTabChange) {
        onToolsTabChange(tab);
      }
      onOpenTools();
    };

    return (
      <div
        style={{
          position: "sticky",
          bottom: 0,
          zIndex: 10,
          background:
            token.colorBgContainer ?? (token.colorBgLayout || "transparent"),
          backdropFilter: "blur(10px)",
          borderTop: `1px solid ${token.colorBorderSecondary}`,
        }}
      >
        <Card
          size="small"
          variant="borderless"
          styles={{ body: { padding: token.paddingSM } }}
          style={{
            borderRadius: token.borderRadius,
            background: "transparent",
            boxShadow: "none",
          }}
        >
          <Flex vertical style={{ gap: token.marginSM }}>
            {queuedPrompts.length ? (
              <Card
                size="small"
                styles={{ body: { padding: token.paddingXS } }}
              >
                <Flex vertical style={{ gap: token.marginXS }}>
                  <Text type="secondary">Queued prompts</Text>
                  <List
                    size="small"
                    dataSource={queuedPrompts}
                    renderItem={(item) => (
                      <List.Item
                        actions={[
                          <Button
                            key="remove"
                            size="small"
                            onClick={() => onRemoveQueuedPrompt(item.id)}
                          >
                            Remove
                          </Button>,
                        ]}
                      >
                        <Flex vertical style={{ minWidth: 0 }}>
                          <Text ellipsis>{item.prompt}</Text>
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            {item.model}
                          </Text>
                        </Flex>
                      </List.Item>
                    )}
                  />
                </Flex>
              </Card>
            ) : null}

            <div
              className="agent-input-bar"
              style={{
                background: token.colorBgElevated,
                border: `1px solid ${token.colorBorderSecondary}`,
              }}
            >
              <Flex align="center" className="agent-input-left">
                <Dropdown
                  menu={modelMenu}
                  trigger={["click"]}
                  placement="topLeft"
                  overlayClassName="agent-input-dropdown"
                >
                  <Button
                    type="text"
                    size="small"
                    className="agent-input-chip"
                    style={{
                      background: token.colorFillSecondary,
                      border: `1px solid ${token.colorBorderSecondary}`,
                    }}
                    disabled={isRunning}
                  >
                    <ThunderboltOutlined />
                    <span className="agent-input-chip-label">
                      {activeModel?.short ?? model}
                    </span>
                    <DownOutlined className="agent-input-chip-caret" />
                  </Button>
                </Dropdown>
                <Dropdown
                  menu={thinkingMenu}
                  trigger={["click"]}
                  placement="topLeft"
                  overlayClassName="agent-input-dropdown"
                >
                  <Button
                    type="text"
                    size="small"
                    className="agent-input-chip"
                    style={{
                      background: token.colorFillSecondary,
                      border: `1px solid ${token.colorBorderSecondary}`,
                    }}
                    disabled={isRunning}
                  >
                    <ExperimentOutlined />
                    <span className="agent-input-chip-label">
                      {activeThinkingMode?.short ?? "A"}
                    </span>
                    <DownOutlined className="agent-input-chip-caret" />
                  </Button>
                </Dropdown>
              </Flex>

              <Input.TextArea
                value={promptDraft}
                onChange={(e) => onPromptChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== "Enter" || e.shiftKey) return;
                  const nativeEvent = e.nativeEvent as any;
                  if (nativeEvent?.isComposing) return;
                  e.preventDefault();
                  onSendPrompt();
                }}
                placeholder="Message Claude (@ for files, / for commands)..."
                autoSize={
                  isExpanded
                    ? { minRows: 4, maxRows: 12 }
                    : { minRows: 1, maxRows: 6 }
                }
                disabled={isRunning}
                className="agent-input-textarea"
              />

              <Flex align="center" className="agent-input-right">
                <Tooltip title={isExpanded ? "Collapse" : "Expand"}>
                  <Button
                    type="text"
                    size="small"
                    icon={isExpanded ? <CompressOutlined /> : <ExpandOutlined />}
                    className="agent-input-icon"
                    onClick={() => setIsExpanded((prev) => !prev)}
                    disabled={isRunning}
                  />
                </Tooltip>
                <Tooltip title="Send message (Enter)">
                  <Button
                    type="primary"
                    shape="circle"
                    icon={<SendOutlined />}
                    onClick={onSendPrompt}
                    loading={isRunning}
                    disabled={!projectPathValid}
                  />
                </Tooltip>
                <Tooltip title="Session Timeline">
                  <Button
                    type="text"
                    size="small"
                    icon={<HistoryOutlined />}
                    className="agent-input-icon"
                    onClick={() => handleOpenToolsTab("timeline")}
                    disabled={!onOpenTools}
                  />
                </Tooltip>
                <Tooltip title="Copy conversation">
                  <Button
                    type="text"
                    size="small"
                    icon={<CopyOutlined />}
                    className="agent-input-icon"
                    onClick={onCopyConversation}
                    disabled={!onCopyConversation}
                  />
                </Tooltip>
                <Tooltip title="Checkpoint Settings">
                  <Button
                    type="text"
                    size="small"
                    icon={<SettingOutlined />}
                    className="agent-input-icon"
                    onClick={() => handleOpenToolsTab("timeline")}
                    disabled={!onOpenTools}
                  />
                </Tooltip>
              </Flex>
            </div>
          </Flex>
        </Card>
      </div>
    );
  },
);

AgentInputPanel.displayName = "AgentInputPanel";

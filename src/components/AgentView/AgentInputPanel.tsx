import React from "react";
import {
  AutoComplete,
  Button,
  Card,
  Flex,
  Input,
  List,
  Typography,
  theme,
} from "antd";

const { Text } = Typography;

export type QueuedPrompt = { id: string; prompt: string; model: string };

export type AgentInputPanelProps = {
  token: ReturnType<typeof theme.useToken>["token"];
  model: string;
  promptDraft: string;
  queuedPrompts: QueuedPrompt[];
  isRunning: boolean;
  projectPathValid: boolean;
  selectedSessionId: string | null;
  onModelChange: (value: string) => void;
  onPromptChange: (value: string) => void;
  onSendPrompt: () => void;
  onStartRun: () => void;
  onContinueRun: () => void;
  onResumeRun: () => void;
  onRemoveQueuedPrompt: (id: string) => void;
};

export const AgentInputPanel: React.FC<AgentInputPanelProps> = React.memo(
  ({
    token,
    model,
    promptDraft,
    queuedPrompts,
    isRunning,
    projectPathValid,
    selectedSessionId,
    onModelChange,
    onPromptChange,
    onSendPrompt,
    onStartRun,
    onContinueRun,
    onResumeRun,
    onRemoveQueuedPrompt,
  }: AgentInputPanelProps) => {
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
            <Flex
              align="center"
              style={{ gap: token.marginSM, flexWrap: "wrap" }}
            >
              <AutoComplete
                value={model}
                onChange={(value) => onModelChange(value)}
                options={[
                  { value: "sonnet" },
                  { value: "haiku" },
                  { value: "opus" },
                ]}
                style={{ minWidth: 220 }}
                placeholder="Model (e.g. sonnet / opus)"
              />
            </Flex>

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
              placeholder="Enter a prompt for Claude Code"
              autoSize={{ minRows: 2, maxRows: 8 }}
              disabled={isRunning}
            />

            <Flex style={{ gap: token.marginSM, flexWrap: "wrap" }}>
              <Button
                type="primary"
                onClick={onSendPrompt}
                loading={isRunning}
                disabled={!projectPathValid}
              >
                Send
              </Button>
              <Button
                onClick={onStartRun}
                disabled={isRunning || !projectPathValid}
              >
                New Session
              </Button>
              <Button
                onClick={onContinueRun}
                disabled={isRunning || !projectPathValid}
              >
                Continue
              </Button>
              <Button
                onClick={onResumeRun}
                disabled={isRunning || !selectedSessionId || !projectPathValid}
              >
                Resume
              </Button>
            </Flex>
          </Flex>
        </Card>
      </div>
    );
  },
);

AgentInputPanel.displayName = "AgentInputPanel";

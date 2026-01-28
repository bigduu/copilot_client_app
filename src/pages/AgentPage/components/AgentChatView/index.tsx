import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { FloatButton, Card, Flex, Tag, Typography, theme } from "antd";
import { DownOutlined } from "@ant-design/icons";

import type { ClaudeStreamMessage } from "../ClaudeStream";
import { AgentChatSystemInitCard } from "./AgentChatSystemInitCard";
import { renderAssistantParts } from "./agentChatRenderParts";
import {
  buildToolResultsMap,
  extractTextFromParts,
  getStableEntryKey,
  inferRole,
  isSystemInitEntry,
  isTextPart,
  isToolResultOnlyUserEntry,
  normalizeContentParts,
} from "./agentChatViewUtils";

const { Text } = Typography;

export const AgentChatView: React.FC<{
  entries: ClaudeStreamMessage[];
  autoScrollToken?: any;
  onAskUserAnswer?: (payload: { prompt: string; sessionId?: string }) => void;
  isRunning?: boolean;
}> = ({ entries, autoScrollToken, onAskUserAnswer, isRunning }) => {
  const { token } = theme.useToken();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);

  const toolResults = useMemo(() => buildToolResultsMap(entries), [entries]);
  const systemInitEntry = useMemo(() => {
    const initEntries = entries.filter((entry) => isSystemInitEntry(entry));
    return initEntries.length ? initEntries[initEntries.length - 1] : null;
  }, [entries]);

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, []);

  const updateScrollState = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const threshold = 48;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    setShowScrollToBottom(distance > threshold);
  }, []);

  useEffect(() => {
    if (autoScrollToken === undefined) return;
    scrollToBottom();
    setShowScrollToBottom(false);
  }, [autoScrollToken, scrollToBottom]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    updateScrollState();
    el.addEventListener("scroll", updateScrollState, { passive: true });
    return () => {
      el.removeEventListener("scroll", updateScrollState);
    };
  }, [updateScrollState, entries.length]);

  return (
    <div style={{ position: "relative", height: "100%", overflow: "hidden" }}>
      <div
        ref={scrollRef}
        style={{
          height: "100%",
          overflow: "auto",
          padding: token.paddingSM,
          background: token.colorBgContainer,
        }}
      >
        <Flex vertical gap={token.marginSM}>
          {systemInitEntry ? (
            <Flex key="system-init" justify="center">
              <div style={{ width: "min(780px, 100%)" }}>
                <AgentChatSystemInitCard entry={systemInitEntry} />
              </div>
            </Flex>
          ) : null}
          {entries.map((entry, idx) => {
            if (isToolResultOnlyUserEntry(entry)) {
              return null;
            }
            if (isSystemInitEntry(entry)) {
              return null;
            }

            const role = inferRole(entry);
            const align = role === "user" ? "flex-end" : "flex-start";
            const bubbleBg =
              role === "user" ? token.colorPrimaryBg : token.colorBgElevated;
            const headerTags: React.ReactNode[] = [];
            headerTags.push(
              <Tag
                key="type"
                color={
                  role === "user"
                    ? "blue"
                    : role === "assistant"
                      ? "purple"
                      : "default"
                }
              >
                {role}
              </Tag>,
            );
            if (entry.subtype) {
              headerTags.push(
                <Tag key="subtype" color="geekblue">
                  {entry.subtype}
                </Tag>,
              );
            }

            const parts = normalizeContentParts(entry.message?.content);
            const key = getStableEntryKey(entry, idx);
            const sessionId = entry.session_id ?? entry.sessionId;

            if (role === "system") {
              const maybeText = extractTextFromParts(parts).join("\n").trim();
              if (!maybeText) {
                return null;
              }
              return (
                <Flex key={key} justify="center">
                  <Card
                    size="small"
                    styles={{ body: { padding: token.paddingXS } }}
                  >
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {maybeText}
                    </Text>
                  </Card>
                </Flex>
              );
            }

            return (
              <Flex key={key} justify={align}>
                <div style={{ width: "min(780px, 100%)" }}>
                  <Card
                    size="small"
                    styles={{ body: { padding: token.paddingSM } }}
                    style={{
                      borderRadius: token.borderRadiusLG,
                      background: bubbleBg,
                      border:
                        role === "user"
                          ? `1px solid ${token.colorPrimaryBorder}`
                          : `1px solid ${token.colorBorderSecondary}`,
                    }}
                  >
                    <Flex vertical gap={8}>
                      <Flex align="center" gap={8} wrap style={{ minWidth: 0 }}>
                        {headerTags}
                        {entry.timestamp ? (
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            {entry.timestamp}
                          </Text>
                        ) : null}
                      </Flex>

                      {parts.length
                        ? role === "assistant"
                          ? renderAssistantParts(
                              parts,
                              toolResults,
                              key,
                              sessionId,
                              onAskUserAnswer,
                              isRunning,
                            )
                          : renderAssistantParts(
                              parts.filter((p) => isTextPart(p)),
                              toolResults,
                              key,
                              sessionId,
                              onAskUserAnswer,
                              isRunning,
                            )
                        : null}
                    </Flex>
                  </Card>
                </div>
              </Flex>
            );
          })}
          {isRunning ? (
            <Flex justify="center">
              <div
                className="agent-running-indicator"
                style={{
                  background: token.colorFillSecondary,
                  color: token.colorTextSecondary,
                  border: `1px solid ${token.colorBorderSecondary}`,
                }}
              >
                <span>Running</span>
                <span className="agent-running-dots" aria-hidden="true" />
              </div>
            </Flex>
          ) : null}
        </Flex>
      </div>
      {showScrollToBottom ? (
        <FloatButton
          type="primary"
          icon={<DownOutlined />}
          onClick={scrollToBottom}
          style={{
            position: "absolute",
            right: token.marginSM,
            bottom: token.marginSM,
            boxShadow: token.boxShadowSecondary,
          }}
        />
      ) : null}
    </div>
  );
};

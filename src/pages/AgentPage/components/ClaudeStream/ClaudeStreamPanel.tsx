import React, { useEffect, useMemo, useRef, useState } from "react";
import { Card, Empty, Flex, Input, Tabs, theme, Typography } from "antd";

import { ClaudeEntryCard } from "./ClaudeEntryCard";
import type { ClaudeStreamMessage } from "./types";

const { Text } = Typography;

export const ClaudeStreamPanel: React.FC<{
  title: string;
  entries: ClaudeStreamMessage[];
  rawText?: string;
  autoScroll?: boolean;
}> = ({ title, entries, rawText, autoScroll = false }) => {
  const { token } = theme.useToken();
  const [view, setView] = useState<"rendered" | "raw">("rendered");
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!autoScroll) return;
    if (view !== "rendered") return;
    const el = containerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [autoScroll, entries.length, view]);

  const resolvedRaw = useMemo(() => {
    if (typeof rawText === "string") return rawText;
    if (!entries.length) return "";
    try {
      return entries.map((e) => JSON.stringify(e)).join("\n");
    } catch {
      return "";
    }
  }, [entries, rawText]);

  return (
    <Card
      size="small"
      title={title}
      style={{ flex: 1, minWidth: 0, overflow: "hidden" }}
      styles={{ body: { height: "100%", overflow: "hidden" } }}
    >
      <Tabs
        size="small"
        activeKey={view}
        onChange={(value) => setView(value as any)}
        style={{ height: "100%" }}
        items={[
          {
            key: "rendered",
            label: "Rendered",
            children: (
              <div
                ref={containerRef}
                style={{
                  height: "100%",
                  overflow: "auto",
                  paddingRight: 2,
                }}
              >
                {entries.length ? (
                  <Flex vertical gap={token.marginSM}>
                    {entries.map((entry, idx) => (
                      <ClaudeEntryCard
                        key={`${entry.type}-${entry.subtype ?? ""}-${entry.timestamp ?? ""}-${idx}`}
                        entry={entry}
                      />
                    ))}
                  </Flex>
                ) : (
                  <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description={<Text type="secondary">No entries</Text>}
                  />
                )}
              </div>
            ),
          },
          {
            key: "raw",
            label: "Raw",
            children: (
              <Input.TextArea
                readOnly
                value={resolvedRaw}
                style={{
                  height: "100%",
                  fontSize: 12,
                  fontFamily:
                    "SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                }}
              />
            ),
          },
        ]}
      />
    </Card>
  );
};

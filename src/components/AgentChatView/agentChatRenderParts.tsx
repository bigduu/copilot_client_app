import React from "react";
import { Collapse, Flex } from "antd";

import type { ClaudeContentPart } from "../ClaudeStream";
import { AgentChatAskUserQuestionBlock } from "./AgentChatAskUserQuestionBlock";
import { AgentChatMarkdown } from "./AgentChatMarkdown";
import { AgentChatToolResultBlock } from "./AgentChatToolResultBlock";
import { AgentChatToolUseBlock } from "./AgentChatToolUseBlock";
import { formatJson } from "./agentChatFormatters";
import { isAskUserQuestionTool } from "./agentChatToolUtils";
import {
  getTextValue,
  isTextPart,
  isToolResultPart,
  isToolUsePart,
} from "./agentChatViewUtils";

export const renderAssistantParts = (
  parts: ClaudeContentPart[],
  toolResults: Map<string, any>,
  keyPrefix: string,
  sessionId?: string,
  onAskUserAnswer?: (payload: { prompt: string; sessionId?: string }) => void,
  isRunning?: boolean,
) => {
  return (
    <Flex vertical gap={8}>
      {parts.map((part, idx) => {
        const key = `${keyPrefix}-${idx}`;
        if (isTextPart(part)) {
          const value = getTextValue(part);
          if (!value.trim()) return null;
          return <AgentChatMarkdown key={key} value={value} />;
        }
        if (isToolUsePart(part)) {
          const result = part.id ? toolResults.get(part.id) : null;
          if (isAskUserQuestionTool(part)) {
            return (
              <AgentChatAskUserQuestionBlock
                key={key}
                part={part}
                toolResult={result}
                sessionId={sessionId}
                onAnswer={onAskUserAnswer}
                isRunning={isRunning}
              />
            );
          }
          return (
            <Flex key={key} vertical gap={8}>
              <AgentChatToolUseBlock part={part} />
              {result ? (
                <AgentChatToolResultBlock part={result} toolUse={part} />
              ) : null}
            </Flex>
          );
        }
        if (isToolResultPart(part)) {
          return null;
        }
        if ((part as any)?.type === "thinking") {
          const thinking = (part as any)?.thinking;
          if (typeof thinking !== "string" || !thinking.trim()) return null;
          return (
            <Collapse
              key={key}
              size="small"
              items={[
                {
                  key: "thinking",
                  label: "Thinking",
                  children: (
                    <pre
                      style={{
                        margin: 0,
                        fontSize: 12,
                        whiteSpace: "pre-wrap",
                      }}
                    >
                      {thinking}
                    </pre>
                  ),
                },
              ]}
            />
          );
        }
        return (
          <pre
            key={key}
            style={{ margin: 0, fontSize: 12, whiteSpace: "pre-wrap" }}
          >
            {formatJson(part)}
          </pre>
        );
      })}
    </Flex>
  );
};

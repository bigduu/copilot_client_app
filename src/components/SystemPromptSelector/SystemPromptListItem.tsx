import React, { useMemo } from "react";
import { Button, List, Radio, Space, Tag, Typography } from "antd";
import {
  CopyOutlined,
  EyeInvisibleOutlined,
  EyeOutlined,
} from "@ant-design/icons";

import type { UserSystemPrompt } from "../../types/chat";
import { SystemPromptPreview } from "./SystemPromptPreview";

const { Text, Paragraph } = Typography;

type SystemPromptListItemProps = {
  prompt: UserSystemPrompt;
  token: any;
  isSelected: boolean;
  isExpanded: boolean;
  onSelect: (promptId: string) => void;
  onToggleExpand: (promptId: string) => void;
  onCopy: (event: React.MouseEvent, prompt: UserSystemPrompt) => void;
};

export const SystemPromptListItem: React.FC<SystemPromptListItemProps> = ({
  prompt,
  token,
  isSelected,
  isExpanded,
  onSelect,
  onToggleExpand,
  onCopy,
}) => {
  const content = prompt.content || "";
  const { nonEmptyLineCount, wordCount, characterCount, showGradient } =
    useMemo(() => {
      const lines = content ? content.split(/\r?\n/) : [];
      const nonEmpty = lines.filter((line) => line.trim().length > 0).length;
      const words = content.trim()
        ? content.trim().split(/\s+/).filter(Boolean).length
        : 0;
      const chars = content.length;
      return {
        nonEmptyLineCount: nonEmpty,
        wordCount: words,
        characterCount: chars,
        showGradient: !isExpanded && chars > 600,
      };
    }, [content, isExpanded]);

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
      onClick={() => onSelect(prompt.id)}
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
              onChange={() => onSelect(prompt.id)}
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
            {prompt.isDefault ? <Tag color="gold">Default</Tag> : null}
          </Space>

          <Space size="small">
            <Button
              type="text"
              size="small"
              icon={isExpanded ? <EyeInvisibleOutlined /> : <EyeOutlined />}
              onClick={(e) => {
                e.stopPropagation();
                onToggleExpand(prompt.id);
              }}
            >
              {isExpanded ? "Hide" : "Preview"}
            </Button>
            <Button
              type="text"
              size="small"
              icon={<CopyOutlined />}
              onClick={(event) => onCopy(event, prompt)}
            >
              Copy
            </Button>
          </Space>
        </div>

        {prompt.description ? (
          <Text
            type="secondary"
            style={{
              marginLeft: token.marginLG,
              fontSize: token.fontSizeSM,
            }}
          >
            {prompt.description}
          </Text>
        ) : null}

        <Space size="small" wrap style={{ marginLeft: token.marginLG }}>
          <Tag color="geekblue">Lines: {nonEmptyLineCount}</Tag>
          <Tag color="purple">Words: {wordCount}</Tag>
          <Tag color="green">Chars: {characterCount}</Tag>
        </Space>

        {!isExpanded ? (
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
        ) : (
          <SystemPromptPreview
            content={content}
            token={token}
            showGradient={showGradient}
            onClick={(e) => e.stopPropagation()}
          />
        )}
      </Space>
    </List.Item>
  );
};

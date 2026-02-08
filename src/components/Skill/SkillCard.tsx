import React from "react";
import { Card, Space, Tag, Typography, theme } from "antd";
import type { SkillDefinition } from "../../pages/ChatPage/types/skill";

const { Text } = Typography;

interface SkillCardProps {
  skill: SkillDefinition;
}

export const SkillCard: React.FC<SkillCardProps> = ({ skill }) => {
  const { token } = theme.useToken();

  return (
    <Card
      title={
        <Space size={token.marginXS} wrap>
          <span>{skill.name}</span>
          {skill.category && <Tag color="blue">{skill.category}</Tag>}
        </Space>
      }
      styles={{ body: { padding: token.paddingMD } }}
    >
      <Space direction="vertical" size={token.marginXS} style={{ width: "100%" }}>
        <Text type="secondary">{skill.description}</Text>
        {skill.tags.length > 0 && (
          <Space size={token.marginXXS} wrap>
            {skill.tags.map((tag) => (
              <Tag key={tag}>{tag}</Tag>
            ))}
          </Space>
        )}
      </Space>
    </Card>
  );
};

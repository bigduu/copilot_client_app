import React from "react";
import { Button, Card, Flex, Popconfirm, Space, Switch, Tag, Typography, theme } from "antd";
import { DeleteOutlined, EditOutlined } from "@ant-design/icons";
import type { SkillDefinition } from "../../types/skill";

const { Text } = Typography;

interface SkillCardProps {
  skill: SkillDefinition;
  isEnabled: boolean;
  onToggleEnable: (enabled: boolean) => void;
  onEdit: () => void;
  onDelete: () => void;
}

export const SkillCard: React.FC<SkillCardProps> = ({
  skill,
  isEnabled,
  onToggleEnable,
  onEdit,
  onDelete,
}) => {
  const { token } = theme.useToken();

  return (
    <Card
      title={
        <Space size={token.marginXS} wrap>
          <span>{skill.name}</span>
          {skill.category && <Tag color="blue">{skill.category}</Tag>}
        </Space>
      }
      extra={<Switch checked={isEnabled} onChange={onToggleEnable} />}
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
        <Flex justify="flex-end" gap={token.marginXS} wrap="wrap">
          <Button type="text" icon={<EditOutlined />} onClick={onEdit}>
            Edit
          </Button>
          <Popconfirm
            title="Delete this skill?"
            onConfirm={onDelete}
            okText="Delete"
            cancelText="Cancel"
          >
            <Button type="text" danger icon={<DeleteOutlined />}>
              Delete
            </Button>
          </Popconfirm>
        </Flex>
      </Space>
    </Card>
  );
};

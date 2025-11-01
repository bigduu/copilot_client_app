import React from "react";
import { Select, Space, Typography, Badge } from "antd";
import { BranchesOutlined } from "@ant-design/icons";

const { Text } = Typography;

interface BranchInfo {
  name: string;
  system_prompt?: {
    id: string;
    content: string;
  };
  user_prompt?: string;
  message_count: number;
}

interface BranchSelectorProps {
  branches: BranchInfo[];
  currentBranch: string;
  onBranchChange: (branchName: string) => void;
  disabled?: boolean;
}

export const BranchSelector: React.FC<BranchSelectorProps> = ({
  branches,
  currentBranch,
  onBranchChange,
  disabled = false,
}) => {
  // Only show selector if there are multiple branches
  if (branches.length <= 1) {
    return null;
  }

  return (
    <Space align="center" size="small">
      <BranchesOutlined style={{ fontSize: 16 }} />
      <Text type="secondary" style={{ fontSize: 12 }}>
        Branch:
      </Text>
      <Select
        value={currentBranch}
        onChange={onBranchChange}
        disabled={disabled}
        style={{ minWidth: 150 }}
        size="small"
        options={branches.map((branch) => ({
          value: branch.name,
          label: (
            <Space>
              <Text>{branch.name}</Text>
              <Badge
                count={branch.message_count}
                showZero
                style={{ backgroundColor: "#52c41a" }}
              />
            </Space>
          ),
        }))}
      />
    </Space>
  );
};



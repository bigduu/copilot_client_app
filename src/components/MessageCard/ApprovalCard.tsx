import React from "react";
import {
  Card,
  Button,
  Typography,
  Space,
  Descriptions,
  theme,
  Tag,
  Flex,
} from "antd";
import { CheckOutlined, CloseOutlined } from "@ant-design/icons";

const { Text, Title } = Typography;

export interface ApprovalData {
  tool_call: string;
  parameters: Array<{ name: string; value: string }>;
  approval?: boolean;
  approval_status?: "pending" | "approved" | "rejected";
  display_preference?: "Visible" | "Collapsible" | "Hidden";
}

interface ApprovalCardProps {
  data: ApprovalData;
  onApprove: () => void;
  onReject: () => void;
  disabled?: boolean;
}

const ApprovalCard: React.FC<ApprovalCardProps> = ({
  data,
  onApprove,
  onReject,
  disabled = false,
}) => {
  const { token } = theme.useToken();

  const items = data.parameters.map((param, index) => ({
    key: index.toString(),
    label: param.name,
    children: (
      <Text code style={{ fontSize: token.fontSizeSM }}>
        {param.value}
      </Text>
    ),
  }));

  return (
    <Card
      size="small"
      style={{
        backgroundColor: token.colorInfoBg,
        borderColor: token.colorInfoBorder,
        borderRadius: token.borderRadiusLG,
      }}
    >
      <Space direction="vertical" style={{ width: "100%" }} size="middle">
        <Flex vertical>
          <Title level={5} style={{ margin: 0, color: token.colorInfo }}>
            🔧 Workflow Execution Request
          </Title>
          <Space align="center" size="small">
            <Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
              The AI wants to execute the following workflow
            </Text>
            {data.approval_status && (
              <Tag
                color={
                  data.approval_status === "approved"
                    ? "green"
                    : data.approval_status === "rejected"
                      ? "red"
                      : "gold"
                }
              >
                {data.approval_status.toUpperCase()}
              </Tag>
            )}
          </Space>
        </Flex>

        <Flex align="center" gap={token.marginXS} wrap="wrap">
          <Text strong>Workflow: </Text>
          <Text code style={{ fontSize: token.fontSize }}>
            {data.tool_call}
          </Text>
        </Flex>

        {data.parameters.length > 0 && (
          <Flex vertical>
            <Text
              strong
              style={{ marginBottom: token.marginXS, display: "block" }}
            >
              Parameters:
            </Text>
            <Descriptions
              size="small"
              column={1}
              items={items}
              style={{
                backgroundColor: token.colorBgContainer,
                borderRadius: token.borderRadius,
              }}
            />
          </Flex>
        )}

        <Space style={{ width: "100%", justifyContent: "center" }}>
          <Button
            type="primary"
            icon={<CheckOutlined />}
            onClick={onApprove}
            disabled={
              disabled ||
              data.approval_status === "approved" ||
              data.approval_status === "rejected"
            }
            style={{
              backgroundColor: token.colorSuccess,
              borderColor: token.colorSuccess,
            }}
          >
            Approve
          </Button>
          <Button
            danger
            icon={<CloseOutlined />}
            onClick={onReject}
            disabled={
              disabled ||
              data.approval_status === "approved" ||
              data.approval_status === "rejected"
            }
          >
            Reject
          </Button>
        </Space>
      </Space>
    </Card>
  );
};

export default ApprovalCard;

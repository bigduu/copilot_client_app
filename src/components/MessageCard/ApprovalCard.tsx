import React from 'react';
import { Card, Button, Typography, Space, Descriptions, theme } from 'antd';
import { CheckOutlined, CloseOutlined } from '@ant-design/icons';

const { Text, Title } = Typography;

export interface ApprovalData {
  tool_call: string;
  parameters: Array<{ name: string; value: string }>;
  approval?: boolean;
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
      <Space direction="vertical" style={{ width: '100%' }} size="middle">
        <div>
          <Title level={5} style={{ margin: 0, color: token.colorInfo }}>
            🔧 Tool Execution Request
          </Title>
          <Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
            The AI wants to execute the following tool
          </Text>
        </div>

        <div>
          <Text strong>Tool: </Text>
          <Text code style={{ fontSize: token.fontSize }}>
            {data.tool_call}
          </Text>
        </div>

        {data.parameters.length > 0 && (
          <div>
            <Text strong style={{ marginBottom: token.marginXS, display: 'block' }}>
              Parameters:
            </Text>
            <Descriptions
              size="small"
              column={1}
              items={items}
              bordered
              style={{
                backgroundColor: token.colorBgContainer,
                borderRadius: token.borderRadius,
              }}
            />
          </div>
        )}

        <Space style={{ width: '100%', justifyContent: 'center' }}>
          <Button
            type="primary"
            icon={<CheckOutlined />}
            onClick={onApprove}
            disabled={disabled}
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
            disabled={disabled}
          >
            Reject
          </Button>
        </Space>
      </Space>
    </Card>
  );
};

export default ApprovalCard;

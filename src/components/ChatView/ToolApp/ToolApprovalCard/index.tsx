import React from "react";
import {
  Card,
  Space,
  Typography,
  Tag,
  Button,
  Alert,
  Descriptions,
  theme,
} from "antd";
import { CheckOutlined, CloseOutlined } from "@ant-design/icons";
import { ToolCall } from "../../../../utils/toolParser";

const { Title, Text } = Typography;
const { useToken } = theme;

interface ToolApprovalCardProps {
  toolCall: ToolCall;
  onApprove: (toolCall: ToolCall) => void;
  onReject: (toolCall: ToolCall) => void;
}

export const ToolApprovalCard: React.FC<ToolApprovalCardProps> = ({
  toolCall,
  onApprove,
  onReject,
}) => {
  const { token } = useToken();

  // 根据工具类型选择不同的图标
  const getToolIcon = () => {
    switch (toolCall.tool_name) {
      case "execute_command":
        return "💻";
      case "create_file":
      case "update_file":
      case "delete_file":
        return "📄";
      case "search_files":
        return "🔍";
      default:
        return "🛠️";
    }
  };

  // 获取工具参数的友好展示
  const renderParameters = () => {
    const params = toolCall.parameters;

    if (toolCall.tool_name === "execute_command" && params.command) {
      return (
        <Alert
          type="info"
          message="Command"
          description={
            <Text
              code
              style={{
                display: "block",
                whiteSpace: "pre-wrap",
                wordBreak: "break-all",
                backgroundColor: token.colorBgLayout,
                padding: token.paddingXS,
                borderRadius: token.borderRadiusSM,
                marginTop: token.marginXS,
              }}
            >
              {params.command}
            </Text>
          }
          style={{ marginBottom: 0 }}
        />
      );
    }

    const items = Object.entries(params).map(([key, value]) => ({
      key,
      label: <Text strong>{key}</Text>,
      children: (
        <Text>{typeof value === "string" ? value : JSON.stringify(value)}</Text>
      ),
    }));

    return (
      <Descriptions
        size="small"
        column={1}
        items={items}
        style={{ marginBottom: 0 }}
      />
    );
  };

  // 获取工具类型的友好名称
  const getToolTypeName = () => {
    return toolCall.tool_type === "local" ? "Local Tool" : "MCP Tool";
  };

  // 获取工具的友好名称
  const getToolName = () => {
    return toolCall.tool_name;
  };

  // 获取状态标签
  const getStatusTag = () => {
    if (toolCall.requires_approval) {
      return <Tag color="error">Need Approval</Tag>;
    }
    return <Tag color="success">Safe Tool</Tag>;
  };

  return (
    <Card
      style={{
        marginBottom: token.marginSM,
        borderLeft: `4px solid ${
          toolCall.requires_approval ? token.colorError : token.colorSuccess
        }`,
        borderRadius: token.borderRadiusLG,
        boxShadow: token.boxShadow,
      }}
      hoverable
    >
      <Space direction="vertical" size="middle" style={{ width: "100%" }}>
        {/* Header */}
        <Space size="middle" align="start" style={{ width: "100%" }}>
          <div style={{ fontSize: "24px" }}>{getToolIcon()}</div>
          <Space direction="vertical" size="small" style={{ flex: 1 }}>
            <Title level={5} style={{ margin: 0 }}>
              {getToolName()}
            </Title>
            <Space size="small">
              <Tag color="blue">{getToolTypeName()}</Tag>
              {getStatusTag()}
            </Space>
          </Space>
        </Space>

        {/* Content */}
        <div>{renderParameters()}</div>

        {/* Actions */}
        <Space style={{ justifyContent: "flex-end", width: "100%" }}>
          <Button
            type="primary"
            icon={<CheckOutlined />}
            onClick={() => onApprove(toolCall)}
          >
            Approve
          </Button>
          <Button icon={<CloseOutlined />} onClick={() => onReject(toolCall)}>
            Reject
          </Button>
        </Space>
      </Space>
    </Card>
  );
};

export default ToolApprovalCard;

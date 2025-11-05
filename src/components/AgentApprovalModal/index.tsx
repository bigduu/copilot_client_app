import React, { useState } from "react";
import {
  Modal,
  Button,
  Typography,
  Descriptions,
  Alert,
  Input,
  Space,
} from "antd";
import { ExclamationCircleOutlined } from "@ant-design/icons";

const { Text, Paragraph, Title } = Typography;
const { TextArea } = Input;

interface AgentApprovalModalProps {
  visible: boolean;
  requestId: string;
  toolName: string;
  toolDescription: string;
  parameters: Record<string, any>;
  onApprove: (requestId: string) => void;
  onReject: (requestId: string, reason?: string) => void;
  loading?: boolean;
}

export const AgentApprovalModal: React.FC<AgentApprovalModalProps> = ({
  visible,
  requestId,
  toolName,
  toolDescription,
  parameters,
  onApprove,
  onReject,
  loading = false,
}) => {
  const [rejectionReason, setRejectionReason] = useState("");
  const [showReasonInput, setShowReasonInput] = useState(false);

  const handleReject = () => {
    if (showReasonInput) {
      onReject(requestId, rejectionReason || undefined);
      setRejectionReason("");
      setShowReasonInput(false);
    } else {
      setShowReasonInput(true);
    }
  };

  const handleCancel = () => {
    setShowReasonInput(false);
    setRejectionReason("");
  };

  const handleApprove = () => {
    onApprove(requestId);
  };

  return (
    <Modal
      title={
        <Space>
          <ExclamationCircleOutlined style={{ color: "#faad14" }} />
          <span>Agent Tool Call Approval</span>
        </Space>
      }
      open={visible}
      onCancel={handleCancel}
      maskClosable={false}
      footer={[
        showReasonInput ? (
          <Button
            key="back"
            onClick={() => setShowReasonInput(false)}
            disabled={loading}
          >
            Back
          </Button>
        ) : (
          <Button key="reject" danger onClick={handleReject} disabled={loading}>
            Reject
          </Button>
        ),
        <Button
          key="approve"
          type="primary"
          onClick={handleApprove}
          disabled={loading || showReasonInput}
          loading={loading}
        >
          Approve
        </Button>,
      ]}
      width={600}
    >
      <Space direction="vertical" size="middle" style={{ width: "100%" }}>
        {/* Warning Alert */}
        <Alert
          message="The AI agent is requesting permission to execute a tool"
          description="Please review the tool details carefully before approving. This action may modify your system."
          type="warning"
          showIcon
        />

        {/* Tool Details */}
        <Descriptions bordered column={1} size="small">
          <Descriptions.Item label="Tool Name">
            <Text strong code>
              {toolName}
            </Text>
          </Descriptions.Item>
          <Descriptions.Item label="Description">
            <Paragraph style={{ marginBottom: 0 }}>{toolDescription}</Paragraph>
          </Descriptions.Item>
        </Descriptions>

        {/* Parameters */}
        <div>
          <Title level={5}>Parameters</Title>
          <Descriptions bordered column={1} size="small">
            {Object.entries(parameters).map(([key, value]) => (
              <Descriptions.Item key={key} label={key}>
                <Paragraph
                  copyable
                  style={{
                    marginBottom: 0,
                    fontFamily: "monospace",
                    maxHeight: "200px",
                    overflow: "auto",
                  }}
                >
                  {typeof value === "string"
                    ? value
                    : JSON.stringify(value, null, 2)}
                </Paragraph>
              </Descriptions.Item>
            ))}
          </Descriptions>
        </div>

        {/* Rejection Reason Input */}
        {showReasonInput && (
          <div>
            <Title level={5}>Rejection Reason (Optional)</Title>
            <TextArea
              placeholder="Provide a reason for rejecting this tool call (optional)..."
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              rows={3}
              autoFocus
            />
            <Space style={{ marginTop: 8 }}>
              <Button
                type="primary"
                danger
                onClick={handleReject}
                disabled={loading}
                loading={loading}
              >
                Confirm Rejection
              </Button>
            </Space>
          </div>
        )}
      </Space>
    </Modal>
  );
};

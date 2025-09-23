import React from "react";
import { Modal, Button, Typography, Descriptions } from "antd";
import { ParameterValue } from "../../services/ToolService";

const { Text, Paragraph } = Typography;

interface ApprovalModalProps {
  visible: boolean;
  toolName: string;
  parameters: ParameterValue[];
  onApprove: () => void;
  onReject: () => void;
}

export const ApprovalModal: React.FC<ApprovalModalProps> = ({
  visible,
  toolName,
  parameters,
  onApprove,
  onReject,
}) => {
  return (
    <Modal
      title="Tool Call Approval"
      open={visible}
      onCancel={onReject}
      footer={[
        <Button key="reject" onClick={onReject}>
          Reject
        </Button>,
        <Button key="approve" type="primary" onClick={onApprove}>
          Approve
        </Button>,
      ]}
    >
      <Descriptions bordered column={1} size="small">
        <Descriptions.Item label="Tool Name">
          <Text strong>{toolName}</Text>
        </Descriptions.Item>
        {parameters.map((param) => (
          <Descriptions.Item key={param.name} label={param.name}>
            <Paragraph
              copyable
              style={{ marginBottom: 0, fontFamily: "monospace" }}
            >
              {param.value}
            </Paragraph>
          </Descriptions.Item>
        ))}
      </Descriptions>
    </Modal>
  );
};

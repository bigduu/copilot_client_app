import React, { useState, useEffect } from "react";
import { Modal, Form, Input, Button, Space, Alert } from "antd";
import { WorkflowDefinition, WorkflowParameter } from "../../services/WorkflowService";

interface WorkflowParameterFormProps {
  workflow: WorkflowDefinition | null;
  visible: boolean;
  onSubmit: (parameters: Record<string, any>) => void;
  onCancel: () => void;
  initialDescription?: string; // Pre-filled description from command
}

const WorkflowParameterForm: React.FC<WorkflowParameterFormProps> = ({
  workflow,
  visible,
  onSubmit,
  onCancel,
  initialDescription,
}) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);

  // Reset form when workflow changes or becomes visible
  useEffect(() => {
    if (visible && workflow) {
      form.resetFields();
      
      // Pre-fill first parameter with initialDescription if available
      if (initialDescription && workflow.parameters.length > 0) {
        form.setFieldsValue({
          [workflow.parameters[0].name]: initialDescription,
        });
      }
    }
  }, [visible, workflow, initialDescription, form]);

  const handleSubmit = async () => {
    try {
      setLoading(true);
      const values = await form.validateFields();
      console.log("[WorkflowParameterForm] Submitting parameters:", values);
      onSubmit(values);
    } catch (error) {
      console.error("[WorkflowParameterForm] Validation failed:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    form.resetFields();
    onCancel();
  };

  if (!workflow) {
    return null;
  }

  // If workflow has no parameters, submit immediately
  if (workflow.parameters.length === 0) {
    // Auto-submit with empty parameters
    useEffect(() => {
      if (visible) {
        onSubmit({});
      }
    }, [visible, onSubmit]);
    
    return null;
  }

  return (
    <Modal
      title={`Execute Workflow: ${workflow.name}`}
      open={visible}
      onCancel={handleCancel}
      footer={[
        <Button key="cancel" onClick={handleCancel}>
          Cancel
        </Button>,
        <Button
          key="submit"
          type="primary"
          loading={loading}
          onClick={handleSubmit}
        >
          Execute
        </Button>,
      ]}
      width={600}
    >
      <div style={{ marginBottom: 16 }}>
        <Alert
          message={workflow.description}
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
        />
      </div>

      <Form
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
      >
        {workflow.parameters.map((param: WorkflowParameter) => (
          <Form.Item
            key={param.name}
            label={param.name}
            name={param.name}
            rules={[
              {
                required: param.required,
                message: `Please input ${param.name}`,
              },
            ]}
            tooltip={param.description}
          >
            <Input.TextArea
              placeholder={param.description}
              rows={param.required ? 3 : 2}
              autoFocus={workflow.parameters.indexOf(param) === 0}
            />
          </Form.Item>
        ))}
      </Form>

      <div style={{ marginTop: 16, fontSize: 12, color: "#888" }}>
        <div>
          <strong>Required parameters:</strong>{" "}
          {workflow.parameters
            .filter((p) => p.required)
            .map((p) => p.name)
            .join(", ") || "None"}
        </div>
        <div style={{ marginTop: 4 }}>
          <strong>Optional parameters:</strong>{" "}
          {workflow.parameters
            .filter((p) => !p.required)
            .map((p) => p.name)
            .join(", ") || "None"}
        </div>
      </div>
    </Modal>
  );
};

export default WorkflowParameterForm;



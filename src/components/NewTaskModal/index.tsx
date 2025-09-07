import React, { useState } from 'react';
import { Modal, Input, Form, Select, message } from 'antd';
import { generateScriptForTask } from '../../utils/taskUtils';

const { TextArea } = Input;

interface NewTaskModalProps {
  open: boolean;
  onClose: () => void;
  onCreate: (values: any) => void;
}

export const NewTaskModal: React.FC<NewTaskModalProps> = ({ open, onClose, onCreate }) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);

  const handleOk = async () => {
    try {
      const values = await form.validateFields();
      setLoading(true);
      
      message.info('Generating script with AI, please wait...');

      const generatedScript = await generateScriptForTask(values.naturalLanguageInput);

      if (!generatedScript) {
        message.error('AI failed to generate a script. Please try rephrasing your request.');
        setLoading(false);
        return;
      }

      console.log('Generated Script:', generatedScript);
      
      onCreate({
        ...values,
        generatedScript,
      });

      message.success('Task created successfully!');
      form.resetFields();
      onClose();
    } catch (error) {
      console.log('Validation or generation failed:', error);
      message.error('Failed to create task. Please check the form or try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      title="Create New Scheduled Task"
      open={open}
      onOk={handleOk}
      onCancel={onClose}
      confirmLoading={loading}
      okText="Create & Generate Script"
    >
      <Form form={form} layout="vertical" name="new_task_form">
        <Form.Item
          name="name"
          label="Task Name"
          rules={[{ required: true, message: 'Please input the name of the task!' }]}
        >
          <Input />
        </Form.Item>
        <Form.Item
          name="naturalLanguageInput"
          label="Describe the task in natural language"
          rules={[{ required: true, message: 'Please describe the task!' }]}
        >
          <TextArea rows={4} placeholder="e.g., 'Every hour, delete all .tmp files from my Downloads folder'" />
        </Form.Item>
        <Form.Item
          name="schedule"
          label="Schedule (in seconds for now)"
          rules={[{ required: true, message: 'Please provide a schedule!' }]}
        >
          <Input type="number" placeholder="e.g., 3600 for every hour" />
        </Form.Item>
      </Form>
    </Modal>
  );
};
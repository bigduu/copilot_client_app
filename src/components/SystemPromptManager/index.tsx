import React, { useState } from "react";
import {
  Button,
  List,
  Modal,
  Form,
  Input,
  Popconfirm,
  message,
  Tag,
} from "antd";
import { EditOutlined, DeleteOutlined, PlusOutlined } from "@ant-design/icons";
import { useAppStore } from "../../store";
import { UserSystemPrompt } from "../../types/chat";

const SystemPromptManager = () => {
  const {
    systemPrompts,
    addSystemPrompt,
    updateSystemPrompt,
    deleteSystemPrompt,
  } = useAppStore((state) => ({
    systemPrompts: state.systemPrompts,
    addSystemPrompt: state.addSystemPrompt,
    updateSystemPrompt: state.updateSystemPrompt,
    deleteSystemPrompt: state.deleteSystemPrompt,
  }));

  const [isModalVisible, setIsModalVisible] = useState(false);
  const [editingPrompt, setEditingPrompt] = useState<UserSystemPrompt | null>(
    null
  );
  const [form] = Form.useForm();

  const showModal = (prompt: UserSystemPrompt | null = null) => {
    setEditingPrompt(prompt);
    form.setFieldsValue(prompt || { name: "", content: "" });
    setIsModalVisible(true);
  };

  const handleCancel = () => {
    setIsModalVisible(false);
    setEditingPrompt(null);
    form.resetFields();
  };

  const handleOk = async () => {
    try {
      const values = await form.validateFields();
      if (editingPrompt) {
        await updateSystemPrompt({ ...editingPrompt, ...values });
        message.success("Prompt updated successfully");
      } else {
        await addSystemPrompt(values);
        message.success("Prompt added successfully");
      }
      handleCancel();
    } catch (error) {
      console.error("Validation Failed:", error);
    }
  };

  const handleDelete = async (id: string) => {
    await deleteSystemPrompt(id);
    message.success("Prompt deleted successfully");
  };

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 16,
        }}
      >
        <h2>System Prompt Management</h2>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => showModal()}
        >
          Add Prompt
        </Button>
      </div>
      <List
        itemLayout="horizontal"
        dataSource={systemPrompts}
        renderItem={(item) => (
          <List.Item
            actions={[
              <Button
                type="text"
                icon={<EditOutlined />}
                onClick={() => showModal(item)}
              />,
              item.isDefault ? null : (
                <Popconfirm
                  title="Are you sure to delete this prompt?"
                  onConfirm={() => handleDelete(item.id)}
                  okText="Yes"
                  cancelText="No"
                >
                  <Button type="text" danger icon={<DeleteOutlined />} />
                </Popconfirm>
              ),
            ]}
          >
            <List.Item.Meta
              title={item.name}
              description={
                item.content.substring(0, 100) +
                (item.content.length > 100 ? "..." : "")
              }
            />
            {item.isDefault && <Tag>Default</Tag>}
          </List.Item>
        )}
      />
      <Modal
        title={editingPrompt ? "Edit System Prompt" : "Add New System Prompt"}
        open={isModalVisible}
        onOk={handleOk}
        onCancel={handleCancel}
      >
        <Form form={form} layout="vertical" name="system_prompt_form">
          <Form.Item
            name="name"
            label="Prompt Name"
            rules={[
              {
                required: true,
                message: "Please input the name of the prompt!",
              },
            ]}
          >
            <Input />
          </Form.Item>
          <Form.Item
            name="content"
            label="Prompt Content"
            rules={[
              {
                required: true,
                message: "Please input the content of the prompt!",
              },
            ]}
          >
            <Input.TextArea rows={6} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default SystemPromptManager;

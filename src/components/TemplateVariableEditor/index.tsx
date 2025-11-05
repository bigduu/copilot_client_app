import React, { useState, useEffect } from "react";
import {
  Modal,
  Form,
  Input,
  Button,
  Space,
  Table,
  message,
  Typography,
  Card,
  theme,
  Divider,
  Tag,
} from "antd";
import {
  PlusOutlined,
  DeleteOutlined,
  ReloadOutlined,
  SaveOutlined,
} from "@ant-design/icons";
import { TemplateVariableService } from "../../services/TemplateVariableService";

const { Text, Paragraph } = Typography;
const { useToken } = theme;

interface TemplateVariableEditorProps {
  open: boolean;
  onClose: () => void;
}

interface VariableRecord {
  key: string;
  value: string;
}

const DEFAULT_VARIABLES: Record<
  string,
  { description: string; defaultValue: string }
> = {
  preferred_language: {
    description: "Preferred communication language",
    defaultValue: "English",
  },
  response_format: {
    description: "Response format style (professional, casual, formal, etc.)",
    defaultValue: "professional",
  },
  tone: {
    description: "Response tone (friendly, formal, technical, etc.)",
    defaultValue: "friendly",
  },
  detail_level: {
    description: "Level of detail in responses (brief, moderate, detailed)",
    defaultValue: "moderate",
  },
};

const TemplateVariableEditor: React.FC<TemplateVariableEditorProps> = ({
  open,
  onClose,
}) => {
  const { token } = useToken();
  const [form] = Form.useForm();
  const [variables, setVariables] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);

  const templateVariableService = TemplateVariableService.getInstance();

  // Load template variables
  const loadVariables = async () => {
    try {
      setLoading(true);
      const vars = await templateVariableService.getAll();
      setVariables(vars);
    } catch (error: any) {
      console.error("Failed to load template variables:", error);
      message.error("Failed to load template variables");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      loadVariables();
    }
  }, [open]);

  // Save a single variable
  const handleSave = async (key: string, value: string) => {
    try {
      await templateVariableService.set(key, value);
      message.success(`Template variable "${key}" saved successfully`);
      await loadVariables();
      setEditingKey(null);
    } catch (error: any) {
      console.error("Failed to save template variable:", error);
      message.error(`Failed to save template variable: ${error}`);
    }
  };

  // Delete a variable
  const handleDelete = async (key: string) => {
    try {
      await templateVariableService.delete(key);
      message.success(`Template variable "${key}" deleted successfully`);
      await loadVariables();
    } catch (error: any) {
      console.error("Failed to delete template variable:", error);
      message.error(`Failed to delete template variable: ${error}`);
    }
  };

  // Add a new variable
  const handleAdd = async () => {
    try {
      const values = await form.validateFields();
      await templateVariableService.set(values.key, values.value);
      message.success(`Template variable "${values.key}" added successfully`);
      form.resetFields();
      setIsAdding(false);
      await loadVariables();
    } catch (error: any) {
      console.error("Failed to add template variable:", error);
      if (error.errorFields) {
        return; // Validation error
      }
      message.error(`Failed to add template variable: ${error}`);
    }
  };

  // Save all variables
  const handleSaveAll = async () => {
    try {
      setLoading(true);
      await templateVariableService.setMultiple(variables);
      message.success("All template variables saved successfully");
      await loadVariables();
    } catch (error: any) {
      console.error("Failed to save template variables:", error);
      message.error(`Failed to save template variables: ${error}`);
    } finally {
      setLoading(false);
    }
  };

  // Reload from storage
  const handleReload = async () => {
    try {
      setLoading(true);
      await templateVariableService.reload();
      message.success("Template variables reloaded from storage");
      await loadVariables();
    } catch (error: any) {
      console.error("Failed to reload template variables:", error);
      message.error(`Failed to reload template variables: ${error}`);
    } finally {
      setLoading(false);
    }
  };

  // Initialize default variable
  const handleInitDefault = async (key: string) => {
    const defaultVar = DEFAULT_VARIABLES[key];
    if (defaultVar) {
      try {
        await templateVariableService.set(key, defaultVar.defaultValue);
        message.success(`Initialized "${key}" with default value`);
        await loadVariables();
      } catch (error: any) {
        console.error("Failed to initialize default variable:", error);
        message.error(`Failed to initialize default variable: ${error}`);
      }
    }
  };

  const dataSource: VariableRecord[] = Object.entries(variables).map(
    ([key, value]) => ({
      key,
      value,
    }),
  );

  const columns = [
    {
      title: "Key",
      dataIndex: "key",
      key: "key",
      width: 200,
      render: (key: string) => {
        const isDefault = key in DEFAULT_VARIABLES;
        return (
          <Space>
            <Text code>{key}</Text>
            {isDefault && <Tag color="blue">Default</Tag>}
          </Space>
        );
      },
    },
    {
      title: "Description",
      key: "description",
      width: 250,
      render: (_: any, record: VariableRecord) => {
        const defaultVar = DEFAULT_VARIABLES[record.key];
        return defaultVar ? (
          <Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
            {defaultVar.description}
          </Text>
        ) : (
          <Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
            Custom variable
          </Text>
        );
      },
    },
    {
      title: "Value",
      dataIndex: "value",
      key: "value",
      render: (value: string, record: VariableRecord) => {
        if (editingKey === record.key) {
          return (
            <Space>
              <Input
                value={value}
                onChange={(e) => {
                  setVariables({ ...variables, [record.key]: e.target.value });
                }}
                onPressEnter={() =>
                  handleSave(record.key, variables[record.key])
                }
                style={{ width: 300 }}
              />
              <Button
                type="primary"
                size="small"
                onClick={() => handleSave(record.key, variables[record.key])}
              >
                Save
              </Button>
              <Button
                size="small"
                onClick={() => {
                  setEditingKey(null);
                  loadVariables();
                }}
              >
                Cancel
              </Button>
            </Space>
          );
        }
        return (
          <Space>
            <Text
              editable={{
                onChange: (newValue) => {
                  setVariables({ ...variables, [record.key]: newValue });
                  handleSave(record.key, newValue);
                },
              }}
              style={{ maxWidth: 400 }}
            >
              {value}
            </Text>
            <Button
              type="link"
              size="small"
              onClick={() => setEditingKey(record.key)}
            >
              Edit
            </Button>
          </Space>
        );
      },
    },
    {
      title: "Actions",
      key: "actions",
      width: 150,
      render: (_: any, record: VariableRecord) => (
        <Space>
          {!(record.key in DEFAULT_VARIABLES) && !variables[record.key] && (
            <Button
              type="link"
              size="small"
              onClick={() => handleInitDefault(record.key)}
            >
              Initialize
            </Button>
          )}
          <Button
            type="link"
            danger
            size="small"
            icon={<DeleteOutlined />}
            onClick={() => handleDelete(record.key)}
          >
            Delete
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <Modal
      title="Template Variables Configuration"
      open={open}
      onCancel={onClose}
      width={900}
      footer={[
        <Button key="cancel" onClick={onClose}>
          Close
        </Button>,
        <Button
          key="reload"
          icon={<ReloadOutlined />}
          onClick={handleReload}
          loading={loading}
        >
          Reload
        </Button>,
        <Button
          key="save"
          type="primary"
          icon={<SaveOutlined />}
          onClick={handleSaveAll}
          loading={loading}
        >
          Save All
        </Button>,
      ]}
    >
      <Space
        direction="vertical"
        size={token.marginMD}
        style={{ width: "100%" }}
      >
        <Card size="small" style={{ backgroundColor: token.colorInfoBg }}>
          <Paragraph style={{ margin: 0 }}>
            <Text strong>Template Variables Usage:</Text> Use{" "}
            <Text code>{`{{variable_name}}`}</Text> or{" "}
            <Text code>{`{variable_name}`}</Text> in your system prompts.
            Variables will be automatically replaced when the prompt is
            enhanced.
          </Paragraph>
        </Card>

        {/* Default variables that might be missing */}
        {Object.entries(DEFAULT_VARIABLES).map(([key, info]) => {
          if (!(key in variables)) {
            return (
              <Card
                key={key}
                size="small"
                style={{ backgroundColor: token.colorWarningBg }}
              >
                <Space>
                  <Text code>{key}</Text>
                  <Text type="secondary">{info.description}</Text>
                  <Tag color="orange">Not initialized</Tag>
                  <Button size="small" onClick={() => handleInitDefault(key)}>
                    Initialize with default: {info.defaultValue}
                  </Button>
                </Space>
              </Card>
            );
          }
          return null;
        })}

        {/* Add new variable */}
        {isAdding && (
          <Card
            size="small"
            style={{ backgroundColor: token.colorBgContainer }}
          >
            <Form form={form} layout="inline" onFinish={handleAdd}>
              <Form.Item
                name="key"
                rules={[
                  { required: true, message: "Key is required" },
                  {
                    pattern: /^[a-zA-Z_][a-zA-Z0-9_]*$/,
                    message:
                      "Invalid key format (use alphanumeric and underscore)",
                  },
                ]}
              >
                <Input placeholder="Variable key" style={{ width: 200 }} />
              </Form.Item>
              <Form.Item
                name="value"
                rules={[{ required: true, message: "Value is required" }]}
              >
                <Input placeholder="Variable value" style={{ width: 300 }} />
              </Form.Item>
              <Form.Item>
                <Button type="primary" htmlType="submit">
                  Add
                </Button>
                <Button
                  onClick={() => setIsAdding(false)}
                  style={{ marginLeft: 8 }}
                >
                  Cancel
                </Button>
              </Form.Item>
            </Form>
          </Card>
        )}

        {!isAdding && (
          <Button
            type="dashed"
            icon={<PlusOutlined />}
            onClick={() => setIsAdding(true)}
            block
          >
            Add Custom Variable
          </Button>
        )}

        <Divider />

        {/* Variables table */}
        <Table
          dataSource={dataSource}
          columns={columns}
          loading={loading}
          pagination={false}
          size="small"
          rowKey="key"
        />
      </Space>
    </Modal>
  );
};

export default TemplateVariableEditor;

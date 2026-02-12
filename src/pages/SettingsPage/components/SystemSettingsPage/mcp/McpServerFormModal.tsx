import { CodeOutlined, FormOutlined, MinusCircleOutlined, PlusOutlined } from "@ant-design/icons";
import {
  Alert,
  Button,
  Form,
  Input,
  Modal,
  Radio,
  Select,
  Space,
  Switch,
  Typography,
} from "antd";
import { useEffect, useMemo, useState } from "react";
import {
  createDefaultMcpServerConfig,
  DEFAULT_HEALTHCHECK_INTERVAL_MS,
  DEFAULT_REQUEST_TIMEOUT_MS,
  DEFAULT_SSE_CONNECT_TIMEOUT_MS,
  DEFAULT_STDIO_STARTUP_TIMEOUT_MS,
  type HeaderConfig,
  type McpServerConfig,
  type SseTransportConfig,
  type StdioTransportConfig,
  type TransportConfig,
} from "../../../../../services/mcp";

const { Text } = Typography;
const { TextArea } = Input;

type ModalMode = "create" | "edit";
type EditorMode = "form" | "json";

interface KeyValueEntry {
  key?: string;
  value?: string;
}

interface HeaderEntry {
  name?: string;
  value?: string;
}

interface McpServerFormValues {
  id: string;
  name?: string;
  enabled: boolean;
  transportType: TransportConfig["type"];
  command?: string;
  args: string[];
  envEntries: KeyValueEntry[];
  url?: string;
  headerEntries: HeaderEntry[];
  requestTimeoutMs: number;
  healthcheckIntervalMs: number;
  allowedTools: string[];
  deniedTools: string[];
}

interface McpServerFormModalProps {
  open: boolean;
  mode: ModalMode;
  initialConfig?: McpServerConfig | null;
  confirmLoading?: boolean;
  onCancel: () => void;
  onSubmit: (config: McpServerConfig) => Promise<void> | void;
}

const toFormValues = (
  initialConfig: McpServerConfig | null | undefined,
): McpServerFormValues => {
  const config = initialConfig ?? createDefaultMcpServerConfig("");
  const transport = config.transport;

  const envEntries =
    transport.type === "stdio"
      ? Object.entries(transport.env ?? {}).map(([key, value]) => ({
          key,
          value,
        }))
      : [];

  const headerEntries =
    transport.type === "sse"
      ? transport.headers.map((header) => ({
          name: header.name,
          value: header.value,
        }))
      : [];

  return {
    id: config.id,
    name: config.name,
    enabled: config.enabled,
    transportType: transport.type,
    command: transport.type === "stdio" ? transport.command : undefined,
    args: transport.type === "stdio" ? transport.args : [],
    envEntries,
    url: transport.type === "sse" ? transport.url : undefined,
    headerEntries,
    requestTimeoutMs:
      config.request_timeout_ms || DEFAULT_REQUEST_TIMEOUT_MS,
    healthcheckIntervalMs:
      config.healthcheck_interval_ms || DEFAULT_HEALTHCHECK_INTERVAL_MS,
    allowedTools: config.allowed_tools || [],
    deniedTools: config.denied_tools || [],
  };
};

const entriesToRecord = (entries: KeyValueEntry[]): Record<string, string> => {
  return entries.reduce<Record<string, string>>((acc, entry) => {
    const key = entry.key?.trim();
    if (!key) {
      return acc;
    }
    acc[key] = entry.value ?? "";
    return acc;
  }, {});
};

const entriesToHeaders = (entries: HeaderEntry[]): HeaderConfig[] => {
  return entries
    .filter((entry) => entry.name?.trim())
    .map((entry) => ({
      name: entry.name?.trim() || "",
      value: entry.value ?? "",
    }));
};

const toServerConfig = (
  values: McpServerFormValues,
  mode: ModalMode,
  initialConfig: McpServerConfig | null | undefined,
): McpServerConfig => {
  const serverId = mode === "edit" ? initialConfig?.id || values.id : values.id;
  const trimmedName = values.name?.trim();

  const transport: TransportConfig =
    values.transportType === "sse"
      ? {
          type: "sse",
          url: values.url?.trim() || "",
          headers: entriesToHeaders(values.headerEntries || []),
          connect_timeout_ms: DEFAULT_SSE_CONNECT_TIMEOUT_MS,
        } satisfies SseTransportConfig
      : {
          type: "stdio",
          command: values.command?.trim() || "",
          args: values.args || [],
          env: entriesToRecord(values.envEntries || []),
          startup_timeout_ms: DEFAULT_STDIO_STARTUP_TIMEOUT_MS,
        } satisfies StdioTransportConfig;

  return {
    id: serverId,
    name: trimmedName || undefined,
    enabled: values.enabled,
    transport,
    request_timeout_ms: values.requestTimeoutMs || DEFAULT_REQUEST_TIMEOUT_MS,
    healthcheck_interval_ms:
      values.healthcheckIntervalMs || DEFAULT_HEALTHCHECK_INTERVAL_MS,
    allowed_tools: values.allowedTools || [],
    denied_tools: values.deniedTools || [],
    reconnect: initialConfig?.reconnect,
  };
};

const formatJson = (config: McpServerConfig | null | undefined): string => {
  if (!config) {
    return JSON.stringify(createDefaultMcpServerConfig(""), null, 2);
  }
  return JSON.stringify(config, null, 2);
};

const validateJson = (json: string): { valid: true; config: McpServerConfig } | { valid: false; error: string } => {
  try {
    const parsed = JSON.parse(json) as McpServerConfig;
    if (!parsed.id || typeof parsed.id !== "string") {
      return { valid: false, error: "Missing or invalid 'id' field" };
    }
    if (!parsed.transport || typeof parsed.transport !== "object") {
      return { valid: false, error: "Missing or invalid 'transport' field" };
    }
    return { valid: true, config: parsed };
  } catch (e) {
    return { valid: false, error: `Invalid JSON: ${e instanceof Error ? e.message : "Unknown error"}` };
  }
};

export const McpServerFormModal: React.FC<McpServerFormModalProps> = ({
  open,
  mode,
  initialConfig,
  confirmLoading = false,
  onCancel,
  onSubmit,
}) => {
  const [form] = Form.useForm<McpServerFormValues>();
  const [editorMode, setEditorMode] = useState<EditorMode>("form");
  const [jsonValue, setJsonValue] = useState<string>("");
  const [jsonError, setJsonError] = useState<string | null>(null);

  const initialFormValues = useMemo(
    () => toFormValues(initialConfig),
    [initialConfig],
  );

  const transportType = Form.useWatch("transportType", form) ?? "stdio";

  useEffect(() => {
    if (!open) {
      return;
    }
    form.setFieldsValue(initialFormValues);
    setJsonValue(formatJson(initialConfig));
    setJsonError(null);
    setEditorMode("form");
  }, [form, initialFormValues, initialConfig, open]);

  const handleCancel = () => {
    form.resetFields();
    setJsonValue("");
    setJsonError(null);
    onCancel();
  };

  const handleOk = async () => {
    if (editorMode === "json") {
      const result = validateJson(jsonValue);
      if (!result.valid) {
        setJsonError(result.error);
        return;
      }
      setJsonError(null);
      try {
        await onSubmit(result.config);
        setJsonValue("");
      } catch (error) {
        console.error("MCP server JSON submission error:", error);
      }
      return;
    }

    try {
      const values = await form.validateFields();
      const config = toServerConfig(values, mode, initialConfig);
      await onSubmit(config);
      form.resetFields();
    } catch (error) {
      console.error("MCP server form submission error:", error);
    }
  };

  const handleJsonChange = (value: string) => {
    setJsonValue(value);
    if (jsonError) {
      const result = validateJson(value);
      if (result.valid) {
        setJsonError(null);
      }
    }
  };

  const switchMode = (newMode: EditorMode) => {
    if (newMode === "json") {
      // Sync form values to JSON
      try {
        const values = form.getFieldsValue();
        const config = toServerConfig(values, mode, initialConfig);
        setJsonValue(JSON.stringify(config, null, 2));
      } catch {
        setJsonValue(formatJson(initialConfig));
      }
    } else {
      // Sync JSON to form (if valid)
      const result = validateJson(jsonValue);
      if (result.valid) {
        form.setFieldsValue(toFormValues(result.config));
      }
    }
    setEditorMode(newMode);
    setJsonError(null);
  };

  return (
    <Modal
      title={mode === "edit" ? "Edit MCP Server" : "Add MCP Server"}
      open={open}
      onCancel={handleCancel}
      onOk={() => {
        void handleOk();
      }}
      okText="Save"
      destroyOnClose
      confirmLoading={confirmLoading}
      width={720}
    >
      <div style={{ marginBottom: 16 }}>
        <Radio.Group
          value={editorMode}
          onChange={(e) => switchMode(e.target.value as EditorMode)}
          optionType="button"
          buttonStyle="solid"
        >
          <Radio.Button value="form">
            <FormOutlined /> Form
          </Radio.Button>
          <Radio.Button value="json">
            <CodeOutlined /> JSON
          </Radio.Button>
        </Radio.Group>
      </div>

      {editorMode === "json" && jsonError && (
        <Alert
          type="error"
          message="JSON Error"
          description={jsonError}
          showIcon
          style={{ marginBottom: 16 }}
          closable
          onClose={() => setJsonError(null)}
        />
      )}

      {editorMode === "json" ? (
        <TextArea
          value={jsonValue}
          onChange={(e) => handleJsonChange(e.target.value)}
          rows={20}
          style={{ fontFamily: "monospace", fontSize: 13 }}
          placeholder={JSON.stringify(createDefaultMcpServerConfig("example-server"), null, 2)}
        />
      ) : (
        <Form<McpServerFormValues>
          layout="vertical"
          form={form}
          preserve
          initialValues={initialFormValues}
        >
        <Form.Item
          name="id"
          label="Server ID"
          rules={[
            { required: true, message: "Server ID is required" },
            {
              pattern: /^[a-zA-Z0-9_-]+$/,
              message: "Use only letters, numbers, underscore, and hyphen",
            },
          ]}
        >
          <Input
            placeholder="filesystem"
            disabled={mode === "edit"}
            autoComplete="off"
          />
        </Form.Item>

        <Form.Item name="name" label="Display Name">
          <Input placeholder="Filesystem MCP" autoComplete="off" />
        </Form.Item>

        <Form.Item
          name="enabled"
          label="Enabled"
          valuePropName="checked"
          extra="Disabled servers stay in config but will not be started."
        >
          <Switch />
        </Form.Item>

        <Form.Item
          name="transportType"
          label="Transport Type"
          rules={[{ required: true, message: "Transport type is required" }]}
        >
          <Select
            options={[
              { label: "Stdio", value: "stdio" },
              { label: "SSE", value: "sse" },
            ]}
          />
        </Form.Item>

        {transportType === "stdio" ? (
          <>
            <Form.Item
              name="command"
              label="Command"
              rules={[{ required: true, message: "Command is required" }]}
            >
              <Input placeholder="npx" autoComplete="off" />
            </Form.Item>

            <Form.Item name="args" label="Arguments">
              <Select
                mode="tags"
                tokenSeparators={[","]}
                placeholder="Add an argument and press Enter"
                open={false}
              />
            </Form.Item>

            <Form.List name="envEntries">
              {(fields, { add, remove }) => (
                <Space direction="vertical" style={{ width: "100%" }}>
                  <Space
                    align="center"
                    style={{ justifyContent: "space-between", width: "100%" }}
                  >
                    <Text strong>Environment Variables</Text>
                    <Button
                      icon={<PlusOutlined />}
                      onClick={() => add({ key: "", value: "" })}
                      type="dashed"
                    >
                      Add Env
                    </Button>
                  </Space>

                  {fields.map((field) => (
                    <Space key={field.key} align="baseline" style={{ display: "flex" }}>
                      <Form.Item
                        {...field}
                        name={[field.name, "key"]}
                        rules={[{ required: true, message: "Key required" }]}
                      >
                        <Input placeholder="MCP_ROOT" autoComplete="off" />
                      </Form.Item>
                      <Form.Item {...field} name={[field.name, "value"]}>
                        <Input placeholder="/Users/me/workspace" autoComplete="off" />
                      </Form.Item>
                      <Button
                        danger
                        type="text"
                        icon={<MinusCircleOutlined />}
                        onClick={() => remove(field.name)}
                      />
                    </Space>
                  ))}
                </Space>
              )}
            </Form.List>
          </>
        ) : (
          <>
            <Form.Item
              name="url"
              label="SSE URL"
              rules={[
                { required: true, message: "SSE URL is required" },
                {
                  validator: async (_, value: string | undefined) => {
                    if (!value) {
                      return;
                    }
                    try {
                      new URL(value);
                    } catch {
                      throw new Error("Please enter a valid URL");
                    }
                  },
                },
              ]}
            >
              <Input placeholder="http://localhost:4000/sse" autoComplete="off" />
            </Form.Item>

            <Form.List name="headerEntries">
              {(fields, { add, remove }) => (
                <Space direction="vertical" style={{ width: "100%" }}>
                  <Space
                    align="center"
                    style={{ justifyContent: "space-between", width: "100%" }}
                  >
                    <Text strong>Headers</Text>
                    <Button
                      icon={<PlusOutlined />}
                      onClick={() => add({ name: "", value: "" })}
                      type="dashed"
                    >
                      Add Header
                    </Button>
                  </Space>

                  {fields.map((field) => (
                    <Space key={field.key} align="baseline" style={{ display: "flex" }}>
                      <Form.Item
                        {...field}
                        name={[field.name, "name"]}
                        rules={[{ required: true, message: "Header name required" }]}
                      >
                        <Input placeholder="Authorization" autoComplete="off" />
                      </Form.Item>
                      <Form.Item {...field} name={[field.name, "value"]}>
                        <Input placeholder="Bearer token" autoComplete="off" />
                      </Form.Item>
                      <Button
                        danger
                        type="text"
                        icon={<MinusCircleOutlined />}
                        onClick={() => remove(field.name)}
                      />
                    </Space>
                  ))}
                </Space>
              )}
            </Form.List>
          </>
        )}
      </Form>
      )}
    </Modal>
  );
};

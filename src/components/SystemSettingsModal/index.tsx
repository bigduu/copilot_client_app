import { useState } from "react";
import {
  Modal,
  Input,
  Button,
  Popconfirm,
  List,
  Radio,
  message,
  Switch,
  Space,
  Typography,
  Select,
  Divider,
  Spin,
  theme,
  Flex,
  Card,
} from "antd";
import {
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  ToolOutlined,
  InfoCircleOutlined,
} from "@ant-design/icons";
import { useChat } from "../../contexts/ChatContext";
import { useModels } from "../../hooks/useModels";
import { MCPServerManagementComponent } from "../MCPServerManagement";
import { invoke } from "@tauri-apps/api/core";

const { Text } = Typography;
const { useToken } = theme;

const DARK_MODE_KEY = "copilot_dark_mode";

const ModelSelection = ({
  isLoadingModels,
  modelsError,
  models,
  selectedModel, // This was correctly changed in the destructuring
  onModelChange,
}: {
  isLoadingModels: boolean;
  modelsError: string | null;
  models: string[];
  selectedModel: string | undefined; // This is the prop name
  onModelChange: (model: string) => void;
}) => {
  const { token } = useToken();
  const fallbackModel = "gpt-4o";
  // Ensure modelOptions always has at least the fallback or the selected model if models array is empty
  const modelOptions =
    models && models.length > 0
      ? models
      : selectedModel
      ? [selectedModel]
      : [fallbackModel]; // Use selectedModel here
  const value = selectedModel || fallbackModel; // And here
  return (
    <Space direction="vertical" size={token.marginXS} style={{ width: "100%" }}>
      <Text strong>Model Selection</Text>
      {isLoadingModels ? (
        <Spin size="small" />
      ) : modelsError ? (
        <Text type="danger">{modelsError}</Text>
      ) : (
        <Select
          style={{ width: "100%" }}
          placeholder="Select a model"
          value={value}
          onChange={onModelChange}
        >
          {modelOptions.map((model) => (
            <Select.Option key={model} value={model}>
              {model}
            </Select.Option>
          ))}
        </Select>
      )}
    </Space>
  );
};

// Tool Manager Component
const ToolManagerComponent = () => {
  const { token } = useToken();
  const [loading, setLoading] = useState(false);
  const [toolsList, setToolsList] = useState<string>("");
  const [toolsDoc, setToolsDoc] = useState<string>("");
  const [showToolsList, setShowToolsList] = useState(false);
  const [showToolsDoc, setShowToolsDoc] = useState(false);

  const loadAvailableTools = async () => {
    setLoading(true);
    try {
      const tools = await invoke<string>("get_available_tools");
      setToolsList(tools);
      setShowToolsList(true);
    } catch (error) {
      console.error("Failed to load tools:", error);
      message.error("Failed to load available tools");
    } finally {
      setLoading(false);
    }
  };

  const loadToolsDocumentation = async () => {
    setLoading(true);
    try {
      const doc = await invoke<string>("get_tools_documentation");
      setToolsDoc(doc);
      setShowToolsDoc(true);
    } catch (error) {
      console.error("Failed to load tools documentation:", error);
      message.error("Failed to load tools documentation");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Space direction="vertical" size={token.marginXS} style={{ width: "100%" }}>
      <Text strong>Tool Management</Text>
      <Space wrap>
        <Button
          icon={<ToolOutlined />}
          onClick={loadAvailableTools}
          loading={loading}
          size="small"
        >
          Show Available Tools
        </Button>
        <Button
          icon={<InfoCircleOutlined />}
          onClick={loadToolsDocumentation}
          loading={loading}
          size="small"
        >
          Show Documentation
        </Button>
      </Space>

      {showToolsList && (
        <Card
          size="small"
          title="Available Tools"
          style={{ marginTop: token.marginXS }}
        >
          <pre
            style={{
              fontSize: "12px",
              maxHeight: "200px",
              overflow: "auto",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            {toolsList}
          </pre>
        </Card>
      )}

      {showToolsDoc && (
        <Card
          size="small"
          title="Tools Documentation"
          style={{ marginTop: token.marginXS }}
        >
          <pre
            style={{
              fontSize: "12px",
              maxHeight: "200px",
              overflow: "auto",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            {toolsDoc}
          </pre>
        </Card>
      )}
    </Space>
  );
};

const SystemSettingsModal = ({
  open,
  onClose,
  themeMode,
  onThemeModeChange,
}: {
  open: boolean;
  onClose: () => void;
  themeMode: "light" | "dark";
  onThemeModeChange: (mode: "light" | "dark") => void;
}) => {
  const { token } = useToken();
  const {
    deleteAllChats,
    systemPromptPresets,
    addSystemPromptPreset,
    updateSystemPromptPreset,
    deleteSystemPromptPreset,
    selectSystemPromptPreset,
    selectedSystemPromptPresetId,
    deleteEmptyChats,
    // currentChat, // No longer needed for model selection here
    // updateCurrentChatModel, // Will use setSelectedModel from useModels
  } = useChat();
  const [msgApi, contextHolder] = message.useMessage();
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [editingContent, setEditingContent] = useState("");
  const {
    models,
    isLoading: isLoadingModels,
    error: modelsError,
    selectedModel,
    setSelectedModel,
  } = useModels();

  const isNew = !editingId;

  const handleDeleteAll = () => {
    deleteAllChats();
    msgApi.success("All chats deleted (except pinned)");
    onClose();
  };

  const handleDeleteEmpty = () => {
    deleteEmptyChats();
    msgApi.success("Empty chats deleted (except pinned)");
  };

  const handleEditSave = () => {
    if (!editingName.trim() || !editingContent.trim()) {
      msgApi.error("Name and content required");
      return;
    }
    if (isNew) {
      addSystemPromptPreset({ name: editingName, content: editingContent });
      msgApi.success("Prompt added");
    } else if (editingId) {
      updateSystemPromptPreset(editingId, {
        name: editingName,
        content: editingContent,
      });
      msgApi.success("Prompt updated");
    }
    setShowEditModal(false);
  };

  const handleDelete = (id: string) => {
    Modal.confirm({
      title: "Delete this prompt?",
      onOk: () => {
        deleteSystemPromptPreset(id);
        msgApi.success("Prompt deleted");
      },
    });
  };

  return (
    <Modal
      title="System Settings"
      open={open}
      onCancel={onClose}
      footer={null}
      width={520}
    >
      {contextHolder}

      {/* Model Selection Section */}
      <ModelSelection
        isLoadingModels={isLoadingModels}
        modelsError={modelsError}
        models={models}
        selectedModel={selectedModel}
        onModelChange={setSelectedModel}
      />

      <Divider />

      {/* MCP Server Management Section */}
      <Space
        direction="vertical"
        size={token.marginXS}
        style={{ width: "100%" }}
      >
        <Text strong>MCP Server Management</Text>
        <MCPServerManagementComponent />
      </Space>

      <Divider />

      {/* Tool Manager Section */}
      <ToolManagerComponent />

      <Divider />

      {/* Dark Mode Switch */}
      <Space
        direction="vertical"
        size={token.marginSM}
        style={{
          width: "100%",
          borderTop: `1px solid ${token.colorBorder}`,
          paddingTop: token.padding,
        }}
      >
        <Flex align="center" gap={token.marginSM}>
          <Text strong>Dark Mode</Text>
          <Switch
            checked={themeMode === "dark"}
            onChange={(checked) => {
              const mode = checked ? "dark" : "light";
              onThemeModeChange(mode);
              localStorage.setItem(DARK_MODE_KEY, mode);
            }}
            checkedChildren="Dark"
            unCheckedChildren="Light"
          />
        </Flex>
        <Popconfirm
          title="Delete all chats"
          description="Are you sure? This will delete all chats except pinned."
          onConfirm={handleDeleteAll}
          okText="Yes, delete all"
          cancelText="Cancel"
          placement="top"
        >
          <Button danger block icon={<DeleteOutlined />}>
            Delete All Chats
          </Button>
        </Popconfirm>
        <Popconfirm
          title="Delete empty chats"
          description="Are you sure? This will delete all chats with no messages (except pinned)."
          onConfirm={handleDeleteEmpty}
          okText="Yes, delete empty"
          cancelText="Cancel"
          placement="top"
        >
          <Button danger block icon={<DeleteOutlined />}>
            Delete Empty Chats
          </Button>
        </Popconfirm>
      </Space>

      {/* Prompt Management Section */}
      <Space
        direction="vertical"
        size={token.marginSM}
        style={{
          width: "100%",
          borderTop: `1px solid ${token.colorBorder}`,
          paddingTop: token.padding,
        }}
      >
        <Text strong>Prompt Management</Text>
        <Flex align="center" gap={token.marginSM}>
          <Text strong>System Prompts</Text>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              setEditingId(null);
              setEditingName("");
              setEditingContent("");
              setShowEditModal(true);
            }}
            size="small"
          >
            Add New
          </Button>
        </Flex>
        <Radio.Group
          value={selectedSystemPromptPresetId}
          onChange={(e) => selectSystemPromptPreset(e.target.value)}
          style={{ width: "100%" }}
        >
          <List
            bordered
            dataSource={systemPromptPresets}
            renderItem={(item: (typeof systemPromptPresets)[0]) => (
              <List.Item
                actions={[
                  <Button
                    type="text"
                    icon={<EditOutlined />}
                    onClick={() => {
                      setEditingId(item.id);
                      setEditingName(item.name);
                      setEditingContent(item.content);
                      setShowEditModal(true);
                    }}
                  />,
                  item.id !== "default" && (
                    <Button
                      type="text"
                      icon={<DeleteOutlined />}
                      danger
                      onClick={() => handleDelete(item.id)}
                    />
                  ),
                ].filter(Boolean)}
              >
                <Radio value={item.id} style={{ marginRight: 8 }}>
                  {item.name}
                </Radio>
              </List.Item>
            )}
          />
        </Radio.Group>
      </Space>

      {/* Edit Modal */}
      <Modal
        open={showEditModal}
        title={isNew ? "New Prompt" : "Edit Prompt"}
        onCancel={() => setShowEditModal(false)}
        onOk={handleEditSave}
      >
        <Space
          direction="vertical"
          size={token.marginSM}
          style={{ width: "100%" }}
        >
          <Input
            placeholder="Prompt Name"
            value={editingName}
            onChange={(e) => setEditingName(e.target.value)}
          />
          <Input.TextArea
            placeholder="Prompt Content"
            value={editingContent}
            onChange={(e) => setEditingContent(e.target.value)}
            autoSize={{ minRows: 6, maxRows: 16 }}
          />
        </Space>
      </Modal>
    </Modal>
  );
};

export { SystemSettingsModal };

import { useState, useEffect } from "react";
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
  Collapse,
  Tag,
  Tooltip,
} from "antd";
import {
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  ToolOutlined,
} from "@ant-design/icons";
import { MCPServerManagementComponent } from "../MCPServerManagement";
import { useToolExecution } from "../../../hooks/ChatView";
import { ParameterInfo, ToolInfo } from "../../../utils/toolParser";
import { useChat } from "../../../contexts/ChatView";
import { useModels } from "../../../hooks/Shared";

const { Text } = Typography;

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
    <div style={{ marginBottom: 24 }}>
      <Text strong>Model Selection</Text>
      <div style={{ marginTop: 8 }}>
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
      </div>
    </div>
  );
};

const ToolsList = () => {
  const { initializeTools, availableTools, isLoading } = useToolExecution();

  useEffect(() => {
    initializeTools();
  }, [initializeTools]);

  const groupedTools = availableTools.reduce<Record<string, ToolInfo[]>>(
    (acc, tool) => {
      const type = tool.type;
      if (!acc[type]) {
        acc[type] = [];
      }
      acc[type].push(tool);
      return acc;
    },
    {}
  );

  const renderParameters = (parameters: ParameterInfo[]) => (
    <List
      size="small"
      dataSource={parameters}
      renderItem={(param) => (
        <List.Item
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-start",
          }}
        >
          <Space style={{ width: "100%", marginBottom: 4 }}>
            <Text
              code
              style={{
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                maxWidth: "200px",
              }}
            >
              {param.name}
            </Text>
            {param.required && <Tag color="blue">Required</Tag>}
          </Space>
          <Text type="secondary" style={{ wordBreak: "break-word" }}>
            {param.description}
          </Text>
        </List.Item>
      )}
    />
  );

  return (
    <div style={{ marginBottom: 24 }}>
      <Text strong>Available Tools</Text>
      <div style={{ marginTop: 8 }}>
        {isLoading ? (
          <Spin size="small" />
        ) : (
          <Collapse>
            {Object.entries(groupedTools).map(([type, tools]) => (
              <Collapse.Panel
                key={type}
                header={
                  <Space>
                    <ToolOutlined />
                    <Text strong>
                      {type === "local" ? "Local Tools" : "MCP Tools"}
                    </Text>
                    <Tag color={type === "local" ? "green" : "blue"}>
                      {tools.length}
                    </Tag>
                  </Space>
                }
              >
                <List
                  dataSource={tools}
                  renderItem={(tool: ToolInfo) => (
                    <List.Item>
                      <List.Item.Meta
                        title={
                          <Space style={{ width: "100%", flexWrap: "wrap" }}>
                            <Text
                              strong
                              style={{
                                whiteSpace: "nowrap",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                maxWidth: "300px",
                              }}
                            >
                              {tool.name}
                            </Text>
                            {tool.requires_approval && (
                              <Tooltip title="Requires approval">
                                <Tag color="orange">Approval</Tag>
                              </Tooltip>
                            )}
                          </Space>
                        }
                        description={tool.description}
                      />
                      {tool.parameters.length > 0 && (
                        <Collapse ghost>
                          <Collapse.Panel header="Parameters" key="params">
                            {renderParameters(tool.parameters)}
                          </Collapse.Panel>
                        </Collapse>
                      )}
                    </List.Item>
                  )}
                />
              </Collapse.Panel>
            ))}
          </Collapse>
        )}
      </div>
    </div>
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
      width="85vw"
      style={{ maxWidth: "1000px", minWidth: "600px" }}
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
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontWeight: 500, marginBottom: 8 }}>
          MCP Server Management
        </div>
        <MCPServerManagementComponent />
      </div>

      <Divider />

      {/* Tools List Section */}
      <ToolsList />

      <Divider />

      {/* Dark Mode Switch */}
      <div
        style={{
          borderTop: "1px solid #eee",
          paddingTop: 16,
          marginBottom: 24,
        }}
      >
        <div
          style={{ display: "flex", alignItems: "center", marginBottom: 12 }}
        >
          <span style={{ marginRight: 12, fontWeight: 500 }}>Dark Mode</span>
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
        </div>
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
          style={{ marginTop: 8 }}
        >
          <Button
            danger
            block
            icon={<DeleteOutlined />}
            style={{ marginTop: 8 }}
          >
            Delete Empty Chats
          </Button>
        </Popconfirm>
      </div>

      {/* Prompt Management Section */}
      <div style={{ borderTop: "1px solid #eee", paddingTop: 16 }}>
        <div style={{ fontWeight: 500, marginBottom: 8 }}>
          Prompt Management
        </div>
        <Space style={{ marginBottom: 16 }} align="center">
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
        </Space>
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
      </div>

      {/* Edit Modal */}
      <Modal
        open={showEditModal}
        title={isNew ? "New Prompt" : "Edit Prompt"}
        onCancel={() => setShowEditModal(false)}
        onOk={handleEditSave}
      >
        <Input
          placeholder="Prompt Name"
          value={editingName}
          onChange={(e) => setEditingName(e.target.value)}
          style={{ marginBottom: 12 }}
        />
        <Input.TextArea
          placeholder="Prompt Content"
          value={editingContent}
          onChange={(e) => setEditingContent(e.target.value)}
          autoSize={{ minRows: 6, maxRows: 16 }}
        />
      </Modal>
    </Modal>
  );
};

export { SystemSettingsModal };

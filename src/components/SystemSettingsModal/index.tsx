import { useState } from "react";
import { Modal, Input, Button, Popconfirm, List, Radio, message } from "antd";
import { DeleteOutlined, EditOutlined } from "@ant-design/icons";
import { useChat } from "../../contexts/ChatContext";

const SystemSettingsModal = ({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) => {
  const {
    deleteAllChats,
    systemPromptPresets,
    addSystemPromptPreset,
    updateSystemPromptPreset,
    deleteSystemPromptPreset,
    selectSystemPromptPreset,
    selectedSystemPromptPresetId,
  } = useChat();
  const [msgApi, contextHolder] = message.useMessage();

  // Prompt管理Tab相关状态
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [editingContent, setEditingContent] = useState("");
  const [showEditModal, setShowEditModal] = useState(false);
  const [isNew, setIsNew] = useState(false);

  const handleDeleteAll = () => {
    deleteAllChats();
    msgApi.success("All chats deleted (except pinned)");
    onClose();
  };

  // Prompt管理相关
  const openEditModal = (preset?: (typeof systemPromptPresets)[0]) => {
    if (preset) {
      setEditingId(preset.id);
      setEditingName(preset.name);
      setEditingContent(preset.content);
      setIsNew(false);
    } else {
      setEditingId(null);
      setEditingName("");
      setEditingContent("");
      setIsNew(true);
    }
    setShowEditModal(true);
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
      <div
        style={{
          borderTop: "1px solid #eee",
          paddingTop: 16,
          marginBottom: 24,
        }}
      >
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
      </div>
      {/* Prompt Management Section */}
      <div style={{ borderTop: "1px solid #eee", paddingTop: 16 }}>
        <div style={{ fontWeight: 500, marginBottom: 8 }}>
          Prompt Management
        </div>
        <Button
          type="primary"
          onClick={() => openEditModal()}
          style={{ marginBottom: 12 }}
        >
          New Prompt
        </Button>
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
                    onClick={() => openEditModal(item)}
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
      </div>
    </Modal>
  );
};

export { SystemSettingsModal };

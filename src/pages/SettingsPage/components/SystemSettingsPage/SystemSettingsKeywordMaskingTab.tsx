import React, { useEffect, useState } from "react";
import {
  Button,
  Card,
  Flex,
  Input,
  List,
  Select,
  Space,
  Switch,
  Typography,
  message,
  theme,
} from "antd";
import {
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  SaveOutlined,
} from "@ant-design/icons";
import { invoke } from "@tauri-apps/api/core";

const { Text } = Typography;
const { useToken } = theme;

interface KeywordEntry {
  pattern: string;
  match_type: "exact" | "regex";
  enabled: boolean;
}

interface ValidationError {
  index: number;
  message: string;
}

const SystemSettingsKeywordMaskingTab: React.FC = () => {
  const { token } = useToken();
  const [entries, setEntries] = useState<KeywordEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editPattern, setEditPattern] = useState("");
  const [editMatchType, setEditMatchType] = useState<"exact" | "regex">("exact");
  const [editEnabled, setEditEnabled] = useState(true);

  // Load keyword masking config on mount
  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      setLoading(true);
      const response = await invoke<{ entries: KeywordEntry[] }>(
        "get_keyword_masking_config"
      );
      setEntries(response.entries);
    } catch (error) {
      message.error("Failed to load keyword masking configuration");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const saveConfig = async (newEntries: KeywordEntry[]) => {
    try {
      // Validate first
      const validationResult = await invoke<void | ValidationError[]>(
        "validate_keyword_entries",
        { entries: newEntries }
      );

      if (Array.isArray(validationResult)) {
        const errorMessages = validationResult
          .map((e) => `Entry ${e.index + 1}: ${e.message}`)
          .join("; ");
        message.error(`Validation failed: ${errorMessages}`);
        return false;
      }

      // Save if validation passes
      await invoke<{ entries: KeywordEntry[] }>(
        "update_keyword_masking_config",
        { entries: newEntries }
      );
      setEntries(newEntries);
      message.success("Keyword masking configuration saved");
      return true;
    } catch (error) {
      message.error(
        error instanceof Error ? error.message : "Failed to save configuration"
      );
      return false;
    }
  };

  const handleAddEntry = async () => {
    const newEntry: KeywordEntry = {
      pattern: "",
      match_type: "exact",
      enabled: true,
    };
    const newEntries = [...entries, newEntry];
    
    // Don't save empty entry, just set editing mode
    setEntries(newEntries);
    setEditingIndex(newEntries.length - 1);
    setEditPattern("");
    setEditMatchType("exact");
    setEditEnabled(true);
  };

  const handleEditEntry = (index: number) => {
    const entry = entries[index];
    setEditingIndex(index);
    setEditPattern(entry.pattern);
    setEditMatchType(entry.match_type);
    setEditEnabled(entry.enabled);
  };

  const handleSaveEdit = async () => {
    if (editingIndex === null) return;

    if (!editPattern.trim()) {
      message.error("Pattern cannot be empty");
      return;
    }

    const newEntries = [...entries];
    newEntries[editingIndex] = {
      pattern: editPattern.trim(),
      match_type: editMatchType,
      enabled: editEnabled,
    };

    const success = await saveConfig(newEntries);
    if (success) {
      setEditingIndex(null);
    }
  };

  const handleCancelEdit = () => {
    // Remove the entry if it was a new empty one
    if (editingIndex !== null && !entries[editingIndex]?.pattern) {
      setEntries(entries.filter((_, i) => i !== editingIndex));
    }
    setEditingIndex(null);
  };

  const handleDeleteEntry = async (index: number) => {
    const newEntries = entries.filter((_, i) => i !== index);
    await saveConfig(newEntries);
  };

  const handleToggleEnabled = async (index: number, checked: boolean) => {
    const newEntries = [...entries];
    newEntries[index] = { ...newEntries[index], enabled: checked };
    await saveConfig(newEntries);
  };

  return (
    <Card
      title="Keyword Masking"
      extra={
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={handleAddEntry}
          loading={loading}
        >
          Add Keyword
        </Button>
      }
    >
      <Space direction="vertical" style={{ width: "100%" }} size="large">
        <Text type="secondary">
          Configure keywords to be masked before sending to Copilot API. 
          Use exact match for literal strings or regex for pattern matching.
          All matches will be replaced with [MASKED].
        </Text>

        <List
          loading={loading}
          dataSource={entries}
          locale={{ emptyText: "No keyword masking rules configured" }}
          renderItem={(item, index) => (
            <List.Item
              style={{
                backgroundColor: token.colorFillAlter,
                marginBottom: 8,
                borderRadius: token.borderRadius,
                padding: 12,
              }}
              actions={
                editingIndex === index
                  ? [
                      <Button
                        key="save"
                        type="primary"
                        icon={<SaveOutlined />}
                        onClick={handleSaveEdit}
                      />,
                      <Button key="cancel" onClick={handleCancelEdit}>
                        Cancel
                      </Button>,
                    ]
                  : [
                      <Button
                        key="edit"
                        icon={<EditOutlined />}
                        onClick={() => handleEditEntry(index)}
                      />,
                      <Button
                        key="delete"
                        danger
                        icon={<DeleteOutlined />}
                        onClick={() => handleDeleteEntry(index)}
                      />,
                    ]
              }
            >
              <Flex vertical style={{ width: "100%" }} gap={8}>
                {editingIndex === index ? (
                  // Edit mode
                  <>
                    <Input
                      placeholder="Enter pattern to match"
                      value={editPattern}
                      onChange={(e) => setEditPattern(e.target.value)}
                      autoFocus
                    />
                    <Flex gap={8} align="center">
                      <Select
                        value={editMatchType}
                        onChange={setEditMatchType}
                        options={[
                          { value: "exact", label: "Exact Match" },
                          { value: "regex", label: "Regex Pattern" },
                        ]}
                        style={{ width: 150 }}
                      />
                      <Switch
                        checked={editEnabled}
                        onChange={setEditEnabled}
                        checkedChildren="Enabled"
                        unCheckedChildren="Disabled"
                      />
                    </Flex>
                  </>
                ) : (
                  // View mode
                  <Flex justify="space-between" align="center">
                    <Flex vertical gap={4}>
                      <Text strong>{item.pattern || "(empty)"}</Text>
                      <Flex gap={8}>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          {item.match_type === "regex"
                            ? "Regex Pattern"
                            : "Exact Match"}
                        </Text>
                        {!item.enabled && (
                          <Text type="warning" style={{ fontSize: 12 }}>
                            Disabled
                          </Text>
                        )}
                      </Flex>
                    </Flex>
                    <Switch
                      checked={item.enabled}
                      onChange={(checked) =>
                        handleToggleEnabled(index, checked)
                      }
                      size="small"
                    />
                  </Flex>
                )}
              </Flex>
            </List.Item>
          )}
        />
      </Space>
    </Card>
  );
};

export default SystemSettingsKeywordMaskingTab;

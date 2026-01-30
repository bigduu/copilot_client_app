import React, { useEffect, useMemo, useState } from "react";
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

const DEFAULT_PREVIEW_INPUT = "Example: secret-token";

const exampleOptions = [
  {
    label: "Mask a literal token (sk-)",
    value: "literal-token",
    pattern: "sk-",
    match_type: "exact",
  },
  {
    label: "Mask GitHub tokens",
    value: "github-token",
    pattern: "ghp_[A-Za-z0-9]+",
    match_type: "regex",
  },
  {
    label: "Mask AWS access keys",
    value: "aws-access-key",
    pattern: "AKIA[0-9A-Z]{16}",
    match_type: "regex",
  },
  {
    label: "Mask email addresses",
    value: "emails",
    pattern: "[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}",
    match_type: "regex",
  },
] as const;

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
  const [previewInput, setPreviewInput] = useState(DEFAULT_PREVIEW_INPUT);

  const preview = useMemo(() => {
    if (!editEnabled || !editPattern.trim()) {
      return { output: previewInput, error: null as string | null };
    }

    if (editMatchType === "exact") {
      return {
        output: previewInput.split(editPattern).join("[MASKED]"),
        error: null as string | null,
      };
    }

    try {
      const regex = new RegExp(editPattern, "g");
      return { output: previewInput.replace(regex, "[MASKED]"), error: null };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid regex pattern";
      return { output: previewInput, error: message };
    }
  }, [editEnabled, editMatchType, editPattern, previewInput]);

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

    setEntries(newEntries);
    setEditingIndex(newEntries.length - 1);
    setEditPattern("");
    setEditMatchType("exact");
    setEditEnabled(true);
    setPreviewInput(DEFAULT_PREVIEW_INPUT);
  };

  const handleEditEntry = (index: number) => {
    const entry = entries[index];
    setEditingIndex(index);
    setEditPattern(entry.pattern);
    setEditMatchType(entry.match_type);
    setEditEnabled(entry.enabled);
    setPreviewInput(DEFAULT_PREVIEW_INPUT);
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

  const handleExampleSelect = (value: string) => {
    const selected = exampleOptions.find((option) => option.value === value);
    if (!selected) return;
    setEditPattern(selected.pattern);
    setEditMatchType(selected.match_type);
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
          Configure keywords to be masked before sending to Copilot API. Use exact
          match for literal strings or regex for pattern matching. All matches will
          be replaced with [MASKED].
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
                  <>
                    <Input
                      placeholder="Enter pattern to match"
                      value={editPattern}
                      onChange={(e) => setEditPattern(e.target.value)}
                      autoFocus
                    />
                    <Flex gap={8} align="center">
                      <Select
                        placeholder="Examples"
                        onChange={handleExampleSelect}
                        options={exampleOptions.map((option) => ({
                          value: option.value,
                          label: option.label,
                        }))}
                        style={{ width: 220 }}
                        data-testid="keyword-example-select"
                      />
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
                    <Flex vertical gap={6}>
                      <Text type="secondary">Preview</Text>
                      <Input
                        placeholder="Sample text"
                        value={previewInput}
                        onChange={(e) => setPreviewInput(e.target.value)}
                      />
                      {preview.error ? (
                        <Text type="danger">{preview.error}</Text>
                      ) : (
                        <Text code>{preview.output}</Text>
                      )}
                    </Flex>
                  </>
                ) : (
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
                      onChange={(checked) => handleToggleEnabled(index, checked)}
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

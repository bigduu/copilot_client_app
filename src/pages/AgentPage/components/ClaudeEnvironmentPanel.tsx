import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Divider,
  Flex,
  Input,
  Space,
  Typography,
} from "antd";

import {
  claudeInstallerService,
  InstallerSettings,
} from "../services/ClaudeInstallerService";
import { claudeCodeService } from "../services/ClaudeCodeService";

const { Text } = Typography;

type EnvVar = { key: string; value: string };

const commonVars: { key: string; label: string }[] = [
  { key: "ANTHROPIC_API_KEY", label: "API key" },
  { key: "ANTHROPIC_AUTH_TOKEN", label: "API token" },
  { key: "ANTHROPIC_BASE_URL", label: "API base URL" },
  { key: "CLAUDE_CODE_API_BASE_URL", label: "Claude Code API base URL" },
  { key: "ANTHROPIC_DEFAULT_HAIKU_MODEL", label: "Default Haiku model" },
  { key: "ANTHROPIC_DEFAULT_OPUS_MODEL", label: "Default Opus model" },
  { key: "ANTHROPIC_DEFAULT_SONNET_MODEL", label: "Default Sonnet model" },
  { key: "CLAUDE_CODE_ENABLE_TELEMETRY", label: "Telemetry (0/1)" },
  { key: "ANTHROPIC_MODEL", label: "Override model" },
  { key: "DISABLE_COST_WARNINGS", label: "Disable cost warnings (1)" },
];

export const ClaudeEnvironmentPanel: React.FC = () => {
  const [settings, setSettings] = useState<InstallerSettings | null>(null);
  const [detectedVars, setDetectedVars] = useState<EnvVar[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const envVars = useMemo<EnvVar[]>(
    () => settings?.env_vars ?? [],
    [settings?.env_vars],
  );

  const loadSettings = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [data, detected] = await Promise.all([
        claudeInstallerService.getSettings(),
        claudeCodeService.getClaudeEnvVars(),
      ]);
      setSettings(data);
      setDetectedVars(detected);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load settings");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const updateEnvVars = useCallback(
    (next: EnvVar[]) => {
      setSettings((prev) => (prev ? { ...prev, env_vars: next } : prev));
    },
    [setSettings],
  );

  const handleAdd = () => {
    updateEnvVars([...envVars, { key: "", value: "" }]);
  };

  const handleUpdateKey = (index: number, value: string) => {
    const next = envVars.map((item, idx) =>
      idx === index ? { ...item, key: value } : item,
    );
    updateEnvVars(next);
  };

  const handleUpdateValue = (index: number, value: string) => {
    const next = envVars.map((item, idx) =>
      idx === index ? { ...item, value } : item,
    );
    updateEnvVars(next);
  };

  const handleRemove = (index: number) => {
    const next = envVars.filter((_, idx) => idx !== index);
    updateEnvVars(next);
  };

  const handleSave = useCallback(async () => {
    if (!settings) return;
    setIsSaving(true);
    setError(null);
    try {
      const saved = await claudeInstallerService.updateSettings(settings);
      setSettings(saved);
      const detected = await claudeCodeService.getClaudeEnvVars();
      setDetectedVars(detected);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save settings");
    } finally {
      setIsSaving(false);
    }
  }, [settings]);

  const configuredKeys = useMemo(() => {
    return new Set(
      envVars
        .filter((item) => item.key.trim() && item.value.trim())
        .map((item) => item.key),
    );
  }, [envVars]);

  const visibleDetectedVars = useMemo(() => {
    return detectedVars.filter((item) => !configuredKeys.has(item.key));
  }, [configuredKeys, detectedVars]);

  if (isLoading && !settings) {
    return <Alert type="info" message="Loading environment variables..." />;
  }

  return (
    <Flex vertical style={{ gap: 12 }}>
      {error ? <Alert type="error" message={error} /> : null}
      <Card size="small">
        <Space direction="vertical" size={8} style={{ width: "100%" }}>
          <Flex justify="space-between" align="center">
            <Text strong>Environment Variables</Text>
            <Button onClick={handleAdd}>Add Variable</Button>
          </Flex>
          {envVars.length === 0 ? (
            <Text type="secondary">No environment variables set.</Text>
          ) : (
            <Space direction="vertical" size={8} style={{ width: "100%" }}>
              {envVars.map((item, index) => (
                <Flex key={`${item.key}-${index}`} gap={8} align="center">
                  <Input
                    value={item.key}
                    placeholder="KEY"
                    onChange={(e) => handleUpdateKey(index, e.target.value)}
                    style={{ flex: 2 }}
                  />
                  <Input
                    value={item.value}
                    placeholder="Value"
                    onChange={(e) => handleUpdateValue(index, e.target.value)}
                    style={{ flex: 3 }}
                  />
                  <Button danger onClick={() => handleRemove(index)}>
                    Remove
                  </Button>
                </Flex>
              ))}
            </Space>
          )}
          <Flex justify="flex-end">
            <Button type="primary" onClick={handleSave} loading={isSaving}>
              Save
            </Button>
          </Flex>
          <Text type="secondary">
            These variables are applied to every Claude Code session launched
            from the agent.
          </Text>
          <Space direction="vertical" size={4}>
            <Text type="secondary">Common variables:</Text>
            <Space wrap size={6}>
              {commonVars.map((item) => (
                <Text key={item.key} code>
                  {item.key}
                </Text>
              ))}
            </Space>
          </Space>
          <Divider style={{ margin: "8px 0" }} />
          <Text strong>Detected from environment</Text>
          {visibleDetectedVars.length === 0 ? (
            <Text type="secondary">No environment variables detected.</Text>
          ) : (
            <Space direction="vertical" size={8} style={{ width: "100%" }}>
              {visibleDetectedVars.map((item) => (
                <Flex key={`detected-${item.key}`} gap={8} align="center">
                  <Input value={item.key} readOnly style={{ flex: 2 }} />
                  <Input value={item.value} readOnly style={{ flex: 3 }} />
                </Flex>
              ))}
            </Space>
          )}
        </Space>
      </Card>
    </Flex>
  );
};

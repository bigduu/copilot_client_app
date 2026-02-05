import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Button,
  Card,
  Collapse,
  Flex,
  Input,
  Space,
  Switch,
  Typography,
  theme,
} from "antd";
import SystemSettingsModelSelection from "./SystemSettingsModelSelection";
import SystemSettingsProxyAuthCard from "./SystemSettingsProxyAuthCard";

const { Text } = Typography;
const { useToken } = theme;

const BODHI_CONFIG_DEMO = `{
  "http_proxy": "http://proxy.example.com:8080",
  "https_proxy": "http://proxy.example.com:8080",
  "api_key": "ghu_xxx",
  "api_base": "https://api.githubcopilot.com",
  "model": "gpt-5-mini",
  "headless_auth": false
}`;

interface SystemSettingsConfigTabProps {
  bodhiConfigJson: string;
  bodhiConfigError: string | null;
  isLoadingBodhiConfig: boolean;
  onReload: () => void;
  onSave: () => void;
  onChange: (value: string) => void;
  models: string[];
  selectedModel: string | undefined;
  onModelChange: (model: string) => void;
  modelsError: string | null;
  isLoadingModels: boolean;
  backendBaseUrl: string;
  onBackendBaseUrlChange: (value: string) => void;
  onSaveBackendBaseUrl: () => void;
  onResetBackendBaseUrl: () => void;
  hasBackendOverride: boolean;
  defaultBackendBaseUrl: string;
  proxyAuth: {
    username: string;
    password: string;
    onUsernameChange: (value: string) => void;
    onPasswordChange: (value: string) => void;
    onSave: () => void;
    onClear: () => void;
    isSaving: boolean;
    lastError: string | null;
  };
}

const SystemSettingsConfigTab: React.FC<SystemSettingsConfigTabProps> = ({
  bodhiConfigJson,
  bodhiConfigError,
  isLoadingBodhiConfig,
  onReload,
  onSave,
  onChange,
  models,
  selectedModel,
  onModelChange,
  modelsError,
  isLoadingModels,
  backendBaseUrl,
  onBackendBaseUrlChange,
  onSaveBackendBaseUrl,
  onResetBackendBaseUrl,
  hasBackendOverride,
  defaultBackendBaseUrl,
  proxyAuth,
}) => {
  const { token } = useToken();
  const lastValidConfigRef = useRef<Record<string, any>>({});
  const [formState, setFormState] = useState({
    http_proxy: "",
    https_proxy: "",
    api_key: "",
    api_base: "",
    model: "",
    headless_auth: false,
  });

  const parseConfig = useCallback((raw: string) => {
    try {
      const parsed = JSON.parse(raw || "{}");
      if (parsed && typeof parsed === "object") {
        return parsed as Record<string, any>;
      }
    } catch {}
    return null;
  }, []);

  const buildFormState = useCallback(
    (config: Record<string, any>) => ({
      http_proxy: typeof config.http_proxy === "string" ? config.http_proxy : "",
      https_proxy:
        typeof config.https_proxy === "string" ? config.https_proxy : "",
      api_key: typeof config.api_key === "string" ? config.api_key : "",
      api_base: typeof config.api_base === "string" ? config.api_base : "",
      model:
        typeof config.model === "string"
          ? config.model
          : selectedModel || "",
      headless_auth: Boolean(config.headless_auth),
    }),
    [selectedModel],
  );

  const updateConfig = useCallback(
    (updates: Record<string, any>) => {
      const next = { ...lastValidConfigRef.current, ...updates };
      lastValidConfigRef.current = next;
      setFormState(buildFormState(next));
      onChange(JSON.stringify(next, null, 2));
    },
    [buildFormState, onChange],
  );

  useEffect(() => {
    const parsed = parseConfig(bodhiConfigJson);
    if (!parsed) return;
    lastValidConfigRef.current = parsed;
    setFormState(buildFormState(parsed));
    if (typeof parsed.model === "string" && parsed.model !== selectedModel) {
      onModelChange(parsed.model);
    }
  }, [bodhiConfigJson, buildFormState, onModelChange, parseConfig, selectedModel]);

  useEffect(() => {
    if (!selectedModel) return;
    const currentModel = lastValidConfigRef.current.model;
    if (currentModel === selectedModel) return;
    updateConfig({ model: selectedModel });
  }, [selectedModel, updateConfig]);

  const advancedItems = useMemo(
    () => [
      {
        key: "advanced-json",
        label: "Advanced JSON",
        children: (
          <Space direction="vertical" size={token.marginXS} style={{ width: "100%" }}>
            <Input.TextArea
              rows={10}
              value={bodhiConfigJson}
              onChange={(event) => onChange(event.target.value)}
              placeholder='{"http_proxy":"","https_proxy":"","api_key":null,"api_base":null,"model":null,"headless_auth":false}'
            />
            <Space
              direction="vertical"
              size={token.marginXXS}
              style={{ width: "100%" }}
            >
              <Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
                Supported keys: <Text code>http_proxy</Text>,{" "}
                <Text code>https_proxy</Text>, <Text code>api_key</Text>,{" "}
                <Text code>api_base</Text>, <Text code>model</Text>,{" "}
                <Text code>headless_auth</Text>
              </Text>
              <pre
                style={{
                  margin: 0,
                  padding: token.paddingXS,
                  borderRadius: token.borderRadiusSM,
                  background: token.colorFillSecondary,
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  fontSize: token.fontSizeSM,
                }}
              >
                {BODHI_CONFIG_DEMO}
              </pre>
            </Space>
          </Space>
        ),
      },
    ],
    [bodhiConfigJson, onChange, token],
  );

  return (
    <Space direction="vertical" size={token.marginMD} style={{ width: "100%" }}>
      <Card size="small">
        <Space
          direction="vertical"
          size={token.marginXS}
          style={{ width: "100%" }}
        >
          <Flex justify="space-between" align="center">
            <Text strong>Bodhi Config</Text>
            <Space size={token.marginSM}>
              <Button onClick={onReload} disabled={isLoadingBodhiConfig}>
                Reload
              </Button>
              <Button
                type="primary"
                onClick={onSave}
                disabled={isLoadingBodhiConfig}
              >
                Save
              </Button>
            </Space>
          </Flex>
          <Space
            direction="vertical"
            size={token.marginSM}
            style={{ width: "100%" }}
          >
            <Space direction="vertical" size={token.marginXXS} style={{ width: "100%" }}>
              <Text type="secondary">HTTP Proxy</Text>
              <Input
                style={{ width: "100%" }}
                value={formState.http_proxy}
                onChange={(event) =>
                  updateConfig({ http_proxy: event.target.value })
                }
                placeholder="http://proxy.example.com:8080"
              />
            </Space>
            <Space direction="vertical" size={token.marginXXS} style={{ width: "100%" }}>
              <Text type="secondary">HTTPS Proxy</Text>
              <Input
                style={{ width: "100%" }}
                value={formState.https_proxy}
                onChange={(event) =>
                  updateConfig({ https_proxy: event.target.value })
                }
                placeholder="http://proxy.example.com:8080"
              />
            </Space>
            <Space direction="vertical" size={token.marginXXS} style={{ width: "100%" }}>
              <Text type="secondary">API Key</Text>
              <Input
                style={{ width: "100%" }}
                value={formState.api_key}
                onChange={(event) =>
                  updateConfig({ api_key: event.target.value })
                }
                placeholder="ghu_xxx"
              />
            </Space>
            <Space direction="vertical" size={token.marginXXS} style={{ width: "100%" }}>
              <Text type="secondary">API Base</Text>
              <Input
                style={{ width: "100%" }}
                value={formState.api_base}
                onChange={(event) =>
                  updateConfig({ api_base: event.target.value })
                }
                placeholder="https://api.githubcopilot.com"
              />
            </Space>
            <SystemSettingsModelSelection
              isLoadingModels={isLoadingModels}
              modelsError={modelsError}
              models={models}
              selectedModel={formState.model || selectedModel}
              onModelChange={(model) => {
                onModelChange(model);
                updateConfig({ model });
              }}
            />
            <Flex align="center" justify="space-between">
              <Space direction="vertical" size={token.marginXXS}>
                <Text type="secondary">Copilot Headless Auth</Text>
                <Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
                  Controls device-code login: when enabled, the app will not
                  open a browser and will print the URL + code in the console.
                </Text>
              </Space>
              <Switch
                checked={formState.headless_auth}
                onChange={(checked) => updateConfig({ headless_auth: checked })}
              />
            </Flex>
            {bodhiConfigError && <Text type="danger">{bodhiConfigError}</Text>}
          </Space>
          <Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
            Edit <Text code>~/.bodhi/config.json</Text> directly or use this
            editor. The UI refreshes periodically; use Reload to apply file
            changes or Save to persist edits.
          </Text>
          <Collapse items={advancedItems} size="small" />
        </Space>
      </Card>
      <Card size="small">
        <Space
          direction="vertical"
          size={token.marginXS}
          style={{ width: "100%" }}
        >
          <Text strong>Backend API Base URL</Text>
          <Input
            placeholder={defaultBackendBaseUrl}
            value={backendBaseUrl}
            onChange={(event) => onBackendBaseUrlChange(event.target.value)}
          />
          <Flex justify="flex-end" gap={token.marginSM}>
            <Button disabled={!hasBackendOverride} onClick={onResetBackendBaseUrl}>
              Reset to Default
            </Button>
            <Button type="primary" onClick={onSaveBackendBaseUrl}>
              Save
            </Button>
          </Flex>
          <Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
            Must be a full base URL including <Text code>/v1</Text> (e.g.{" "}
            <Text code>http://127.0.0.1:8080/v1</Text>).
          </Text>
        </Space>
      </Card>
      <SystemSettingsProxyAuthCard
        username={proxyAuth.username}
        password={proxyAuth.password}
        onUsernameChange={proxyAuth.onUsernameChange}
        onPasswordChange={proxyAuth.onPasswordChange}
        onSave={proxyAuth.onSave}
        onClear={proxyAuth.onClear}
        isSaving={proxyAuth.isSaving}
        lastError={proxyAuth.lastError}
      />
    </Space>
  );
};

export default SystemSettingsConfigTab;

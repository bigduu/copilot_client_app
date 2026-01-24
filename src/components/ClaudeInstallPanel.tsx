import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Button, Card, Flex, Input, Select, Typography } from "antd";

import {
  claudeInstallerService,
  InstallerSettings,
  InstallScope,
  InstallTarget,
  NpmDetectResponse,
  InstallEvent,
} from "../services/ClaudeInstallerService";

const { Text } = Typography;

const DEFAULT_CLAUDE_CODE_PACKAGE = "@anthropic-ai/claude-code";
const DEFAULT_CLAUDE_ROUTER_PACKAGE = "@musistudio/claude-code-router";

const scopeOptions: { value: InstallScope; label: string }[] = [
  { value: "global", label: "Global" },
  { value: "project", label: "Project" },
];

const normalizeSettings = (settings: InstallerSettings): InstallerSettings => {
  const code = settings.claude_code_package?.trim();
  const router = settings.claude_router_package?.trim();
  return {
    ...settings,
    claude_code_package:
      !code || code === "CLAUDE_CODE_NPM_PACKAGE"
        ? DEFAULT_CLAUDE_CODE_PACKAGE
        : code,
    claude_router_package:
      !router || router === "CLAUDE_ROUTER_NPM_PACKAGE"
        ? DEFAULT_CLAUDE_ROUTER_PACKAGE
        : router,
  };
};

export const ClaudeInstallPanel: React.FC<{ projectPath?: string | null }> = ({
  projectPath,
}) => {
  const [settings, setSettings] = useState<InstallerSettings | null>(null);
  const [npmStatus, setNpmStatus] = useState<NpmDetectResponse | null>(null);
  const [isDetecting, setIsDetecting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);
  const [output, setOutput] = useState("");
  const [error, setError] = useState<string | null>(null);

  const loadSettings = useCallback(async () => {
    setError(null);
    try {
      const data = await claudeInstallerService.getSettings();
      setSettings(normalizeSettings(data));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load installer settings");
    }
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const onSave = useCallback(async () => {
    if (!settings) return;
    setIsSaving(true);
    setError(null);
    try {
      const saved = await claudeInstallerService.updateSettings(settings);
      setSettings(saved);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save installer settings");
    } finally {
      setIsSaving(false);
    }
  }, [settings]);

  const onDetect = useCallback(async () => {
    setIsDetecting(true);
    setError(null);
    try {
      const result = await claudeInstallerService.detectNpm();
      setNpmStatus(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to detect npm");
    } finally {
      setIsDetecting(false);
    }
  }, []);

  const handleEvent = useCallback((event: InstallEvent) => {
    if (event.type === "line") {
      setOutput((prev) => `${prev}${event.message}\n`);
    }
    if (event.type === "error") {
      setOutput((prev) => `${prev}${event.message}\n`);
      setIsInstalling(false);
    }
    if (event.type === "done") {
      setIsInstalling(false);
    }
  }, []);

  const runInstall = useCallback(
    async (target: InstallTarget) => {
      if (!settings) return;
      if (settings.install_scope === "project" && !projectPath) {
        setError("Select a project for project-scoped installs");
        return;
      }
      setOutput("");
      setError(null);
      setIsInstalling(true);
      try {
        const pkg =
          target === "claude_code"
            ? settings.claude_code_package
            : settings.claude_router_package;
        await claudeInstallerService.install(
          target,
          {
            scope: settings.install_scope,
            package: pkg,
            projectPath: settings.install_scope === "project" ? projectPath ?? undefined : undefined,
          },
          handleEvent,
        );
        await loadSettings();
      } catch (e) {
        setIsInstalling(false);
        setError(e instanceof Error ? e.message : "Install failed");
      }
    },
    [handleEvent, loadSettings, projectPath, settings],
  );

  const updateHint = useMemo(() => {
    if (!settings) return "";
    if (settings.install_scope === "global") {
      return `npm install -g ${settings.claude_code_package}`;
    }
    return `npm install ${settings.claude_code_package}`;
  }, [settings]);

  if (!settings) {
    return <Alert type="info" message="Loading installer settings..." />;
  }

  return (
    <Flex vertical style={{ gap: 12 }}>
      {error ? <Alert type="error" message={error} /> : null}

      <Card size="small">
        <Flex vertical style={{ gap: 8 }}>
          <Text strong>Claude Code Installer</Text>
          <Input
            value={settings.claude_code_package}
            onChange={(e) =>
              setSettings({ ...settings, claude_code_package: e.target.value })
            }
            placeholder={DEFAULT_CLAUDE_CODE_PACKAGE}
          />
          <Input
            value={settings.claude_router_package}
            onChange={(e) =>
              setSettings({ ...settings, claude_router_package: e.target.value })
            }
            placeholder={DEFAULT_CLAUDE_ROUTER_PACKAGE}
          />
          <Select
            value={settings.install_scope}
            onChange={(value) =>
              setSettings({ ...settings, install_scope: value })
            }
            options={scopeOptions}
          />
          <Flex style={{ gap: 8, flexWrap: "wrap" }}>
            <Button onClick={onSave} loading={isSaving}>
              Save Settings
            </Button>
            <Button onClick={onDetect} loading={isDetecting}>
              Detect npm
            </Button>
          </Flex>
          {npmStatus ? (
            <Text type={npmStatus.available ? "success" : "danger"}>
              {npmStatus.available
                ? `npm ${npmStatus.version ?? ""}`
                : `npm unavailable${npmStatus.error ? `: ${npmStatus.error}` : ""}`}
            </Text>
          ) : null}
          <Text type="secondary">
            Updates are not automated yet. Run {updateHint} to update manually.
          </Text>
          <Text type="secondary">
            Last install (code): {settings.last_installed?.claude_code ?? "-"}
          </Text>
          <Text type="secondary">
            Last install (router): {settings.last_installed?.claude_router ?? "-"}
          </Text>
        </Flex>
      </Card>

      <Card size="small">
        <Flex style={{ gap: 8, flexWrap: "wrap" }}>
          <Button
            type="primary"
            onClick={() => runInstall("claude_code")}
            disabled={isInstalling}
          >
            Install Claude Code
          </Button>
          <Button
            onClick={() => runInstall("claude_router")}
            disabled={isInstalling}
          >
            Install Claude Router
          </Button>
        </Flex>
      </Card>

      <Card size="small">
        <Input.TextArea
          value={output}
          autoSize={{ minRows: 6, maxRows: 16 }}
          readOnly
        />
      </Card>
    </Flex>
  );
};

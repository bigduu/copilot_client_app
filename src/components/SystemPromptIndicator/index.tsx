import React, { useState, useMemo, useEffect } from "react";
import { Tag, Popover, Typography, Space, theme } from "antd";
import { InfoCircleOutlined } from "@ant-design/icons";
import { useChatManager } from "../../hooks/useChatManager";
import { useBackendContext } from "../../hooks/useBackendContext";
import { SystemPromptService } from "../../services/SystemPromptService";
import { useAppStore } from "../../store";
import ReactMarkdown from "react-markdown";

const { Text, Paragraph } = Typography;
const { useToken } = theme;

interface SystemPromptIndicatorProps {
  compact?: boolean;
}

const SystemPromptIndicator: React.FC<SystemPromptIndicatorProps> = ({
  compact = true,
}) => {
  const { token } = useToken();
  const { currentChat } = useChatManager();
  const { currentContext } = useBackendContext();
  const systemPrompts = useAppStore((state) => state.systemPrompts);
  const [basePrompt, setBasePrompt] = useState<string>("");
  const [loading, setLoading] = useState(true);

  const systemPromptService = useMemo(
    () => SystemPromptService.getInstance(),
    [],
  );

  // Get current agent role
  const currentRole = useMemo(() => {
    return (
      currentContext?.config.agent_role ||
      currentChat?.config.agentRole ||
      "actor"
    );
  }, [currentContext, currentChat]);

  // Get system prompt name/ID
  const promptName = useMemo(() => {
    if (currentContext?.branches && currentContext.branches.length > 0) {
      const activeBranch = currentContext.branches.find(
        (b) => b.name === currentContext.active_branch_name,
      );
      if (activeBranch?.system_prompt?.id) {
        return activeBranch.system_prompt.id;
      }
    }
    if (currentChat?.config?.systemPromptId) {
      return currentChat.config.systemPromptId;
    }
    return null;
  }, [currentContext, currentChat]);

  // Load base prompt content
  useEffect(() => {
    const loadBasePrompt = async () => {
      setLoading(true);
      try {
        // Try to get from backend context first
        if (currentContext?.branches && currentContext.branches.length > 0) {
          const activeBranch = currentContext.branches.find(
            (b) => b.name === currentContext.active_branch_name,
          );
          if (activeBranch?.system_prompt?.content) {
            setBasePrompt(activeBranch.system_prompt.content);
            setLoading(false);
            return;
          }
        }

        // Try to get from chat config
        if (currentChat?.config?.systemPromptId) {
          const systemPromptId = currentChat.config.systemPromptId;

          // First try user-defined prompts
          const userPrompt = systemPrompts.find((p) => p.id === systemPromptId);
          if (userPrompt?.content) {
            setBasePrompt(userPrompt.content);
            setLoading(false);
            return;
          }

          // Fallback to service
          const preset =
            await systemPromptService.findPresetById(systemPromptId);
          if (preset?.content) {
            setBasePrompt(preset.content);
            setLoading(false);
            return;
          }
        }
        setBasePrompt("");
      } catch (error) {
        console.error("Failed to load system prompt:", error);
        setBasePrompt("");
      } finally {
        setLoading(false);
      }
    };

    loadBasePrompt();
  }, [currentChat?.config, currentContext, systemPromptService, systemPrompts]);

  // Define promptPreview before any early returns
  const promptPreview = useMemo(() => {
    if (!basePrompt) return "No system prompt";
    // Get first line or first 80 characters
    const firstLine = basePrompt.split("\n")[0].trim();
    if (firstLine.length > 80) {
      return firstLine.substring(0, 80) + "...";
    }
    return firstLine || "System Prompt";
  }, [basePrompt]);

  // Define promptContent before any early returns
  const promptContent = (
    <div
      style={{
        maxWidth: "600px",
        maxHeight: "400px",
        overflowY: "auto",
        paddingRight: token.paddingXS,
      }}
    >
      <Space
        direction="vertical"
        size={token.marginSM}
        style={{ width: "100%" }}
      >
        {promptName && (
          <Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
            Prompt: <Text strong>{promptName}</Text>
          </Text>
        )}
        <ReactMarkdown
          components={{
            p: ({ children }) => (
              <Text style={{ display: "block", marginBottom: token.marginXS }}>
                {children}
              </Text>
            ),
            ul: ({ children }) => (
              <ul style={{ marginBottom: token.marginXS, paddingLeft: 20 }}>
                {children}
              </ul>
            ),
            ol: ({ children }) => (
              <ol style={{ marginBottom: token.marginXS, paddingLeft: 20 }}>
                {children}
              </ol>
            ),
          }}
        >
          {basePrompt}
        </ReactMarkdown>
      </Space>
    </div>
  );

  // Early return after all hooks and memoized values are defined
  if (!basePrompt && !loading) {
    return null;
  }

  if (compact) {
    return (
      <Popover
        content={promptContent}
        title={
          <Space>
            <Text strong>System Prompt</Text>
            {currentRole && (
              <Tag
                color={currentRole === "planner" ? "blue" : "green"}
                style={{
                  lineHeight: 1,
                  padding: "2px 8px",
                }}
              >
                {currentRole === "planner" ? "Planner" : "Actor"}
              </Tag>
            )}
          </Space>
        }
        trigger="click"
        placement="bottomLeft"
      >
        <Tag
          icon={<InfoCircleOutlined />}
          color="default"
          style={{
            cursor: "pointer",
            fontSize: token.fontSizeSM,
            marginBottom: token.marginXS,
          }}
        >
          {loading ? "Loading..." : promptPreview}
        </Tag>
      </Popover>
    );
  }

  return (
    <div
      style={{
        padding: token.paddingXS,
        background: token.colorFillTertiary,
        borderRadius: token.borderRadiusSM,
        marginBottom: token.marginSM,
      }}
    >
      <Space align="start">
        <InfoCircleOutlined style={{ color: token.colorTextSecondary }} />
        <div style={{ flex: 1 }}>
          <Space style={{ marginBottom: token.marginXS }}>
            <Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
              System Prompt:
            </Text>
            {currentRole && (
              <Tag
                color={currentRole === "planner" ? "blue" : "green"}
                style={{
                  lineHeight: 1,
                  padding: "2px 8px",
                }}
              >
                {currentRole === "planner" ? "Planner" : "Actor"}
              </Tag>
            )}
          </Space>
          <Paragraph
            ellipsis={{ rows: 2, expandable: true, tooltip: basePrompt }}
            style={{ fontSize: token.fontSizeSM, marginBottom: 0 }}
          >
            {basePrompt || "No system prompt"}
          </Paragraph>
        </div>
      </Space>
    </div>
  );
};

export default SystemPromptIndicator;

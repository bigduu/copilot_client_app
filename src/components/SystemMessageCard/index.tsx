import React, { useState, useEffect, useMemo } from "react";
import { Card, Space, Typography, theme, Collapse, Tag, Button } from "antd";
import { EyeOutlined, CopyOutlined } from "@ant-design/icons";
import ReactMarkdown from "react-markdown";
import { useChatManager } from "../../hooks/useChatManager";
import { useBackendContext } from "../../hooks/useBackendContext";
import { SystemPromptService } from "../../services/SystemPromptService";
import { Message } from "../../types/chat";
import { useAppStore } from "../../store";

const { Text, Paragraph } = Typography;
const { useToken } = theme;

interface SystemMessageCardProps {
  message: Message;
}

const SystemMessageCard: React.FC<SystemMessageCardProps> = ({ message }) => {
  const { token } = useToken();
  const { currentChat } = useChatManager();
  const { currentContext } = useBackendContext();
  const systemPrompts = useAppStore((state) => state.systemPrompts);
  const [categoryDescription, setCategoryDescription] = useState<string>("");
  const [basePrompt, setBasePrompt] = useState<string>("");
  const [enhancedPrompt, setEnhancedPrompt] = useState<string | null>(null);
  const [loadingEnhanced, setLoadingEnhanced] = useState(false);
  const [showEnhanced, setShowEnhanced] = useState(false);

  const systemPromptService = React.useMemo(
    () => SystemPromptService.getInstance(),
    []
  );
  const systemMessageContent =
    message.role === "system" && typeof message.content === "string"
      ? message.content
      : "";

  // Get current agent role - prioritize backend context, always default to "actor"
  const currentRole = useMemo(() => {
    // Explicitly check for the role value, treating undefined as "actor"
    const contextRole = currentContext?.config?.agent_role;
    const chatRole = currentChat?.config?.agentRole;
    const role = contextRole ?? chatRole ?? "actor";

    console.log("[SystemMessageCard] Current role:", role, {
      fromContext: contextRole,
      fromChat: chatRole,
      contextId: currentContext?.id,
      hasContext: !!currentContext,
    });
    return role;
  }, [
    currentContext?.config?.agent_role,
    currentContext?.id,
    currentChat?.config?.agentRole,
  ]);

  // Load base prompt content
  useEffect(() => {
    const loadBasePrompt = async () => {
      if (!currentChat?.config) {
        // Try to get from backend context
        const activeBranch = currentContext?.branches?.find(
          (b) => b.name === currentContext?.active_branch_name
        );
        if (activeBranch?.system_prompt?.content) {
          setBasePrompt(activeBranch.system_prompt.content);
          return;
        }
        return;
      }

      try {
        const { systemPromptId, toolCategory } = currentChat.config;

        // 1. First, try to find the content in the user-defined prompts from Zustand
        if (systemPromptId) {
          const userPrompt = systemPrompts.find((p) => p.id === systemPromptId);
          if (userPrompt?.content) {
            setBasePrompt(userPrompt.content);
            return;
          }
          if (userPrompt?.description) {
            setCategoryDescription(userPrompt.description);
          }
        }

        // 2. If not found, try the original logic with the service
        if (systemPromptId) {
          const preset = await systemPromptService.findPresetById(
            systemPromptId
          );
          if (preset?.content) {
            setBasePrompt(preset.content);
            return;
          }
          if (preset?.description) {
            setCategoryDescription(preset.description);
          }
        }

        // toolCategory is deprecated, system prompts are managed directly
        // This block is kept for backward compatibility but will be removed
        if (toolCategory) {
          // Try to find a prompt with matching ID (toolCategory was often used as prompt ID)
          const presets = await systemPromptService.getSystemPromptPresets();
          const matchingPreset = presets.find(
            (preset) =>
              preset.id === toolCategory || preset.category === toolCategory
          );
          if (matchingPreset?.content) {
            setBasePrompt(matchingPreset.content);
          }
          if (matchingPreset?.description) {
            setCategoryDescription(matchingPreset.description);
          }
        }
      } catch (error) {
        console.error("Failed to load base prompt:", error);
      }
    };

    loadBasePrompt();
  }, [currentChat?.config, currentContext, systemPromptService, systemPrompts]);

  // Load enhanced prompt when requested
  const loadEnhancedPrompt = async () => {
    if (!basePrompt || loadingEnhanced) return;

    setLoadingEnhanced(true);
    try {
      // Build enhanced prompt on frontend (since backend API might not support role parameter)
      // For now, we'll build it client-side
      const roleSection = buildRoleSection(currentRole as "planner" | "actor");
      const enhanced = `${basePrompt}\n\n${roleSection}`;
      setEnhancedPrompt(enhanced);
      setShowEnhanced(true);
    } catch (error) {
      console.error("Failed to load enhanced prompt:", error);
    } finally {
      setLoadingEnhanced(false);
    }
  };

  // Build role-specific section (simplified version matching backend)
  const buildRoleSection = (role: "planner" | "actor"): string => {
    if (role === "planner") {
      return `# CURRENT ROLE: PLANNER

You are operating in the PLANNER role. Your responsibilities:
1. Analyze the user's request thoroughly
2. Read necessary files and information (read-only access)
3. Create a detailed step-by-step plan
4. Discuss the plan with the user
5. Refine based on feedback

YOUR PERMISSIONS:
- ✅ Read files, search code, list directories
- ❌ Write, create, or delete files
- ❌ Execute commands

IMPORTANT:
- You CANNOT modify any files in this role
- Only read-only tools are available to you
- If you need write access, the user must switch you to ACTOR role
- After plan approval, the user will switch you to ACTOR role for execution

OUTPUT FORMAT:
When you create a plan, output it in the following JSON format:

{
  "goal": "Brief summary of what we're trying to accomplish",
  "steps": [
    {
      "step_number": 1,
      "action": "What you will do",
      "reason": "Why this is necessary",
      "tools_needed": ["list", "of", "tools"],
      "estimated_time": "rough estimate"
    }
  ],
  "estimated_total_time": "total time estimate",
  "risks": ["list any potential issues"],
  "prerequisites": ["anything user needs to prepare"]
}

After presenting the plan, discuss it with the user. When they approve, they will switch to ACT mode for execution.`;
    } else {
      return `# CURRENT ROLE: ACTOR

You are operating in the ACTOR role. Your responsibilities:
1. Execute the approved plan (if any)
2. Use all available tools to accomplish tasks
3. Make small adjustments as needed
4. Ask for approval on major changes

YOUR PERMISSIONS:
- ✅ Read, write, create, delete files
- ✅ Execute commands
- ✅ Full tool access

AUTONOMY GUIDELINES:
- **Small changes**: Proceed (formatting, obvious fixes, typos)
- **Medium changes**: Mention but proceed (refactoring within scope)
- **Large changes**: Ask via question format (delete files, major refactors, security changes)

QUESTION FORMAT:
When you need to ask for approval, use this format:

{
  "type": "question",
  "question": "Clear question for the user",
  "context": "Why you're asking / what you discovered",
  "severity": "critical" | "major" | "minor",
  "options": [
    {
      "label": "Short label",
      "value": "internal_value",
      "description": "Longer explanation"
    }
  ],
  "default": "recommended_value"
}

When to ask:
- ALWAYS: Deleting files, major refactors, security-sensitive changes
- USUALLY: Changes beyond original plan, uncertainty about approach
- RARELY: Minor formatting, obvious fixes, style adjustments`;
    }
  };

  const promptToDisplay = useMemo(() => {
    if (showEnhanced && enhancedPrompt) {
      return enhancedPrompt;
    }
    if (basePrompt) {
      return basePrompt;
    }
    if (categoryDescription) {
      return categoryDescription;
    }
    if (message.role === "system") {
      return systemMessageContent;
    }
    return "System prompt is being prepared...";
  }, [showEnhanced, enhancedPrompt, basePrompt, categoryDescription, message]);

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch (e) {
      console.error("Failed to copy text:", e);
    }
  };

  return (
    <Card
      style={{
        width: "100%",
        maxWidth: "100%",
        background: token.colorBgContainer,
        borderRadius: token.borderRadiusLG,
        boxShadow: token.boxShadow,
      }}
    >
      <Space
        direction="vertical"
        size={token.marginSM}
        style={{ width: "100%" }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: token.marginXS,
            }}
          >
            <Text
              type="secondary"
              strong
              style={{ fontSize: token.fontSizeSM }}
            >
              System Prompt
            </Text>
            {currentRole && (
              <Tag color={currentRole === "planner" ? "blue" : "green"}>
                {currentRole === "planner" ? "Planner" : "Actor"} Mode
              </Tag>
            )}
          </div>
          <Space>
            {basePrompt && !showEnhanced && (
              <Button
                type="text"
                size="small"
                icon={<EyeOutlined />}
                onClick={loadEnhancedPrompt}
                loading={loadingEnhanced}
              >
                View Enhanced
              </Button>
            )}
            <Button
              type="text"
              size="small"
              icon={<CopyOutlined />}
              onClick={() => copyToClipboard(promptToDisplay)}
            >
              Copy
            </Button>
          </Space>
        </div>

        <Collapse
          ghost
          activeKey={showEnhanced ? ["enhanced"] : ["base"]}
          onChange={(keys) => {
            if (keys.includes("enhanced")) {
              loadEnhancedPrompt();
            } else {
              setShowEnhanced(false);
            }
          }}
          items={[
            {
              key: "base",
              label: basePrompt ? "Base Prompt" : "Description",
              children: (
                <div
                  style={{
                    maxHeight: "300px",
                    overflowY: "auto",
                    paddingRight: token.paddingXS,
                  }}
                >
                  <ReactMarkdown
                    components={{
                      p: ({ children }) => (
                        <Paragraph style={{ marginBottom: token.marginSM }}>
                          {children}
                        </Paragraph>
                      ),
                      ol: ({ children }) => (
                        <ol
                          style={{
                            marginBottom: token.marginSM,
                            paddingLeft: 20,
                          }}
                        >
                          {children}
                        </ol>
                      ),
                      ul: ({ children }) => (
                        <ul
                          style={{
                            marginBottom: token.marginSM,
                            paddingLeft: 20,
                          }}
                        >
                          {children}
                        </ul>
                      ),
                      li: ({ children }) => (
                        <li style={{ marginBottom: token.marginXS }}>
                          {children}
                        </li>
                      ),
                      h1: ({ children }) => (
                        <Text
                          strong
                          style={{
                            fontSize: token.fontSizeHeading3,
                            marginBottom: token.marginSM,
                            display: "block",
                          }}
                        >
                          {children}
                        </Text>
                      ),
                    }}
                  >
                    {basePrompt || categoryDescription || systemMessageContent}
                  </ReactMarkdown>
                </div>
              ),
            },
            ...(basePrompt
              ? [
                  {
                    key: "enhanced",
                    label: (
                      <span>
                        Enhanced Prompt{" "}
                        <Tag
                          color="blue"
                          style={{ marginLeft: token.marginXS }}
                        >
                          {currentRole === "planner" ? "Planner" : "Actor"}
                        </Tag>
                      </span>
                    ),
                    children: enhancedPrompt ? (
                      <div
                        style={{
                          maxHeight: "400px",
                          overflowY: "auto",
                          paddingRight: token.paddingXS,
                        }}
                      >
                        <ReactMarkdown
                          components={{
                            p: ({ children }) => (
                              <Paragraph
                                style={{ marginBottom: token.marginSM }}
                              >
                                {children}
                              </Paragraph>
                            ),
                            ol: ({ children }) => (
                              <ol
                                style={{
                                  marginBottom: token.marginSM,
                                  paddingLeft: 20,
                                }}
                              >
                                {children}
                              </ol>
                            ),
                            ul: ({ children }) => (
                              <ul
                                style={{
                                  marginBottom: token.marginSM,
                                  paddingLeft: 20,
                                }}
                              >
                                {children}
                              </ul>
                            ),
                            li: ({ children }) => (
                              <li style={{ marginBottom: token.marginXS }}>
                                {children}
                              </li>
                            ),
                            h1: ({ children }) => (
                              <Text
                                strong
                                style={{
                                  fontSize: token.fontSizeHeading3,
                                  marginBottom: token.marginSM,
                                  display: "block",
                                  color: token.colorPrimary,
                                }}
                              >
                                {children}
                              </Text>
                            ),
                            h2: ({ children }) => (
                              <Text
                                strong
                                style={{
                                  fontSize: token.fontSizeHeading4,
                                  marginBottom: token.marginSM,
                                  display: "block",
                                }}
                              >
                                {children}
                              </Text>
                            ),
                          }}
                        >
                          {enhancedPrompt}
                        </ReactMarkdown>
                      </div>
                    ) : (
                      <div>Loading enhanced prompt...</div>
                    ),
                  },
                ]
              : []),
          ]}
        />
      </Space>
    </Card>
  );
};

export default SystemMessageCard;

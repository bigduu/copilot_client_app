import React, { useState, useMemo } from "react";
import { Space, theme, Tag, Alert, message as antdMessage } from "antd";
import { ToolOutlined } from "@ant-design/icons";
import { MessageInput } from "../MessageInput";
import InputPreview from "./InputPreview";
import WorkflowSelector from "../WorkflowSelector";
import WorkflowParameterForm from "../WorkflowParameterForm";
import { useChatController } from "../../contexts/ChatControllerContext";
import { useSystemPrompt } from "../../hooks/useSystemPrompt";
import { WorkflowService, WorkflowDefinition } from "../../services/WorkflowService";

const { useToken } = theme;

interface InputContainerProps {
  isCenteredLayout?: boolean;
}

export const InputContainer: React.FC<InputContainerProps> = ({
  isCenteredLayout = false,
}) => {
  const [showWorkflowSelector, setShowWorkflowSelector] = useState(false);
  const [workflowSearchText, setWorkflowSearchText] = useState("");
  const [selectedWorkflow, setSelectedWorkflow] = useState<WorkflowDefinition | null>(null);
  const [showParameterForm, setShowParameterForm] = useState(false);
  const [workflowDescription, setWorkflowDescription] = useState("");
  const { token } = useToken();
  const {
    currentMessages,
    currentChat,
    interactionState,
    sendMessage,
    retryLastMessage,
    send,
  } = useChatController();
  const isStreaming = interactionState.matches("THINKING");
  const workflowService = WorkflowService.getInstance();
  const [messageApi, contextHolder] = antdMessage.useMessage();

  // TODO: selectedSystemPromptPresetId needs to be retrieved from the new store
  const selectedSystemPromptPresetId = null;

  // Use system prompt hook instead of direct service
  const systemPromptId =
    currentChat?.config.systemPromptId || selectedSystemPromptPresetId;
  // Note: currentSystemPromptInfo is fetched but not used in simplified version
  useSystemPrompt(systemPromptId);

  // Simplified: No longer using tool-specific mode restrictions
  // All tool management is now handled by backend categories
  const isToolSpecificMode = false;
  const isRestrictConversation = false;
  const allowedTools: string[] = [];
  const autoToolPrefix = undefined;

  // Removed lock functionality since everything is controlled by categories

  // Use the new chat input hook for state management
  // State management for the input itself
  const [content, setContent] = useState("");
  const [referenceText, setReferenceText] = useState<string | null>(null);

  // Create a new handleSubmit that uses our new hook
  const handleSubmit = (images?: any[]) => {
    if (!content.trim() && (!images || images.length === 0)) return;
    sendMessage(content, images);
    setContent("");
    setReferenceText(null); // Clear reference after sending
  };

  // Dummy functions to satisfy props, will be cleaned up
  const handleCloseReferencePreview = () => setReferenceText(null);

  // Handle input changes to detect workflow selector trigger
  const handleInputChange = (value: string) => {
    setContent(value);

    // Check if user typed '/' at the end
    if (value.endsWith("/")) {
      setShowWorkflowSelector(true);
      setWorkflowSearchText("");
    } else if (value.includes("/") && showWorkflowSelector) {
      // Extract search text after the last '/'
      const slashIndex = value.lastIndexOf("/");
      const searchText = value.substring(slashIndex + 1);
      setWorkflowSearchText(searchText);
    } else {
      setShowWorkflowSelector(false);
    }
  };

  // Handle workflow selection
  const handleWorkflowSelect = async (workflowName: string) => {
    console.log("[InputContainer] Workflow selected:", workflowName);
    setShowWorkflowSelector(false);
    
    try {
      // Fetch workflow details
      const workflow = await workflowService.getWorkflowDetails(workflowName);
      if (!workflow) {
        messageApi.error(`Workflow '${workflowName}' not found`);
        return;
      }
      
      // Extract description from input (text after /workflow_name)
      const slashIndex = content.lastIndexOf("/");
      const afterWorkflow = content.substring(slashIndex + workflowName.length + 1).trim();
      setWorkflowDescription(afterWorkflow);
      
      // Clear input
      setContent("");
      
      // Show parameter form
      setSelectedWorkflow(workflow);
      setShowParameterForm(true);
    } catch (error) {
      console.error("[InputContainer] Failed to load workflow:", error);
      messageApi.error("Failed to load workflow details");
    }
  };

  // Handle workflow selector cancel
  const handleWorkflowSelectorCancel = () => {
    setShowWorkflowSelector(false);
  };

  // Handle auto-completion (space/tab key)
  const handleAutoComplete = (workflowName: string) => {
    // Replace the workflow selection part with the selected workflow and add space
    const slashIndex = content.lastIndexOf("/");
    const beforeSlash = content.substring(0, slashIndex);
    setContent(`${beforeSlash}/${workflowName} `);
    setShowWorkflowSelector(false);
  };

  // Handle workflow parameter form submission
  const handleWorkflowExecute = async (parameters: Record<string, any>) => {
    if (!selectedWorkflow) return;
    
    console.log("[InputContainer] Executing workflow:", selectedWorkflow.name, parameters);
    setShowParameterForm(false);
    
    try {
      // Execute workflow directly via backend API (no approval needed - user already approved by clicking Execute)
      const result = await workflowService.executeWorkflow({
        workflow_name: selectedWorkflow.name,
        parameters,
      });
      
      if (result.success) {
        messageApi.success(`Workflow '${selectedWorkflow.name}' executed successfully`);
        // TODO: Display WorkflowExecutionFeedback in chat
        // For now, we'll just show a success message
        // Workflows execute directly without going through the chat message flow
        // This prevents the backend from parsing them as tool commands
      } else {
        messageApi.error(result.error || "Workflow execution failed");
      }
    } catch (error) {
      console.error("[InputContainer] Workflow execution failed:", error);
      messageApi.error("Failed to execute workflow");
    } finally {
      setSelectedWorkflow(null);
      setWorkflowDescription("");
    }
  };

  // Handle workflow parameter form cancel
  const handleWorkflowCancel = () => {
    setShowParameterForm(false);
    setSelectedWorkflow(null);
    setWorkflowDescription("");
  };

  // Generate placeholder text based on reference and current mode
  const placeholder = useMemo(() => {
    if (referenceText) {
      return "Send a message (includes reference)";
    }

    if (isToolSpecificMode) {
      if (isRestrictConversation) {
        return `Tool calls only (allowed tools: ${allowedTools.join(", ")})`;
      } else if (autoToolPrefix) {
        return `Auto-prefix mode: ${autoToolPrefix} (type '/' to select tools)`;
      } else {
        return `Tool-specific mode (allowed tools: ${allowedTools.join(", ")})`;
      }
    }

    return "Send a message... (type '/' for workflows)";
  }, [
    referenceText,
    isToolSpecificMode,
    isRestrictConversation,
    allowedTools,
    autoToolPrefix,
  ]);

  return (
    <div
      style={{
        padding: `${token.paddingLG}px ${token.paddingMD}px`,
        minHeight: "80px",
        background: token.colorBgContainer,
        borderTop: isCenteredLayout
          ? "none"
          : `1px solid ${token.colorBorderSecondary}`,
        boxShadow: isCenteredLayout ? "none" : "0 -2px 8px rgba(0,0,0,0.06)",
        width: "100%",
      }}
    >
      {/* Ant Design message context holder */}
      {contextHolder}
      {/* Tool-specific mode alert */}
      {isToolSpecificMode && (
        <Alert
          type={isRestrictConversation ? "warning" : "info"}
          showIcon
          style={{ marginBottom: token.marginSM }}
          message={
            <Space wrap>
              <span>
                {isRestrictConversation
                  ? "Strict Mode: Tool calls only"
                  : "Tool-specific Mode"}
              </span>
              {autoToolPrefix && (
                <Tag color="blue">
                  <ToolOutlined /> Auto-prefix: {autoToolPrefix}
                </Tag>
              )}
            </Space>
          }
          description={
            allowedTools.length > 0 && (
              <Space wrap>
                <span>Allowed tools:</span>
                {allowedTools.map((tool: string) => (
                  <Tag key={tool} color="green">
                    /{tool}
                  </Tag>
                ))}
              </Space>
            )
          }
        />
      )}

      {referenceText && (
        <InputPreview
          text={referenceText}
          onClose={handleCloseReferencePreview}
        />
      )}

      <div style={{ position: "relative" }}>
        <MessageInput
          value={content}
          onChange={handleInputChange}
          onSubmit={(_content, images) => handleSubmit(images)}
          onRetry={retryLastMessage}
          onCancel={() => send({ type: "CANCEL" })}
          isStreaming={isStreaming}
          isCenteredLayout={isCenteredLayout}
          placeholder={placeholder}
          hasMessages={currentMessages.length > 0}
          allowImages={true}
          isToolSelectorVisible={showWorkflowSelector}
        />

        <WorkflowSelector
          visible={showWorkflowSelector}
          onSelect={handleWorkflowSelect}
          onCancel={handleWorkflowSelectorCancel}
          onAutoComplete={handleAutoComplete}
          searchText={workflowSearchText}
        />

        <WorkflowParameterForm
          workflow={selectedWorkflow}
          visible={showParameterForm}
          onSubmit={handleWorkflowExecute}
          onCancel={handleWorkflowCancel}
          initialDescription={workflowDescription}
        />
      </div>
    </div>
  );
};

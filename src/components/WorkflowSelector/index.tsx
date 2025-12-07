import React, { useEffect, useState, useRef } from "react";
import { theme, Spin } from "antd";
import {
  WorkflowManagerService,
  WorkflowMetadata,
} from "../../services/WorkflowManagerService";
import { useChatController } from "../../contexts/ChatControllerContext";

const { useToken } = theme;

interface WorkflowSelectorProps {
  visible: boolean;
  onSelect: (workflow: { name: string; content: string }) => void;
  onCancel: () => void;
  searchText: string;
  onAutoComplete?: (workflowName: string) => void;
}

const WorkflowSelector: React.FC<WorkflowSelectorProps> = ({
  visible,
  onSelect,
  onCancel,
  searchText,
  onAutoComplete,
}) => {
  const [workflows, setWorkflows] = useState<WorkflowMetadata[]>([]);
  const [filteredWorkflows, setFilteredWorkflows] = useState<
    WorkflowMetadata[]
  >([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const { token } = useToken();
  const containerRef = useRef<HTMLDivElement>(null);
  const selectedItemRef = useRef<HTMLDivElement>(null);
  const { currentChat } = useChatController();

  // Fetch workflows when component becomes visible
  useEffect(() => {
    if (visible) {
      const workflowService = WorkflowManagerService.getInstance();

      const fetchWorkflows = async () => {
        setIsLoading(true);
        try {
          const workspacePath = currentChat?.config.workspacePath;
          const fetchedWorkflows = await workflowService.listWorkflows(
            workspacePath
          );
          console.log(
            "[WorkflowSelector] Fetched workflows:",
            fetchedWorkflows,
          );
          setWorkflows(fetchedWorkflows);
          setSelectedIndex(0);
        } catch (error) {
          console.error("[WorkflowSelector] Failed to fetch workflows:", error);
          setWorkflows([]);
        } finally {
          setIsLoading(false);
        }
      };

      fetchWorkflows();
    }
  }, [visible, currentChat?.config.workspacePath]);

  // Filter workflows based on search text
  useEffect(() => {
    const filtered = workflows.filter((workflow) =>
      workflow.name.toLowerCase().includes(searchText.toLowerCase())
    );

    setFilteredWorkflows(filtered);
    setSelectedIndex(0);
  }, [workflows, searchText]);

  // Auto-scroll to keep selected item visible
  useEffect(() => {
    if (selectedItemRef.current && containerRef.current) {
      const container = containerRef.current;
      const selectedItem = selectedItemRef.current;

      const containerRect = container.getBoundingClientRect();
      const selectedRect = selectedItem.getBoundingClientRect();

      // Check if selected item is above the visible area
      if (selectedRect.top < containerRect.top) {
        selectedItem.scrollIntoView({ block: "start", behavior: "smooth" });
      }
      // Check if selected item is below the visible area
      else if (selectedRect.bottom > containerRect.bottom) {
        selectedItem.scrollIntoView({ block: "end", behavior: "smooth" });
      }
    }
  }, [selectedIndex, filteredWorkflows]);

  // Handle workflow selection (fetch content and call onSelect)
  const handleWorkflowSelect = async (workflowName: string) => {
    try {
      const workflowService = WorkflowManagerService.getInstance();
      const workspacePath = currentChat?.config.workspacePath;
      const workflow = await workflowService.getWorkflow(
        workflowName,
        workspacePath
      );

      onSelect({
        name: workflow.name,
        content: workflow.content,
      });
    } catch (error) {
      console.error(
        `[WorkflowSelector] Failed to load workflow '${workflowName}':`,
        error
      );
      // Still call onSelect with empty content to close selector
      onSelect({ name: workflowName, content: "" });
    }
  };

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!visible) return;

      switch (event.key) {
        case "ArrowDown":
        case "n": // Ctrl+N for next
          if (event.key === "n" && !event.ctrlKey) break;
          event.preventDefault();
          event.stopPropagation();
          setSelectedIndex((prev) =>
            prev < filteredWorkflows.length - 1 ? prev + 1 : 0,
          );
          break;
        case "ArrowUp":
        case "p": // Ctrl+P for previous
          if (event.key === "p" && !event.ctrlKey) break;
          event.preventDefault();
          event.stopPropagation();
          setSelectedIndex((prev) =>
            prev > 0 ? prev - 1 : filteredWorkflows.length - 1,
          );
          break;
        case "Enter":
          event.preventDefault();
          event.stopPropagation();
          if (filteredWorkflows[selectedIndex]) {
            handleWorkflowSelect(filteredWorkflows[selectedIndex].name);
          }
          break;
        case " ": // Space key for auto-completion
          event.preventDefault();
          event.stopPropagation();
          if (filteredWorkflows[selectedIndex] && onAutoComplete) {
            onAutoComplete(filteredWorkflows[selectedIndex].name);
          }
          break;
        case "Tab": // Tab key for auto-completion
          event.preventDefault();
          event.stopPropagation();
          if (filteredWorkflows[selectedIndex] && onAutoComplete) {
            onAutoComplete(filteredWorkflows[selectedIndex].name);
          }
          break;
        case "Escape":
          event.preventDefault();
          event.stopPropagation();
          onCancel();
          break;
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [
    visible,
    filteredWorkflows,
    selectedIndex,
    onCancel,
    onAutoComplete,
    currentChat?.config.workspacePath,
  ]);

  if (!visible) {
    return null;
  }

  // Show loading state
  if (isLoading) {
    return (
      <div
        style={{
          position: "absolute",
          bottom: "100%",
          left: 0,
          right: 0,
          background: token.colorBgContainer,
          border: `1px solid ${token.colorBorderSecondary}`,
          borderRadius: token.borderRadiusSM,
          boxShadow: token.boxShadowSecondary,
          padding: `${token.paddingSM}px ${token.paddingMD}px`,
          zIndex: 1000,
          marginBottom: token.marginXS,
          textAlign: "center",
        }}
      >
        <Spin size="small" /> Loading workflows...
      </div>
    );
  }

  // Show "no workflows found" message if search doesn't match anything
  if (filteredWorkflows.length === 0) {
    return (
      <div
        style={{
          position: "absolute",
          bottom: "100%",
          left: 0,
          right: 0,
          background: token.colorBgContainer,
          border: `1px solid ${token.colorBorderSecondary}`,
          borderRadius: token.borderRadiusSM,
          boxShadow: token.boxShadowSecondary,
          padding: `${token.paddingSM}px ${token.paddingMD}px`,
          zIndex: 1000,
          marginBottom: token.marginXS,
          textAlign: "center",
          color: token.colorTextSecondary,
        }}
      >
        {searchText
          ? `No workflows found matching "${searchText}"`
          : "No workflows available. Create one to get started!"}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      style={{
        position: "absolute",
        bottom: "100%",
        left: 0,
        right: 0,
        background: token.colorBgContainer,
        border: `1px solid ${token.colorBorderSecondary}`,
        borderRadius: token.borderRadiusSM,
        boxShadow: token.boxShadowSecondary,
        maxHeight: 300,
        overflowY: "auto",
        zIndex: 1000,
        marginBottom: token.marginXS,
      }}
    >
      {/* Keyboard hints */}
      <div
        style={{
          padding: `${token.paddingXXS}px ${token.paddingSM}px`,
          borderBottom: `1px solid ${token.colorBorderSecondary}`,
          background: token.colorFillQuaternary,
          fontSize: token.fontSizeSM,
          color: token.colorTextTertiary,
        }}
      >
        ↑↓ Navigate • Ctrl+P/N Navigate • Enter Select • Space/Tab Complete •
        Esc Cancel
      </div>
      {filteredWorkflows.map((workflow, index) => (
        <div
          key={workflow.name}
          ref={index === selectedIndex ? selectedItemRef : null}
          style={{
            padding: `${token.paddingSM}px ${token.paddingMD}px`,
            cursor: "pointer",
            borderBottom:
              index < filteredWorkflows.length - 1
                ? `1px solid ${token.colorBorderSecondary}`
                : "none",
            backgroundColor:
              index === selectedIndex ? token.colorPrimaryBg : "transparent",
            transition: "background-color 0.2s",
          }}
          onClick={() => handleWorkflowSelect(workflow.name)}
          onMouseEnter={() => setSelectedIndex(index)}
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
                fontWeight: 600,
                color: token.colorPrimary,
                fontFamily: "monospace",
                fontSize: token.fontSizeSM,
              }}
            >
              /{workflow.name}
            </div>
            <div
              style={{
                fontSize: token.fontSizeSM,
                color: token.colorTextTertiary,
                background: token.colorFillQuaternary,
                padding: `2px ${token.paddingXXS}px`,
                borderRadius: token.borderRadiusXS,
              }}
            >
              {workflow.source === "workspace" ? "📁 Workspace" : "🌐 Global"}
            </div>
          </div>
          <div
            style={{
              color: token.colorTextSecondary,
              fontSize: token.fontSizeSM,
              marginTop: token.marginXXS,
              lineHeight: 1.4,
            }}
          >
            {workflow.filename} • {(workflow.size / 1024).toFixed(1)} KB
          </div>
        </div>
      ))}
    </div>
  );
};

export default WorkflowSelector;

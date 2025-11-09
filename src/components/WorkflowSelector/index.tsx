import React, { useEffect, useState, useRef } from "react";
import { theme } from "antd";
import {
  WorkflowDefinition,
  WorkflowService,
} from "../../services/WorkflowService";

const { useToken } = theme;

interface WorkflowSelectorProps {
  visible: boolean;
  onSelect: (workflowName: string) => void;
  onCancel: () => void;
  searchText: string;
  onAutoComplete?: (workflowName: string) => void;
  categoryFilter?: string; // Optional category filter
}

const WorkflowSelector: React.FC<WorkflowSelectorProps> = ({
  visible,
  onSelect,
  onCancel,
  searchText,
  onAutoComplete,
  categoryFilter,
}) => {
  const [workflows, setWorkflows] = useState<WorkflowDefinition[]>([]);
  const [filteredWorkflows, setFilteredWorkflows] = useState<
    WorkflowDefinition[]
  >([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const { token } = useToken();
  const containerRef = useRef<HTMLDivElement>(null);
  const selectedItemRef = useRef<HTMLDivElement>(null);

  // Fetch workflows when component becomes visible
  useEffect(() => {
    if (visible) {
      const workflowService = WorkflowService.getInstance();

      const fetchWorkflows = async () => {
        try {
          const fetchedWorkflows =
            await workflowService.getAvailableWorkflows();
          console.log(
            "[WorkflowSelector] Fetched workflows:",
            fetchedWorkflows,
          );
          setWorkflows(fetchedWorkflows);
          setSelectedIndex(0);
        } catch (error) {
          console.error("[WorkflowSelector] Failed to fetch workflows:", error);
          setWorkflows([]);
        }
      };

      fetchWorkflows();
    }
  }, [visible]);

  // Filter workflows based on search text and category
  useEffect(() => {
    let filtered = workflows.filter(
      (workflow) =>
        workflow.name.toLowerCase().includes(searchText.toLowerCase()) ||
        workflow.description.toLowerCase().includes(searchText.toLowerCase()),
    );

    // Apply category filter if specified
    if (categoryFilter) {
      filtered = filtered.filter(
        (workflow) => workflow.category === categoryFilter,
      );
    }

    setFilteredWorkflows(filtered);
    setSelectedIndex(0);
  }, [workflows, searchText, categoryFilter]);

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
            onSelect(filteredWorkflows[selectedIndex].name);
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
    onSelect,
    onCancel,
    onAutoComplete,
  ]);

  if (!visible) {
    return null;
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
        No workflows found matching "{searchText}"
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
          onClick={() => onSelect(workflow.name)}
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
            {workflow.category && (
              <div
                style={{
                  fontSize: token.fontSizeSM,
                  color: token.colorTextTertiary,
                  background: token.colorFillQuaternary,
                  padding: `2px ${token.paddingXXS}px`,
                  borderRadius: token.borderRadiusXS,
                }}
              >
                {workflow.category}
              </div>
            )}
          </div>
          <div
            style={{
              color: token.colorTextSecondary,
              fontSize: token.fontSizeSM,
              marginTop: token.marginXXS,
              lineHeight: 1.4,
            }}
          >
            {workflow.description}
          </div>
          {workflow.parameters.length > 0 && (
            <div
              style={{
                marginTop: token.marginXXS,
                fontSize: token.fontSizeSM,
                color: token.colorTextTertiary,
              }}
            >
              Parameters: {workflow.parameters.map((p) => p.name).join(", ")}
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

export default WorkflowSelector;







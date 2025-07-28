import React, { useEffect, useState, useRef } from "react";
import { theme } from "antd";
import { invoke } from "@tauri-apps/api/core";

const { useToken } = theme;

interface ParameterInfo {
  name: string;
  description: string;
  required: boolean;
  type: string;
}

interface ToolUIInfo {
  name: string;
  description: string;
  parameters: ParameterInfo[];
  hide_in_selector: boolean;
}

interface ToolSelectorProps {
  visible: boolean;
  onSelect: (toolName: string) => void;
  onCancel: () => void;
  searchText: string;
  onAutoComplete?: (toolName: string) => void;
  allowedTools?: string[]; // List of allowed tools, if empty shows all tools
  categoryId?: string; // Current tool category ID, used for strict mode filtering
}

const ToolSelector: React.FC<ToolSelectorProps> = ({
  visible,
  onSelect,
  onCancel,
  searchText,
  onAutoComplete,
  allowedTools,
  categoryId,
}) => {
  const [tools, setTools] = useState<ToolUIInfo[]>([]);
  const [filteredTools, setFilteredTools] = useState<ToolUIInfo[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const { token } = useToken();
  const containerRef = useRef<HTMLDivElement>(null);
  const selectedItemRef = useRef<HTMLDivElement>(null);

  // Fetch tools when component becomes visible
  useEffect(() => {
    if (visible) {
      invoke<ToolUIInfo[]>("get_tools_for_ui", { categoryId })
        .then((toolsList) => {
          setTools(toolsList);
          setSelectedIndex(0);
        })
        .catch((error) => {
          console.error("Failed to fetch tools:", error);
        });
    }
  }, [visible, categoryId]);

  // Filter tools based on search text and allowed tools
  useEffect(() => {
    let filtered = tools.filter(
      (tool) =>
        tool.name.toLowerCase().includes(searchText.toLowerCase()) ||
        tool.description.toLowerCase().includes(searchText.toLowerCase())
    );

    // 如果有工具权限限制，则只显示允许的工具
    if (allowedTools && allowedTools.length > 0) {
      filtered = filtered.filter((tool) => allowedTools.includes(tool.name));
    }

    setFilteredTools(filtered);
    setSelectedIndex(0);
  }, [tools, searchText, allowedTools]);

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
  }, [selectedIndex, filteredTools]);

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!visible) return;

      switch (event.key) {
        case "ArrowDown":
        case "n": // Ctrl+N for next
          if (event.key === "n" && !event.ctrlKey) break; // Only handle Ctrl+N
          event.preventDefault();
          event.stopPropagation();
          setSelectedIndex((prev) =>
            prev < filteredTools.length - 1 ? prev + 1 : 0
          );
          break;
        case "ArrowUp":
        case "p": // Ctrl+P for previous
          if (event.key === "p" && !event.ctrlKey) break; // Only handle Ctrl+P
          event.preventDefault();
          event.stopPropagation();
          setSelectedIndex((prev) =>
            prev > 0 ? prev - 1 : filteredTools.length - 1
          );
          break;
        case "Enter":
          event.preventDefault();
          event.stopPropagation();
          if (filteredTools[selectedIndex]) {
            onSelect(filteredTools[selectedIndex].name);
          }
          break;
        case " ": // Space key for auto-completion
          event.preventDefault();
          event.stopPropagation();
          if (filteredTools[selectedIndex] && onAutoComplete) {
            onAutoComplete(filteredTools[selectedIndex].name);
          }
          break;
        case "Tab": // Tab key for auto-completion
          event.preventDefault();
          event.stopPropagation();
          if (filteredTools[selectedIndex] && onAutoComplete) {
            onAutoComplete(filteredTools[selectedIndex].name);
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
    filteredTools,
    selectedIndex,
    onSelect,
    onCancel,
    onAutoComplete,
  ]);

  if (!visible) {
    return null;
  }

  // Show "no tools found" message if search doesn't match anything
  if (filteredTools.length === 0) {
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
        No tools found matching "{searchText}"
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
      {filteredTools.map((tool, index) => (
        <div
          key={tool.name}
          ref={index === selectedIndex ? selectedItemRef : null}
          style={{
            padding: `${token.paddingSM}px ${token.paddingMD}px`,
            cursor: "pointer",
            borderBottom:
              index < filteredTools.length - 1
                ? `1px solid ${token.colorBorderSecondary}`
                : "none",
            backgroundColor:
              index === selectedIndex ? token.colorPrimaryBg : "transparent",
            transition: "background-color 0.2s",
          }}
          onClick={() => onSelect(tool.name)}
          onMouseEnter={() => setSelectedIndex(index)}
        >
          <div
            style={{
              fontWeight: 600,
              color: token.colorPrimary,
              fontFamily: "monospace",
              fontSize: token.fontSizeSM,
            }}
          >
            /{tool.name}
          </div>
          <div
            style={{
              color: token.colorTextSecondary,
              fontSize: token.fontSizeSM,
              marginTop: token.marginXXS,
              lineHeight: 1.4,
            }}
          >
            {tool.description}
          </div>
          {tool.parameters.length > 0 && (
            <div
              style={{
                marginTop: token.marginXXS,
                fontSize: token.fontSizeSM,
                color: token.colorTextTertiary,
              }}
            >
              Parameters: {tool.parameters.map((p) => p.name).join(", ")}
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

export default ToolSelector;

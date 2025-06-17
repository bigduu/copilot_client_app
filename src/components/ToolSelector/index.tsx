import React, { useEffect, useState } from "react";
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

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!visible) return;

      switch (event.key) {
        case "ArrowDown":
          event.preventDefault();
          setSelectedIndex((prev) =>
            prev < filteredTools.length - 1 ? prev + 1 : 0
          );
          break;
        case "ArrowUp":
          event.preventDefault();
          setSelectedIndex((prev) =>
            prev > 0 ? prev - 1 : filteredTools.length - 1
          );
          break;
        case "Enter":
          event.preventDefault();
          if (filteredTools[selectedIndex]) {
            onSelect(filteredTools[selectedIndex].name);
          }
          break;
        case " ": // Space key for auto-completion
          event.preventDefault();
          if (filteredTools[selectedIndex] && onAutoComplete) {
            onAutoComplete(filteredTools[selectedIndex].name);
          }
          break;
        case "Tab": // Tab key for auto-completion
          event.preventDefault();
          if (filteredTools[selectedIndex] && onAutoComplete) {
            onAutoComplete(filteredTools[selectedIndex].name);
          }
          break;
        case "Escape":
          event.preventDefault();
          onCancel();
          break;
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [visible, filteredTools, selectedIndex, onSelect, onCancel]);

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
        ↑↓ Navigate • Enter Select • Space/Tab Complete • Esc Cancel
      </div>
      {filteredTools.map((tool, index) => (
        <div
          key={tool.name}
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

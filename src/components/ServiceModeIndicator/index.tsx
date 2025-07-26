import React from "react";
import { Tag, Tooltip, Badge } from "antd";
import {
  ApiOutlined,
  DesktopOutlined,
  ExclamationCircleOutlined,
} from "@ant-design/icons";
import { useServiceMode } from "../../hooks/useServiceMode";
import { useServiceHealth } from "../../hooks/useServiceHealth";

interface ServiceModeIndicatorProps {
  size?: "small" | "default";
  showTooltip?: boolean;
}

const ServiceModeIndicator: React.FC<ServiceModeIndicatorProps> = ({
  size = "small",
  showTooltip = true,
}) => {
  const { isOpenAIMode } = useServiceMode();
  const { health } = useServiceHealth();

  const getStatusColor = () => {
    if (isOpenAIMode) {
      return health.isHealthy ? "blue" : "red";
    }
    return "green"; // Tauri is always healthy
  };

  const getStatusIcon = () => {
    if (isOpenAIMode) {
      return health.isHealthy ? <ApiOutlined /> : <ExclamationCircleOutlined />;
    }
    return <DesktopOutlined />;
  };

  const tagContent = (
    <Badge
      status={
        isOpenAIMode ? (health.isHealthy ? "success" : "error") : "success"
      }
      dot={isOpenAIMode}
    >
      <Tag
        color={getStatusColor()}
        icon={getStatusIcon()}
        style={{
          fontSize: size === "small" ? "12px" : "14px",
          padding: size === "small" ? "2px 6px" : "4px 8px",
        }}
      >
        {isOpenAIMode ? "OpenAI API" : "Tauri"}
      </Tag>
    </Badge>
  );

  if (!showTooltip) {
    return tagContent;
  }

  const getTooltipTitle = () => {
    if (isOpenAIMode) {
      if (health.isHealthy) {
        return "OpenAI API mode - Service healthy (localhost:8080)";
      } else {
        return `OpenAI API mode - Service error: ${
          health.error || "Unknown error"
        }`;
      }
    }
    return "Tauri mode - Using native commands";
  };

  return <Tooltip title={getTooltipTitle()}>{tagContent}</Tooltip>;
};

export default ServiceModeIndicator;

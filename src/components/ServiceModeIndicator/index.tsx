import React from "react";
import { Tag, Tooltip, Badge } from "antd";
import { ApiOutlined, ExclamationCircleOutlined } from "@ant-design/icons";
import { useServiceHealth } from "../../hooks/useServiceHealth";

interface ServiceModeIndicatorProps {
  size?: "small" | "default";
  showTooltip?: boolean;
}

/**
 * ServiceModeIndicator - Shows Web API service health status
 * Simplified to only show Web/HTTP mode (no Tauri mode switching)
 */
const ServiceModeIndicator: React.FC<ServiceModeIndicatorProps> = ({
  size = "small",
  showTooltip = true,
}) => {
  const { health } = useServiceHealth();

  const statusColor = health.isHealthy ? "blue" : "red";
  const statusIcon = health.isHealthy ? (
    <ApiOutlined />
  ) : (
    <ExclamationCircleOutlined />
  );

  const tagContent = (
    <Badge status={health.isHealthy ? "success" : "error"} dot>
      <Tag
        color={statusColor}
        icon={statusIcon}
        style={{
          fontSize: size === "small" ? "12px" : "14px",
          padding: size === "small" ? "2px 6px" : "4px 8px",
        }}
      >
        Web API
      </Tag>
    </Badge>
  );

  if (!showTooltip) {
    return tagContent;
  }

  const tooltipTitle = health.isHealthy
    ? "Web API mode - Service healthy (localhost:8080)"
    : `Web API mode - Service error: ${health.error || "Unknown error"}`;

  return <Tooltip title={tooltipTitle}>{tagContent}</Tooltip>;
};

export default ServiceModeIndicator;

import React, { useState } from "react";
import { Button, Space, Tooltip, Typography, theme, message } from "antd";
import { ThunderboltOutlined, FileSearchOutlined } from "@ant-design/icons";
import { AgentRole } from "../../types/chat";

const { Text } = Typography;
const { useToken } = theme;

interface AgentRoleSelectorProps {
  currentRole: AgentRole;
  contextId: string;
  onRoleChange: (newRole: AgentRole) => Promise<void>;
  disabled?: boolean;
}

const AgentRoleSelector: React.FC<AgentRoleSelectorProps> = ({
  currentRole,
  contextId: _contextId,
  onRoleChange,
  disabled = false,
}) => {
  const { token } = useToken();
  const [loading, setLoading] = useState(false);
  const [messageApi, contextHolder] = message.useMessage();

  const handleRoleChange = async (newRole: AgentRole) => {
    if (newRole === currentRole || loading || disabled) return;

    setLoading(true);
    try {
      await onRoleChange(newRole);
      messageApi.success(
        `Switched to ${newRole === "planner" ? "Planner" : "Actor"} mode`,
      );
    } catch (error) {
      console.error("Failed to update agent role:", error);
      messageApi.error("Failed to switch agent role");
    } finally {
      setLoading(false);
    }
  };

  const plannerTooltip = (
    <div>
      <div style={{ fontWeight: 600, marginBottom: 4 }}>Planner Mode</div>
      <div style={{ fontSize: 12 }}>
        • Read-only analysis and planning
        <br />
        • Can read files, search code
        <br />
        • Creates structured execution plans
        <br />• Cannot modify files or execute commands
      </div>
    </div>
  );

  const actorTooltip = (
    <div>
      <div style={{ fontWeight: 600, marginBottom: 4 }}>Actor Mode</div>
      <div style={{ fontSize: 12 }}>
        • Full permissions for execution
        <br />
        • Can read, write, create, delete files
        <br />
        • Can execute commands
        <br />• Asks for approval on major changes
      </div>
    </div>
  );

  return (
    <>
      {contextHolder}
      <Space.Compact style={{ borderRadius: token.borderRadius }}>
        <Tooltip title={plannerTooltip} placement="bottom">
          <Button
            icon={<FileSearchOutlined />}
            type={currentRole === "planner" ? "primary" : "default"}
            onClick={() => handleRoleChange("planner")}
            loading={loading && currentRole === "actor"}
            disabled={disabled || (loading && currentRole === "planner")}
            style={{
              borderColor:
                currentRole === "planner"
                  ? token.colorPrimary
                  : token.colorBorder,
              backgroundColor:
                currentRole === "planner" ? token.colorPrimaryBg : undefined,
              color:
                currentRole === "planner"
                  ? token.colorPrimary
                  : token.colorText,
            }}
          >
            <Text
              style={{
                color: "inherit",
                fontWeight: currentRole === "planner" ? 600 : 400,
              }}
            >
              Planner
            </Text>
          </Button>
        </Tooltip>
        <Tooltip title={actorTooltip} placement="bottom">
          <Button
            icon={<ThunderboltOutlined />}
            type={currentRole === "actor" ? "primary" : "default"}
            onClick={() => handleRoleChange("actor")}
            loading={loading && currentRole === "planner"}
            disabled={disabled || (loading && currentRole === "actor")}
            style={{
              borderColor:
                currentRole === "actor"
                  ? token.colorPrimary
                  : token.colorBorder,
              backgroundColor:
                currentRole === "actor" ? token.colorPrimaryBg : undefined,
              color:
                currentRole === "actor" ? token.colorPrimary : token.colorText,
            }}
          >
            <Text
              style={{
                color: "inherit",
                fontWeight: currentRole === "actor" ? 600 : 400,
              }}
            >
              Actor
            </Text>
          </Button>
        </Tooltip>
      </Space.Compact>
    </>
  );
};

export default AgentRoleSelector;

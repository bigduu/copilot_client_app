import { useEffect, useState } from "react";
import { List, Tag, Space, message } from "antd";
import { invoke } from "@tauri-apps/api/core";
import { McpServersConfig, McpServerConfig } from "../../types/mcp";

export const MCPServerManagementComponent = () => {
  const [servers, setServers] = useState<Record<string, McpServerConfig>>({});
  const [statuses, setStatuses] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  // 获取所有 MCP server 配置
  const fetchServers = async () => {
    setLoading(true);
    try {
      const res = await invoke<McpServersConfig>("get_mcp_servers");
      setServers(res.mcpServers);
    } catch (e) {
      message.error("Failed to load MCP servers");
    }
    setLoading(false);
  };

  // 获取所有 server 状态
  const fetchStatuses = async () => {
    if (!Object.keys(servers || {}).length) return;
    const statusMap: Record<string, string> = {};
    await Promise.all(
      Object.keys(servers || {}).map(async (name) => {
        try {
          const status = await invoke("get_mcp_client_status", { name });
          statusMap[name] = (status as string) ?? "Unknown";
        } catch {
          statusMap[name] = "Unknown";
        }
      })
    );
    setStatuses(statusMap);
  };

  useEffect(() => {
    fetchServers();
  }, []);

  useEffect(() => {
    fetchStatuses();
    // eslint-disable-next-line
  }, [servers]);

  return (
    <div>
      <List
        loading={loading}
        dataSource={Object.entries(servers || {})}
        renderItem={([name, _config]) => (
          <List.Item>
            <Space>
              <b>{name}</b>
              <Tag
                color={
                  statuses[name] === "Running"
                    ? "green"
                    : statuses[name] === "Error"
                    ? "red"
                    : "default"
                }
              >
                {statuses[name] || "Unknown"}
              </Tag>
            </Space>
          </List.Item>
        )}
      />
    </div>
  );
};

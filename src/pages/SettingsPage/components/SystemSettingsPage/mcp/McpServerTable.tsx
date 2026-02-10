import { useMemo } from "react";
import { Button, Popconfirm, Space, Table, Tag, theme } from "antd";
import type { TableProps } from "antd";
import {
  ServerStatus,
  type McpServer,
} from "../../../../../services/mcp";
import type { McpServerAction } from "../hooks/useMcpSettings";

interface McpServerTableProps {
  servers: McpServer[];
  loading?: boolean;
  selectedServerId?: string | null;
  onSelectServer?: (serverId: string) => void;
  onEditServer?: (server: McpServer) => void;
  onDeleteServer?: (server: McpServer) => Promise<void> | void;
  onConnectServer?: (server: McpServer) => Promise<void> | void;
  onDisconnectServer?: (server: McpServer) => Promise<void> | void;
  onRefreshTools?: (server: McpServer) => Promise<void> | void;
  isServerActionLoading?: (serverId: string, action: McpServerAction) => boolean;
}

const statusColorMap: Record<ServerStatus, string> = {
  [ServerStatus.Connecting]: "blue",
  [ServerStatus.Ready]: "green",
  [ServerStatus.Degraded]: "orange",
  [ServerStatus.Stopped]: "default",
  [ServerStatus.Error]: "red",
};

const isConnectedStatus = (status: ServerStatus): boolean =>
  status === ServerStatus.Connecting ||
  status === ServerStatus.Ready ||
  status === ServerStatus.Degraded;

export const McpServerTable: React.FC<McpServerTableProps> = ({
  servers,
  loading = false,
  selectedServerId,
  onSelectServer,
  onEditServer,
  onDeleteServer,
  onConnectServer,
  onDisconnectServer,
  onRefreshTools,
  isServerActionLoading,
}) => {
  const { token } = theme.useToken();

  const columns = useMemo<TableProps<McpServer>["columns"]>(
    () => [
      {
        key: "name",
        title: "Name",
        render: (_, record) => record.name || record.id,
      },
      {
        key: "transport",
        title: "Transport Type",
        render: (_, record) =>
          record.config.transport.type === "sse" ? "SSE" : "Stdio",
        width: 140,
      },
      {
        key: "status",
        title: "Status",
        render: (_, record) => {
          const status = record.runtime?.status ?? ServerStatus.Stopped;
          return (
            <Tag color={statusColorMap[status]} style={{ marginInlineEnd: 0 }}>
              {status.toUpperCase()}
            </Tag>
          );
        },
        width: 120,
      },
      {
        key: "toolCount",
        title: "Tool Count",
        render: (_, record) => record.runtime?.tool_count ?? 0,
        width: 100,
      },
      {
        key: "actions",
        title: "Actions",
        width: 360,
        render: (_, record) => {
          const status = record.runtime?.status ?? ServerStatus.Stopped;
          const isConnected = isConnectedStatus(status);
          return (
            <Space size={token.marginXS}>
              <Button size="small" onClick={() => onEditServer?.(record)}>
                Edit
              </Button>

              <Popconfirm
                title="Delete MCP server"
                description={`Delete server \"${record.name || record.id}\"?`}
                onConfirm={() => onDeleteServer?.(record)}
                okText="Delete"
                okButtonProps={{
                  danger: true,
                  loading: isServerActionLoading?.(record.id, "delete"),
                }}
              >
                <Button
                  size="small"
                  danger
                  loading={isServerActionLoading?.(record.id, "delete")}
                >
                  Delete
                </Button>
              </Popconfirm>

              {isConnected ? (
                <Button
                  size="small"
                  onClick={() => onDisconnectServer?.(record)}
                  loading={isServerActionLoading?.(record.id, "disconnect")}
                >
                  Disconnect
                </Button>
              ) : (
                <Button
                  size="small"
                  type="primary"
                  ghost
                  onClick={() => onConnectServer?.(record)}
                  loading={isServerActionLoading?.(record.id, "connect")}
                >
                  Connect
                </Button>
              )}

              <Button
                size="small"
                onClick={() => onRefreshTools?.(record)}
                loading={isServerActionLoading?.(record.id, "refresh")}
              >
                Refresh Tools
              </Button>
            </Space>
          );
        },
      },
    ],
    [
      isServerActionLoading,
      onConnectServer,
      onDeleteServer,
      onDisconnectServer,
      onEditServer,
      onRefreshTools,
      token.marginXS,
    ],
  );

  return (
    <Table<McpServer>
      rowKey="id"
      columns={columns}
      dataSource={servers}
      loading={loading}
      pagination={false}
      locale={{ emptyText: "No MCP servers configured" }}
      onRow={(record) => ({
        onClick: () => onSelectServer?.(record.id),
        style: {
          cursor: onSelectServer ? "pointer" : "default",
          backgroundColor:
            selectedServerId === record.id
              ? token.colorFillSecondary
              : undefined,
        },
      })}
    />
  );
};

import { PlusOutlined, ReloadOutlined } from "@ant-design/icons";
import { Alert, Button, Card, Space, Tag, Typography, message, theme } from "antd";
import { useMemo, useState } from "react";
import {
  ServerStatus,
  type McpServer,
  type McpServerConfig,
} from "../../../../services/mcp";
import { useMcpSettings } from "./hooks/useMcpSettings";
import { McpServerFormModal } from "./mcp/McpServerFormModal";
import { McpServerTable } from "./mcp/McpServerTable";
import { McpToolList } from "./mcp/McpToolList";

const { Text } = Typography;
const { useToken } = theme;

type ModalMode = "create" | "edit";

const statusLabelMap: Record<ServerStatus, string> = {
  [ServerStatus.Connecting]: "Connecting",
  [ServerStatus.Ready]: "Ready",
  [ServerStatus.Degraded]: "Degraded",
  [ServerStatus.Stopped]: "Stopped",
  [ServerStatus.Error]: "Error",
};

const statusColorMap: Record<ServerStatus, string> = {
  [ServerStatus.Connecting]: "blue",
  [ServerStatus.Ready]: "green",
  [ServerStatus.Degraded]: "orange",
  [ServerStatus.Stopped]: "default",
  [ServerStatus.Error]: "red",
};

const makeStatusCounters = (): Record<ServerStatus, number> => ({
  [ServerStatus.Connecting]: 0,
  [ServerStatus.Ready]: 0,
  [ServerStatus.Degraded]: 0,
  [ServerStatus.Stopped]: 0,
  [ServerStatus.Error]: 0,
});

const getErrorMessage = (error: unknown, fallback: string): string => {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return fallback;
};

const SystemSettingsMcpTab: React.FC = () => {
  const { token } = useToken();
  const [msgApi, contextHolder] = message.useMessage();
  const {
    servers,
    selectedServerId,
    selectedServerTools,
    isLoadingServers,
    isMutatingConfig,
    isRefreshingAll,
    isSelectedServerToolsLoading,
    error,
    setSelectedServerId,
    addServer,
    updateServer,
    deleteServer,
    connectServer,
    disconnectServer,
    refreshServerTools,
    refreshAll,
    isServerActionLoading,
  } = useMcpSettings();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<ModalMode>("create");
  const [editingServer, setEditingServer] = useState<McpServer | null>(null);

  const selectedServer = useMemo(() => {
    if (!selectedServerId) {
      return null;
    }
    return servers.find((server) => server.id === selectedServerId) ?? null;
  }, [selectedServerId, servers]);

  const statusSummary = useMemo(() => {
    const byStatus = makeStatusCounters();
    let toolCount = 0;

    servers.forEach((server) => {
      const status = server.runtime?.status ?? ServerStatus.Stopped;
      byStatus[status] += 1;
      toolCount += server.runtime?.tool_count ?? 0;
    });

    return {
      byStatus,
      totalServers: servers.length,
      totalTools: toolCount,
    };
  }, [servers]);

  const openCreateModal = () => {
    setModalMode("create");
    setEditingServer(null);
    setIsModalOpen(true);
  };

  const openEditModal = (server: McpServer) => {
    setModalMode("edit");
    setEditingServer(server);
    setIsModalOpen(true);
  };

  const handleSaveServer = async (config: McpServerConfig) => {
    try {
      if (modalMode === "edit" && editingServer) {
        await updateServer(editingServer.id, config);
        msgApi.success("MCP server updated");
      } else {
        await addServer(config);
        msgApi.success("MCP server added");
      }
      setSelectedServerId(config.id);
      setIsModalOpen(false);
    } catch (saveError) {
      msgApi.error(getErrorMessage(saveError, "Failed to save MCP server"));
    }
  };

  const handleDeleteServer = async (server: McpServer) => {
    try {
      await deleteServer(server.id);
      msgApi.success("MCP server deleted");
    } catch (deleteError) {
      msgApi.error(getErrorMessage(deleteError, "Failed to delete MCP server"));
    }
  };

  const handleConnectServer = async (server: McpServer) => {
    try {
      await connectServer(server.id);
      msgApi.success(`Connected to ${server.name || server.id}`);
    } catch (connectError) {
      msgApi.error(getErrorMessage(connectError, "Failed to connect MCP server"));
    }
  };

  const handleDisconnectServer = async (server: McpServer) => {
    try {
      await disconnectServer(server.id);
      msgApi.success(`Disconnected ${server.name || server.id}`);
    } catch (disconnectError) {
      msgApi.error(
        getErrorMessage(disconnectError, "Failed to disconnect MCP server"),
      );
    }
  };

  const handleRefreshServerTools = async (server: McpServer) => {
    try {
      await refreshServerTools(server.id);
      msgApi.success(`Tools refreshed for ${server.name || server.id}`);
    } catch (refreshError) {
      msgApi.error(getErrorMessage(refreshError, "Failed to refresh tools"));
    }
  };

  const handleRefreshAll = async () => {
    try {
      await refreshAll();
      msgApi.success("MCP status refreshed");
    } catch (refreshError) {
      msgApi.error(getErrorMessage(refreshError, "Failed to refresh MCP status"));
    }
  };

  return (
    <Space direction="vertical" size={token.marginMD} style={{ width: "100%" }}>
      {contextHolder}

      {error ? <Alert type="error" showIcon message={error} /> : null}

      <Card size="small" title="MCP Overview">
        <Space direction="vertical" size={token.marginXS} style={{ width: "100%" }}>
          <Text type="secondary">
            Configure external MCP servers and inspect registered tool aliases.
          </Text>
          <Space wrap>
            <Tag>Total servers: {statusSummary.totalServers}</Tag>
            <Tag>Total tools: {statusSummary.totalTools}</Tag>
            {Object.values(ServerStatus).map((status) => (
              <Tag key={status} color={statusColorMap[status]}>
                {statusLabelMap[status]}: {statusSummary.byStatus[status]}
              </Tag>
            ))}
          </Space>
        </Space>
      </Card>

      <Card
        size="small"
        title="MCP Servers"
        extra={
          <Space>
            <Button
              icon={<ReloadOutlined />}
              loading={isRefreshingAll}
              onClick={() => {
                void handleRefreshAll();
              }}
            >
              Refresh All
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreateModal}>
              Add Server
            </Button>
          </Space>
        }
      >
        <McpServerTable
          servers={servers}
          loading={isLoadingServers}
          selectedServerId={selectedServerId}
          onSelectServer={setSelectedServerId}
          onEditServer={openEditModal}
          onDeleteServer={handleDeleteServer}
          onConnectServer={handleConnectServer}
          onDisconnectServer={handleDisconnectServer}
          onRefreshTools={handleRefreshServerTools}
          isServerActionLoading={isServerActionLoading}
        />
      </Card>

      <McpToolList
        server={selectedServer}
        tools={selectedServerTools}
        loading={isSelectedServerToolsLoading}
      />

      <McpServerFormModal
        open={isModalOpen}
        mode={modalMode}
        initialConfig={editingServer?.config}
        confirmLoading={isMutatingConfig}
        onCancel={() => {
          setIsModalOpen(false);
        }}
        onSubmit={handleSaveServer}
      />
    </Space>
  );
};

export default SystemSettingsMcpTab;

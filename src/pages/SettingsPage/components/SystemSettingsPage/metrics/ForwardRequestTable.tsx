import { Badge, Table, Tag, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";

import type { ForwardRequestMetrics } from "../../../../../services/metrics";

const { Text } = Typography;

interface ForwardRequestTableProps {
  requests: ForwardRequestMetrics[];
  loading: boolean;
}

const formatDuration = (durationMs?: number | null): string => {
  if (!durationMs || durationMs <= 0) {
    return "-";
  }

  const totalSeconds = Math.floor(durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }

  return `${seconds}s`;
};

const formatTimestamp = (timestamp: string): string => {
  const date = new Date(timestamp);
  return date.toLocaleString();
};

const ForwardRequestTable: React.FC<ForwardRequestTableProps> = ({
  requests,
  loading,
}) => {
  const columns: ColumnsType<ForwardRequestMetrics> = [
    {
      title: "ID",
      dataIndex: "forward_id",
      key: "forward_id",
      width: 120,
      render: (value: string) => (
        <Text style={{ fontSize: 12 }} copyable>
          {value.slice(0, 8)}...
        </Text>
      ),
    },
    {
      title: "Endpoint",
      dataIndex: "endpoint",
      key: "endpoint",
      width: 150,
      render: (value: string) => (
        <Tag color="blue">{value.split(".").pop() || value}</Tag>
      ),
    },
    {
      title: "Model",
      dataIndex: "model",
      key: "model",
      width: 120,
    },
    {
      title: "Type",
      dataIndex: "is_stream",
      key: "is_stream",
      width: 80,
      render: (value: boolean) => (
        <Tag color={value ? "purple" : "cyan"}>{value ? "Stream" : "Sync"}</Tag>
      ),
    },
    {
      title: "Status",
      key: "status",
      width: 100,
      render: (_, record) => {
        const statusColor =
          record.status === "success"
            ? "success"
            : record.status === "error"
              ? "error"
              : "default";

        return (
          <Badge
            status={statusColor as "success" | "error" | "default"}
            text={
              record.status_code ? (
                <span>
                  {record.status}
                  <Text type="secondary" style={{ marginLeft: 4 }}>
                    ({record.status_code})
                  </Text>
                </span>
              ) : (
                record.status || "-"
              )
            }
          />
        );
      },
    },
    {
      title: "Tokens",
      key: "tokens",
      width: 100,
      render: (_, record) =>
        record.token_usage ? (
          <Text>{record.token_usage.total_tokens.toLocaleString()}</Text>
        ) : (
          <Text type="secondary">-</Text>
        ),
    },
    {
      title: "Duration",
      dataIndex: "duration_ms",
      key: "duration_ms",
      width: 100,
      render: (value?: number | null) => formatDuration(value),
    },
    {
      title: "Started",
      dataIndex: "started_at",
      key: "started_at",
      width: 160,
      render: (value: string) => (
        <Text style={{ fontSize: 12 }}>{formatTimestamp(value)}</Text>
      ),
    },
    {
      title: "Error",
      dataIndex: "error",
      key: "error",
      width: 200,
      render: (value?: string | null) =>
        value ? (
          <Text type="danger" ellipsis style={{ maxWidth: 180 }}>
            {value}
          </Text>
        ) : (
          <Text type="secondary">-</Text>
        ),
    },
  ];

  return (
    <Table
      rowKey="forward_id"
      columns={columns}
      dataSource={requests}
      loading={loading}
      size="small"
      pagination={{
        pageSize: 10,
        showSizeChanger: true,
        showTotal: (total) => `${total} requests`,
        pageSizeOptions: ["10", "20", "50", "100"],
      }}
      scroll={{ x: 1200 }}
      locale={{
        emptyText: "No forward requests recorded for this range",
      }}
    />
  );
};

export default ForwardRequestTable;

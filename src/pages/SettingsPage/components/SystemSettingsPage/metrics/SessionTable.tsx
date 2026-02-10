import { Button, Table, Tag, Tooltip } from "antd";
import type { ColumnsType } from "antd/es/table";

import type { SessionMetrics } from "../../../../../services/metrics";

interface SessionTableProps {
  sessions: SessionMetrics[];
  loading: boolean;
  onSelectSession: (sessionId: string) => void;
}

const formatDateTime = (value?: string | null): string => {
  if (!value) {
    return "-";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }
  return date.toLocaleString();
};

const formatDuration = (durationMs?: number | null): string => {
  if (!durationMs || durationMs <= 0) {
    return "-";
  }

  const totalSeconds = Math.floor(durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return `${hours}h ${remainingMinutes}m`;
  }

  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }

  return `${seconds}s`;
};

const statusColor = (status: SessionMetrics["status"]): string => {
  switch (status) {
    case "completed":
      return "green";
    case "running":
      return "blue";
    case "error":
      return "red";
    case "cancelled":
      return "orange";
    default:
      return "default";
  }
};

const SessionTable: React.FC<SessionTableProps> = ({
  sessions,
  loading,
  onSelectSession,
}) => {
  const columns: ColumnsType<SessionMetrics> = [
    {
      title: "Session",
      dataIndex: "session_id",
      key: "session_id",
      render: (value: string) => (
        <Tooltip title={value}>
          <span>{value.slice(0, 8)}...</span>
        </Tooltip>
      ),
      width: 120,
    },
    {
      title: "Model",
      dataIndex: "model",
      key: "model",
      width: 160,
    },
    {
      title: "Status",
      dataIndex: "status",
      key: "status",
      width: 120,
      render: (value: SessionMetrics["status"]) => (
        <Tag color={statusColor(value)}>{value}</Tag>
      ),
    },
    {
      title: "Started",
      dataIndex: "started_at",
      key: "started_at",
      render: (value: string) => formatDateTime(value),
      width: 200,
      sorter: (left, right) =>
        new Date(left.started_at).getTime() - new Date(right.started_at).getTime(),
      defaultSortOrder: "descend",
    },
    {
      title: "Duration",
      dataIndex: "duration_ms",
      key: "duration_ms",
      render: (value?: number | null) => formatDuration(value),
      width: 120,
    },
    {
      title: "Tokens",
      key: "tokens",
      render: (_, record) => record.total_token_usage.total_tokens.toLocaleString(),
      width: 120,
      sorter: (left, right) =>
        left.total_token_usage.total_tokens - right.total_token_usage.total_tokens,
    },
    {
      title: "Tool Calls",
      dataIndex: "tool_call_count",
      key: "tool_call_count",
      width: 120,
      sorter: (left, right) => left.tool_call_count - right.tool_call_count,
    },
    {
      title: "Messages",
      dataIndex: "message_count",
      key: "message_count",
      width: 120,
      sorter: (left, right) => left.message_count - right.message_count,
    },
    {
      title: "Action",
      key: "action",
      fixed: "right",
      width: 120,
      render: (_, record) => (
        <Button
          type="link"
          onClick={() => {
            onSelectSession(record.session_id);
          }}
        >
          View
        </Button>
      ),
    },
  ];

  return (
    <Table
      rowKey="session_id"
      size="small"
      columns={columns}
      loading={loading}
      dataSource={sessions}
      pagination={{ pageSize: 10, showSizeChanger: false }}
      scroll={{ x: 1100 }}
    />
  );
};

export default SessionTable;

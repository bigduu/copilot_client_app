import { ReloadOutlined } from "@ant-design/icons";
import {
  Alert,
  Button,
  Card,
  DatePicker,
  Descriptions,
  Modal,
  Select,
  Skeleton,
  Space,
  Table,
  Tabs,
  Typography,
  theme,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { useMemo, useState } from "react";

import type {
  MetricsGranularity,
  RoundMetrics,
} from "../../../../../services/metrics";
import { useUnifiedMetrics } from "../hooks/useUnifiedMetrics";
import UnifiedMetricsCards from "./metrics/UnifiedMetricsCards";
import UnifiedTimelineChart from "./metrics/UnifiedTimelineChart";
import ModelDistribution from "./metrics/ModelDistribution";
import SessionTable from "./metrics/SessionTable";
import ForwardEndpointDistribution from "./metrics/ForwardEndpointDistribution";
import ForwardRequestTable from "./metrics/ForwardRequestTable";

const { Text } = Typography;
const { useToken } = theme;

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

const roundColumns: ColumnsType<RoundMetrics> = [
  {
    title: "Round",
    dataIndex: "round_id",
    key: "round_id",
    render: (value: string) => `${value.slice(0, 8)}...`,
  },
  {
    title: "Status",
    dataIndex: "status",
    key: "status",
  },
  {
    title: "Duration",
    dataIndex: "duration_ms",
    key: "duration_ms",
    render: (value?: number | null) => formatDuration(value),
  },
  {
    title: "Tokens",
    key: "tokens",
    render: (_, round) => round.token_usage.total_tokens.toLocaleString(),
  },
  {
    title: "Tool Calls",
    key: "tool_calls",
    render: (_, round) => round.tool_calls.length,
  },
];

const UnifiedMetricsDashboard: React.FC = () => {
  const { token } = useToken();
  const [startDate, setStartDate] = useState<string | undefined>(undefined);
  const [endDate, setEndDate] = useState<string | undefined>(undefined);
  const [selectedModel, setSelectedModel] = useState<string | undefined>(undefined);
  const [days, setDays] = useState<number>(30);
  const [granularity, setGranularity] =
    useState<MetricsGranularity>("daily");

  const {
    chatSummary,
    forwardSummary,
    combinedSummary,
    modelMetrics,
    sessions,
    sessionDetail,
    endpointMetrics,
    forwardRequests,
    timeline,
    isLoading,
    isRefreshing,
    isSessionDetailLoading,
    error,
    refresh,
    loadSessionDetail,
    clearSessionDetail,
  } = useUnifiedMetrics({
    filters: {
      startDate,
      endDate,
      model: selectedModel,
      days,
      granularity,
    },
  });

  const modelOptions = useMemo(
    () =>
      modelMetrics.map((item) => ({
        label: item.model,
        value: item.model,
      })),
    [modelMetrics],
  );

  const selectedSession = sessionDetail?.session;

  if (isLoading) {
    return <Skeleton active paragraph={{ rows: 10 }} />;
  }

  return (
    <Space direction="vertical" size={token.marginMD} style={{ width: "100%" }}>
      {error ? <Alert type="error" showIcon message={error} /> : null}

      {/* Filters */}
      <Card
        size="small"
        title="Filters"
        extra={
          <Button
            icon={<ReloadOutlined />}
            loading={isRefreshing}
            onClick={() => void refresh()}
          >
            Refresh
          </Button>
        }
      >
        <Space wrap>
          <DatePicker
            placeholder="Start date"
            onChange={(value) => {
              setStartDate(value ? value.format("YYYY-MM-DD") : undefined);
            }}
          />
          <DatePicker
            placeholder="End date"
            onChange={(value) => {
              setEndDate(value ? value.format("YYYY-MM-DD") : undefined);
            }}
          />
          <Select
            allowClear
            style={{ minWidth: 180 }}
            placeholder="Model"
            value={selectedModel}
            options={modelOptions}
            onChange={(value) => {
              setSelectedModel(value);
            }}
          />
          <Select
            style={{ width: 120 }}
            value={days}
            options={[7, 14, 30, 90].map((value) => ({
              label: `${value} days`,
              value,
            }))}
            onChange={(value) => {
              setDays(value);
            }}
          />
          <Select
            style={{ width: 140 }}
            value={granularity}
            options={[
              { label: "Daily", value: "daily" },
              { label: "Weekly", value: "weekly" },
              { label: "Monthly", value: "monthly" },
            ]}
            onChange={(value: MetricsGranularity) => {
              setGranularity(value);
            }}
          />
        </Space>
      </Card>

      {/* Unified Metrics Cards */}
      <UnifiedMetricsCards
        chatSummary={chatSummary}
        forwardSummary={forwardSummary}
        combinedSummary={combinedSummary}
        sessions={sessions}
        loading={isLoading}
      />

      {/* Charts Row */}
      <div
        style={{
          width: "100%",
          display: "grid",
          gridTemplateColumns: "minmax(0, 2fr) minmax(0, 1fr)",
          gap: token.marginMD,
        }}
      >
        <UnifiedTimelineChart data={timeline} loading={isLoading} />
        <ModelDistribution data={modelMetrics} loading={isLoading} />
      </div>

      {/* Forward Endpoint Distribution */}
      <ForwardEndpointDistribution
        data={endpointMetrics}
        loading={isLoading}
      />

      {/* Detailed Data Tabs */}
      <Card size="small" title="Detailed Metrics">
        <Tabs
          items={[
            {
              key: "sessions",
              label: `Chat Sessions (${sessions.length})`,
              children: (
                <SessionTable
                  sessions={sessions}
                  loading={isLoading}
                  onSelectSession={(sessionId) => {
                    void loadSessionDetail(sessionId);
                  }}
                />
              ),
            },
            {
              key: "forward",
              label: `Forward Requests (${forwardRequests.length})`,
              children: (
                <ForwardRequestTable
                  requests={forwardRequests}
                  loading={isLoading}
                />
              ),
            },
          ]}
        />
      </Card>

      {/* Session Detail Modal */}
      <Modal
        title="Session Metrics"
        open={Boolean(sessionDetail)}
        onCancel={clearSessionDetail}
        onOk={clearSessionDetail}
        width={960}
        destroyOnClose
      >
        {isSessionDetailLoading ? (
          <Text>Loading session details...</Text>
        ) : selectedSession ? (
          <Space direction="vertical" style={{ width: "100%" }} size={token.marginMD}>
            <Descriptions size="small" bordered column={2}>
              <Descriptions.Item label="Session ID" span={2}>
                {selectedSession.session_id}
              </Descriptions.Item>
              <Descriptions.Item label="Model">
                {selectedSession.model}
              </Descriptions.Item>
              <Descriptions.Item label="Status">
                {selectedSession.status}
              </Descriptions.Item>
              <Descriptions.Item label="Duration">
                {formatDuration(selectedSession.duration_ms)}
              </Descriptions.Item>
              <Descriptions.Item label="Messages">
                {selectedSession.message_count}
              </Descriptions.Item>
              <Descriptions.Item label="Total Tokens">
                {selectedSession.total_token_usage.total_tokens.toLocaleString()}
              </Descriptions.Item>
              <Descriptions.Item label="Tool Calls">
                {selectedSession.tool_call_count}
              </Descriptions.Item>
            </Descriptions>

            <Table
              rowKey="round_id"
              size="small"
              columns={roundColumns}
              dataSource={sessionDetail.rounds}
              pagination={{ pageSize: 6, showSizeChanger: false }}
            />
          </Space>
        ) : (
          <Text type="secondary">No detail available.</Text>
        )}
      </Modal>
    </Space>
  );
};

export default UnifiedMetricsDashboard;

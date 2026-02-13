import { ReloadOutlined } from "@ant-design/icons";
import {
  Alert,
  Button,
  Card,
  DatePicker,
  Descriptions,
  Modal,
  Select,
  Space,
  Table,
  Typography,
  theme,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";

import type {
  DailyMetrics,
  MetricsGranularity,
  PeriodMetrics,
  RoundMetrics,
} from "../../../../services/metrics";
import { useMetrics } from "./hooks/useMetrics";
import { useForwardMetrics } from "./hooks/useForwardMetrics";
import MetricCards from "./metrics/MetricCards";
import ModelDistribution from "./metrics/ModelDistribution";
import SessionTable from "./metrics/SessionTable";
import TokenChart from "./metrics/TokenChart";
import ForwardMetricsCards from "./metrics/ForwardMetricsCards";
import ForwardEndpointDistribution from "./metrics/ForwardEndpointDistribution";
import ForwardRequestTable from "./metrics/ForwardRequestTable";

const { Text } = Typography;
const { useToken } = theme;

const asTimelineLabel = (item: DailyMetrics | PeriodMetrics): string => {
  if ("date" in item) {
    return item.date;
  }
  return item.label;
};

const heatColorForValue = (value: number, maxValue: number): string => {
  if (maxValue <= 0 || value <= 0) {
    return "#f5f5f5";
  }

  const ratio = value / maxValue;

  if (ratio >= 0.8) {
    return "#1677ff";
  }
  if (ratio >= 0.6) {
    return "#4096ff";
  }
  if (ratio >= 0.4) {
    return "#69b1ff";
  }
  if (ratio >= 0.2) {
    return "#91caff";
  }
  return "#d6e4ff";
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

const SystemSettingsMetricsTab: React.FC = () => {
  const { token } = useToken();
  const [startDate, setStartDate] = useState<string | undefined>(undefined);
  const [endDate, setEndDate] = useState<string | undefined>(undefined);
  const [selectedModel, setSelectedModel] = useState<string | undefined>(undefined);
  const [days, setDays] = useState<number>(30);
  const [granularity, setGranularity] =
    useState<MetricsGranularity>("daily");

  const {
    summary,
    modelMetrics,
    sessions,
    timeline,
    sessionDetail,
    isLoading,
    isRefreshing,
    isSessionDetailLoading,
    error,
    refresh,
    loadSessionDetail,
    clearSessionDetail,
  } = useMetrics({
    filters: {
      startDate,
      endDate,
      model: selectedModel,
      days,
      granularity,
    },
  });

  // Forward metrics
  const {
    summary: forwardSummary,
    endpointMetrics,
    requests: forwardRequests,
    isLoading: isForwardLoading,
    isRefreshing: isForwardRefreshing,
    error: forwardError,
    refresh: refreshForward,
  } = useForwardMetrics({
    filters: {
      startDate,
      endDate,
      model: selectedModel,
    },
  });

  const tokenChartData = useMemo(
    () =>
      timeline.map((item) => ({
        label: asTimelineLabel(item),
        promptTokens: item.total_token_usage.prompt_tokens,
        completionTokens: item.total_token_usage.completion_tokens,
        totalTokens: item.total_token_usage.total_tokens,
      })),
    [timeline],
  );

  const modelOptions = useMemo(
    () =>
      modelMetrics.map((item) => ({
        label: item.model,
        value: item.model,
      })),
    [modelMetrics],
  );

  const toolUsageData = useMemo(() => {
    const counter = new Map<string, number>();

    sessions.forEach((session) => {
      Object.entries(session.tool_breakdown).forEach(([tool, count]) => {
        counter.set(tool, (counter.get(tool) ?? 0) + count);
      });
    });

    return Array.from(counter.entries())
      .map(([tool, count]) => ({
        tool,
        count,
      }))
      .sort((left, right) => right.count - left.count)
      .slice(0, 10);
  }, [sessions]);

  const activityData = useMemo(() => {
    const points = timeline.map((item) => ({
      label: asTimelineLabel(item),
      sessions: item.total_sessions,
      tokens: item.total_token_usage.total_tokens,
    }));

    const maxSessions = points.reduce(
      (maxValue, point) => Math.max(maxValue, point.sessions),
      0,
    );

    return { points, maxSessions };
  }, [timeline]);

  const selectedSession = sessionDetail?.session;

  return (
    <Space direction="vertical" size={token.marginMD} style={{ width: "100%" }}>
      {error ? <Alert type="error" showIcon message={error} /> : null}
      {forwardError ? <Alert type="error" showIcon message={forwardError} /> : null}

      <Card
        size="small"
        title="Filters"
        extra={
          <Button
            icon={<ReloadOutlined />}
            loading={isRefreshing || isForwardRefreshing}
            onClick={() => {
              void refresh();
              void refreshForward();
            }}
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

      <MetricCards summary={summary} sessions={sessions} loading={isLoading} />

      <div
        style={{
          width: "100%",
          display: "grid",
          gridTemplateColumns: "minmax(0, 2fr) minmax(0, 1fr)",
          gap: token.marginMD,
        }}
      >
        <TokenChart data={tokenChartData} loading={isLoading} />
        <ModelDistribution data={modelMetrics} loading={isLoading} />
      </div>

      <div
        style={{
          width: "100%",
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
          gap: token.marginMD,
        }}
      >
        <Card size="small" title="Tool Usage Frequency">
          {toolUsageData.length === 0 ? (
            <Text type="secondary">No tool calls recorded for this range.</Text>
          ) : (
            <div style={{ width: "100%", height: 280 }}>
              <ResponsiveContainer>
                <BarChart data={toolUsageData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="tool" interval={0} angle={-20} textAnchor="end" height={72} />
                  <YAxis allowDecimals={false} />
                  <RechartsTooltip />
                  <Bar dataKey="count" fill="#1677ff" name="Calls" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        <Card size="small" title="Daily Activity Heatmap">
          {activityData.points.length === 0 ? (
            <Text type="secondary">No activity available for this range.</Text>
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(72px, 1fr))",
                gap: token.marginXS,
              }}
            >
              {activityData.points.map((point) => (
                <div
                  key={point.label}
                  style={{
                    borderRadius: token.borderRadiusSM,
                    padding: token.paddingXS,
                    background: heatColorForValue(point.sessions, activityData.maxSessions),
                    minHeight: 64,
                    color: point.sessions > 0 ? "#fff" : token.colorTextSecondary,
                  }}
                >
                  <div style={{ fontSize: 12, lineHeight: 1.2 }}>{point.label}</div>
                  <div style={{ fontWeight: 600, marginTop: 4 }}>{point.sessions} sessions</div>
                  <div style={{ fontSize: 12 }}>{point.tokens.toLocaleString()} tokens</div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Forward Metrics Section */}
      <Card size="small" title="Forward Metrics">
        <Space direction="vertical" size={token.marginMD} style={{ width: "100%" }}>
          <ForwardMetricsCards
            summary={forwardSummary}
            loading={isForwardLoading}
          />

          <div
            style={{
              width: "100%",
              display: "grid",
              gridTemplateColumns: "minmax(0, 1fr)",
              gap: token.marginMD,
            }}
          >
            <ForwardEndpointDistribution
              data={endpointMetrics}
              loading={isForwardLoading}
            />
          </div>

          <Card size="small" title="Recent Forward Requests">
            <ForwardRequestTable
              requests={forwardRequests}
              loading={isForwardLoading}
            />
          </Card>
        </Space>
      </Card>

      <Card
        size="small"
        title="Sessions"
        extra={<Text type="secondary">Click a session for full round detail</Text>}
      >
        <SessionTable
          sessions={sessions}
          loading={isLoading}
          onSelectSession={(sessionId) => {
            void loadSessionDetail(sessionId);
          }}
        />
      </Card>

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

export default SystemSettingsMetricsTab;

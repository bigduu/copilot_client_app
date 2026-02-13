import { Card, Col, Row, Skeleton, Statistic, theme } from "antd";

import type { CombinedSummary, MetricsSummary, SessionMetrics, ForwardMetricsSummary } from "../../../../../services/metrics";

const { useToken } = theme;

interface UnifiedMetricsCardsProps {
  chatSummary: MetricsSummary | null;
  forwardSummary: ForwardMetricsSummary | null;
  combinedSummary: CombinedSummary | null;
  sessions: SessionMetrics[];
  loading: boolean;
}

const formatDuration = (durationMs: number | null | undefined): string => {
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

const averageSessionDuration = (sessions: SessionMetrics[]): number => {
  const completed = sessions.filter(
    (session) => typeof session.duration_ms === "number" && session.duration_ms > 0,
  );

  if (completed.length === 0) {
    return 0;
  }

  const total = completed.reduce(
    (sum, session) => sum + (session.duration_ms ?? 0),
    0,
  );

  return Math.floor(total / completed.length);
};

const UnifiedMetricsCards: React.FC<UnifiedMetricsCardsProps> = ({
  chatSummary,
  forwardSummary,
  combinedSummary,
  sessions,
  loading,
}) => {
  const { token } = useToken();

  if (loading) {
    return <Skeleton active paragraph={{ rows: 2 }} />;
  }

  const averageDurationMs = averageSessionDuration(sessions);
  const successRate = combinedSummary?.success_rate.toFixed(1) ?? "0.0";
  const avgForwardDuration = forwardSummary?.avg_duration_ms;

  return (
    <Row gutter={[token.marginSM, token.marginSM]}>
      {/* Combined Overview */}
      <Col xs={24} sm={12} xl={6}>
        <Card size="small">
          <Statistic
            title="Total Requests"
            value={combinedSummary?.total_requests ?? 0}
            precision={0}
            valueStyle={{ color: token.colorPrimary }}
          />
        </Card>
      </Col>
      <Col xs={24} sm={12} xl={6}>
        <Card size="small">
          <Statistic
            title="Total Tokens"
            value={combinedSummary?.total_tokens ?? 0}
            precision={0}
          />
        </Card>
      </Col>
      <Col xs={24} sm={12} xl={6}>
        <Card size="small">
          <Statistic
            title="Success Rate"
            value={successRate}
            suffix="%"
            valueStyle={{
              color:
                Number(successRate) >= 95
                  ? "#52c41a"
                  : Number(successRate) >= 80
                    ? "#faad14"
                    : "#ff4d4f",
            }}
          />
        </Card>
      </Col>
      <Col xs={24} sm={12} xl={6}>
        <Card size="small">
          <Statistic
            title="Avg Response Time"
            value={formatDuration(avgForwardDuration)}
          />
        </Card>
      </Col>

      {/* Chat Metrics */}
      <Col xs={24} sm={12} xl={6}>
        <Card size="small">
          <Statistic
            title="Chat Sessions"
            value={chatSummary?.total_sessions ?? 0}
            precision={0}
          />
        </Card>
      </Col>
      <Col xs={24} sm={12} xl={6}>
        <Card size="small">
          <Statistic
            title="Chat Tokens"
            value={chatSummary?.total_tokens.total_tokens ?? 0}
            precision={0}
          />
        </Card>
      </Col>
      <Col xs={24} sm={12} xl={6}>
        <Card size="small">
          <Statistic
            title="Tool Calls"
            value={chatSummary?.total_tool_calls ?? 0}
            precision={0}
          />
        </Card>
      </Col>
      <Col xs={24} sm={12} xl={6}>
        <Card size="small">
          <Statistic
            title="Avg Session Duration"
            value={averageDurationMs > 0 ? formatDuration(averageDurationMs) : "-"}
          />
        </Card>
      </Col>

      {/* Forward Metrics */}
      <Col xs={24} sm={12} xl={6}>
        <Card size="small">
          <Statistic
            title="Forward Requests"
            value={forwardSummary?.total_requests ?? 0}
            precision={0}
          />
        </Card>
      </Col>
      <Col xs={24} sm={12} xl={6}>
        <Card size="small">
          <Statistic
            title="Forward Tokens"
            value={forwardSummary?.total_tokens.total_tokens ?? 0}
            precision={0}
          />
        </Card>
      </Col>
      <Col xs={24} sm={12} xl={6}>
        <Card size="small">
          <Statistic
            title="Successful"
            value={forwardSummary?.successful_requests ?? 0}
            precision={0}
            valueStyle={{ color: "#52c41a" }}
          />
        </Card>
      </Col>
      <Col xs={24} sm={12} xl={6}>
        <Card size="small">
          <Statistic
            title="Failed"
            value={forwardSummary?.failed_requests ?? 0}
            precision={0}
            valueStyle={{ color: forwardSummary?.failed_requests ? "#ff4d4f" : undefined }}
          />
        </Card>
      </Col>
    </Row>
  );
};

export default UnifiedMetricsCards;

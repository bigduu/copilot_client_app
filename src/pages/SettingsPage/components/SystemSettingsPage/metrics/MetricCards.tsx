import { Card, Col, Row, Skeleton, Statistic, theme } from "antd";

import type { MetricsSummary, SessionMetrics } from "../../../../../services/metrics";

const { useToken } = theme;

interface MetricCardsProps {
  summary: MetricsSummary | null;
  sessions: SessionMetrics[];
  loading: boolean;
}

const formatDuration = (durationMs: number): string => {
  const totalSeconds = Math.floor(durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
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

const MetricCards: React.FC<MetricCardsProps> = ({ summary, sessions, loading }) => {
  const { token } = useToken();

  if (loading) {
    return <Skeleton active paragraph={{ rows: 1 }} />;
  }

  const averageDurationMs = averageSessionDuration(sessions);

  return (
    <Row gutter={[token.marginSM, token.marginSM]}>
      <Col xs={24} sm={12} xl={6}>
        <Card size="small">
          <Statistic
            title="Total Sessions"
            value={summary?.total_sessions ?? 0}
            precision={0}
          />
        </Card>
      </Col>
      <Col xs={24} sm={12} xl={6}>
        <Card size="small">
          <Statistic
            title="Total Tokens"
            value={summary?.total_tokens.total_tokens ?? 0}
            precision={0}
          />
        </Card>
      </Col>
      <Col xs={24} sm={12} xl={6}>
        <Card size="small">
          <Statistic
            title="Total Tool Calls"
            value={summary?.total_tool_calls ?? 0}
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
    </Row>
  );
};

export default MetricCards;

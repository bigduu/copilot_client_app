import { Card, Col, Row, Skeleton, Statistic, theme } from "antd";

import type { ForwardMetricsSummary } from "../../../../../services/metrics";

const { useToken } = theme;

interface ForwardMetricsCardsProps {
  summary: ForwardMetricsSummary | null;
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

const ForwardMetricsCards: React.FC<ForwardMetricsCardsProps> = ({
  summary,
  loading,
}) => {
  const { token } = useToken();

  if (loading) {
    return <Skeleton active paragraph={{ rows: 1 }} />;
  }

  const successRate =
    summary && summary.total_requests > 0
      ? ((summary.successful_requests / summary.total_requests) * 100).toFixed(
          1,
        )
      : "0.0";

  return (
    <Row gutter={[token.marginSM, token.marginSM]}>
      <Col xs={24} sm={12} xl={6}>
        <Card size="small">
          <Statistic
            title="Total Forward Requests"
            value={summary?.total_requests ?? 0}
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
            title="Total Tokens"
            value={summary?.total_tokens.total_tokens ?? 0}
            precision={0}
          />
        </Card>
      </Col>
      <Col xs={24} sm={12} xl={6}>
        <Card size="small">
          <Statistic
            title="Avg Response Time"
            value={formatDuration(summary?.avg_duration_ms)}
          />
        </Card>
      </Col>
    </Row>
  );
};

export default ForwardMetricsCards;

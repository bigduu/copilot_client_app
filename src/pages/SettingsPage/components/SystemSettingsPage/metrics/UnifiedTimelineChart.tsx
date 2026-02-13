import { Card, Empty, Skeleton, Typography } from "antd";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { UnifiedTimelinePoint } from "../../../../../services/metrics";

const { Text } = Typography;

interface UnifiedTimelineChartProps {
  data: UnifiedTimelinePoint[];
  loading: boolean;
}

const UnifiedTimelineChart: React.FC<UnifiedTimelineChartProps> = ({
  data,
  loading,
}) => {
  if (loading) {
    return (
      <Card size="small" title="Token Usage Over Time (Chat + Forward)">
        <Skeleton active paragraph={{ rows: 5 }} />
      </Card>
    );
  }

  return (
    <Card size="small" title="Token Usage Over Time (Chat + Forward)">
      {data.length === 0 ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="No token usage available"
        />
      ) : (
        <>
          <Text type="secondary">
            Combined chat and forward token usage over time.
          </Text>
          <div style={{ width: "100%", height: 280, marginTop: 12 }}>
            <ResponsiveContainer>
              <LineChart data={data}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" minTickGap={24} />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="total_tokens"
                  name="Total"
                  stroke="#1677ff"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="chat_tokens"
                  name="Chat"
                  stroke="#52c41a"
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="forward_tokens"
                  name="Forward"
                  stroke="#fa8c16"
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </Card>
  );
};

export default UnifiedTimelineChart;

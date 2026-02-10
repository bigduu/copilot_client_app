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

const { Text } = Typography;

export interface TokenChartPoint {
  label: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

interface TokenChartProps {
  data: TokenChartPoint[];
  loading: boolean;
}

const TokenChart: React.FC<TokenChartProps> = ({ data, loading }) => {
  if (loading) {
    return (
      <Card size="small" title="Token Usage Over Time">
        <Skeleton active paragraph={{ rows: 5 }} />
      </Card>
    );
  }

  return (
    <Card size="small" title="Token Usage Over Time">
      {data.length === 0 ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="No token usage available"
        />
      ) : (
        <>
          <Text type="secondary">
            Prompt, completion, and total tokens by day/period.
          </Text>
          <div style={{ width: "100%", height: 280, marginTop: 12 }}>
            <ResponsiveContainer>
              <LineChart data={data}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" minTickGap={24} />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="totalTokens"
                  name="Total"
                  stroke="#1677ff"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="promptTokens"
                  name="Prompt"
                  stroke="#52c41a"
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="completionTokens"
                  name="Completion"
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

export default TokenChart;

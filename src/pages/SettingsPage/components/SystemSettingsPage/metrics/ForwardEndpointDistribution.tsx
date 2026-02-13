import { Card, theme } from "antd";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { ForwardEndpointMetrics } from "../../../../../services/metrics";

interface ForwardEndpointDistributionProps {
  data: ForwardEndpointMetrics[];
  loading: boolean;
}

const { useToken } = theme;

const ForwardEndpointDistribution: React.FC<
  ForwardEndpointDistributionProps
> = ({ data, loading }) => {
  const { token } = useToken();

  if (loading) {
    return (
      <Card size="small" title="Endpoint Distribution">
        <div style={{ width: "100%", height: 240 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              height: "100%",
              color: token.colorTextSecondary,
            }}
          >
            Loading...
          </div>
        </div>
      </Card>
    );
  }

  if (data.length === 0) {
    return (
      <Card size="small" title="Endpoint Distribution">
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            height: 240,
            color: token.colorTextSecondary,
          }}
        >
          No forward metrics available for this range.
        </div>
      </Card>
    );
  }

  const chartData = data.map((item) => ({
    endpoint: item.endpoint.split(".").pop() || item.endpoint, // Get last part of endpoint name
    requests: item.requests,
    successful: item.successful,
    failed: item.failed,
  }));

  return (
    <Card size="small" title="Endpoint Distribution">
      <div style={{ width: "100%", height: 240 }}>
        <ResponsiveContainer>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="endpoint" />
            <YAxis />
            <Tooltip
              formatter={(value: number, name: string) => [
                `${value}`,
                name.charAt(0).toUpperCase() + name.slice(1),
              ]}
            />
            <Legend />
            <Bar
              dataKey="successful"
              fill="#52c41a"
              name="Successful"
              fillOpacity={0.8}
              radius={[4, 4, 0, 0]}
            />
            <Bar
              dataKey="failed"
              fill="#ff7875"
              name="Failed"
              fillOpacity={0.8}
              radius={[4, 4, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
};

export default ForwardEndpointDistribution;

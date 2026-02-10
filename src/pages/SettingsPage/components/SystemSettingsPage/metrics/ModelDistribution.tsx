import { Card, Empty, Skeleton, Typography } from "antd";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

import type { ModelMetrics } from "../../../../../services/metrics";

const { Text } = Typography;

interface ModelDistributionProps {
  data: ModelMetrics[];
  loading: boolean;
}

const PIE_COLORS = ["#1677ff", "#52c41a", "#fa8c16", "#722ed1", "#13c2c2"];

const ModelDistribution: React.FC<ModelDistributionProps> = ({ data, loading }) => {
  if (loading) {
    return (
      <Card size="small" title="Model Distribution">
        <Skeleton active paragraph={{ rows: 5 }} />
      </Card>
    );
  }

  const chartData = data.map((row) => ({
    name: row.model,
    value: row.tokens.total_tokens,
  }));

  return (
    <Card size="small" title="Model Distribution">
      {chartData.length === 0 ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="No model metrics available"
        />
      ) : (
        <>
          <Text type="secondary">Share of total tokens consumed by model.</Text>
          <div style={{ width: "100%", height: 280, marginTop: 12 }}>
            <ResponsiveContainer>
              <PieChart>
                <Pie
                  data={chartData}
                  cx="50%"
                  cy="50%"
                  outerRadius={90}
                  fill="#1677ff"
                  dataKey="value"
                  nameKey="name"
                  label
                >
                  {chartData.map((entry, index) => (
                    <Cell
                      key={`${entry.name}-${index}`}
                      fill={PIE_COLORS[index % PIE_COLORS.length]}
                    />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </Card>
  );
};

export default ModelDistribution;

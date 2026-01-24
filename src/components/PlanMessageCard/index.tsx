import React, { memo, useState } from "react";
import {
  Card,
  Steps,
  Button,
  Typography,
  Tag,
  Space,
  Collapse,
  Flex,
  List,
  Input,
  theme,
} from "antd";
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  WarningOutlined,
  ThunderboltOutlined,
  ToolOutlined,
} from "@ant-design/icons";
import { PlanMessage } from "../../types/chat";

const { Title, Text, Paragraph } = Typography;
const { useToken } = theme;

interface PlanMessageCardProps {
  plan: PlanMessage;
  contextId: string;
  onExecute: () => void; // Callback to switch to Actor role and continue
  onRefine: (feedback: string) => void; // Callback to send refinement message
  timestamp?: string;
}

const PlanMessageCardComponent: React.FC<PlanMessageCardProps> = ({
  plan,
  contextId: _contextId,
  onExecute,
  onRefine,
  timestamp,
}) => {
  const { token } = useToken();
  const [refineMode, setRefineMode] = useState(false);
  const [feedback, setFeedback] = useState("");

  const handleRefine = () => {
    if (feedback.trim()) {
      onRefine(feedback);
      setFeedback("");
      setRefineMode(false);
    }
  };

  return (
    <Card
      style={{
        marginBottom: token.marginMD,
        borderColor: token.colorPrimary,
        borderWidth: 2,
        backgroundColor: token.colorPrimaryBg,
      }}
      title={
        <Space>
          <CheckCircleOutlined style={{ color: token.colorPrimary }} />
          <Text strong style={{ color: token.colorPrimary }}>
            Execution Plan
          </Text>
        </Space>
      }
      extra={
        timestamp ? (
          <Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
            {timestamp}
          </Text>
        ) : undefined
      }
    >
      {/* Goal Section */}
      <Flex vertical style={{ marginBottom: token.marginLG }}>
        <Title level={5} style={{ marginBottom: token.marginXS }}>
          Goal
        </Title>
        <Paragraph style={{ fontSize: 15, marginBottom: 0 }}>
          {plan.goal}
        </Paragraph>
      </Flex>

      {/* Steps Section */}
      <Flex vertical style={{ marginBottom: token.marginLG }}>
        <Title level={5} style={{ marginBottom: token.marginMD }}>
          Steps
        </Title>
        <Steps
          direction="vertical"
          current={-1} // -1 means no step is active (plan not yet executed)
          items={plan.steps.map((step) => ({
            title: (
              <Text strong>
                Step {step.step_number}: {step.action}
              </Text>
            ),
            description: (
              <Flex vertical>
                <Paragraph style={{ marginBottom: token.marginXS }}>
                  <Text type="secondary">Reason:</Text> {step.reason}
                </Paragraph>
                <Space wrap>
                  <Text type="secondary">
                    <ToolOutlined /> Tools:
                  </Text>
                  {step.tools_needed.map((tool, idx) => (
                    <Tag key={idx} color="blue">
                      {tool}
                    </Tag>
                  ))}
                </Space>
                <Flex style={{ marginTop: token.marginXS }}>
                  <Text type="secondary">
                    <ClockCircleOutlined /> Estimated: {step.estimated_time}
                  </Text>
                </Flex>
              </Flex>
            ),
            icon: <Text>{step.step_number}</Text>,
          }))}
        />
      </Flex>

      {/* Metadata Section */}
      <Space
        direction="vertical"
        style={{ width: "100%", marginBottom: token.marginLG }}
      >
        <Flex align="center" gap={token.marginXS} wrap="wrap">
          <Text type="secondary">
            <ClockCircleOutlined /> Total Estimated Time:{" "}
          </Text>
          <Tag color="blue">{plan.estimated_total_time}</Tag>
        </Flex>

        {plan.prerequisites && plan.prerequisites.length > 0 && (
          <Flex vertical>
            <Text type="secondary">Prerequisites:</Text>
            <List
              size="small"
              dataSource={plan.prerequisites}
              renderItem={(prereq, idx) => (
                <List.Item key={`${prereq}-${idx}`} style={{ padding: 0 }}>
                  <Text>{prereq}</Text>
                </List.Item>
              )}
            />
          </Flex>
        )}
      </Space>

      {/* Risks Section */}
      {plan.risks && plan.risks.length > 0 && (
        <Collapse
          ghost
          style={{ marginBottom: token.marginLG }}
          items={[
            {
              key: "risks",
              label: (
                <Space>
                  <WarningOutlined style={{ color: token.colorWarning }} />
                  <Text strong>Potential Risks ({plan.risks.length})</Text>
                </Space>
              ),
              children: (
                <List
                  size="small"
                  dataSource={plan.risks}
                  renderItem={(risk, idx) => (
                    <List.Item key={`${risk}-${idx}`} style={{ padding: 0 }}>
                      <Text>{risk}</Text>
                    </List.Item>
                  )}
                />
              ),
            },
          ]}
        />
      )}

      {/* Action Buttons */}
      <Space style={{ width: "100%", justifyContent: "flex-end" }}>
        {!refineMode ? (
          <>
            <Button onClick={() => setRefineMode(true)}>Refine Plan</Button>
            <Button
              type="primary"
              icon={<ThunderboltOutlined />}
              onClick={onExecute}
            >
              Execute Plan
            </Button>
          </>
        ) : (
          <>
            <Button onClick={() => setRefineMode(false)}>Cancel</Button>
            <Button
              type="primary"
              onClick={handleRefine}
              disabled={!feedback.trim()}
            >
              Send Feedback
            </Button>
          </>
        )}
      </Space>

      {/* Refinement Input */}
      {refineMode && (
        <Flex vertical style={{ marginTop: token.marginMD }}>
          <Input.TextArea
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder="Provide feedback to refine the plan..."
            autoSize={{ minRows: 4, maxRows: 10 }}
          />
        </Flex>
      )}
    </Card>
  );
};

const PlanMessageCard = memo(PlanMessageCardComponent);
PlanMessageCard.displayName = "PlanMessageCard";

export default PlanMessageCard;

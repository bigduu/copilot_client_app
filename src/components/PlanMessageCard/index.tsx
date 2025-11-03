import React, { useState } from "react";
import {
  Card,
  Steps,
  Button,
  Typography,
  Tag,
  Space,
  Collapse,
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
}

const PlanMessageCard: React.FC<PlanMessageCardProps> = ({
  plan,
  contextId: _contextId,
  onExecute,
  onRefine,
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
    >
      {/* Goal Section */}
      <div style={{ marginBottom: token.marginLG }}>
        <Title level={5} style={{ marginBottom: token.marginXS }}>
          Goal
        </Title>
        <Paragraph style={{ fontSize: 15, marginBottom: 0 }}>
          {plan.goal}
        </Paragraph>
      </div>

      {/* Steps Section */}
      <div style={{ marginBottom: token.marginLG }}>
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
              <div>
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
                <div style={{ marginTop: token.marginXS }}>
                  <Text type="secondary">
                    <ClockCircleOutlined /> Estimated: {step.estimated_time}
                  </Text>
                </div>
              </div>
            ),
            icon: <Text>{step.step_number}</Text>,
          }))}
        />
      </div>

      {/* Metadata Section */}
      <Space
        direction="vertical"
        style={{ width: "100%", marginBottom: token.marginLG }}
      >
        <div>
          <Text type="secondary">
            <ClockCircleOutlined /> Total Estimated Time:{" "}
          </Text>
          <Tag color="blue">{plan.estimated_total_time}</Tag>
        </div>

        {plan.prerequisites && plan.prerequisites.length > 0 && (
          <div>
            <Text type="secondary">Prerequisites:</Text>
            <ul style={{ marginTop: token.marginXS, marginBottom: 0 }}>
              {plan.prerequisites.map((prereq, idx) => (
                <li key={idx}>
                  <Text>{prereq}</Text>
                </li>
              ))}
            </ul>
          </div>
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
                <ul style={{ marginBottom: 0 }}>
                  {plan.risks.map((risk, idx) => (
                    <li key={idx}>
                      <Text>{risk}</Text>
                    </li>
                  ))}
                </ul>
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
        <div style={{ marginTop: token.marginMD }}>
          <textarea
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder="Provide feedback to refine the plan..."
            style={{
              width: "100%",
              minHeight: 100,
              padding: token.paddingSM,
              borderRadius: token.borderRadius,
              border: `1px solid ${token.colorBorder}`,
              fontSize: 14,
              fontFamily: "inherit",
              resize: "vertical",
            }}
          />
        </div>
      )}
    </Card>
  );
};

export default PlanMessageCard;

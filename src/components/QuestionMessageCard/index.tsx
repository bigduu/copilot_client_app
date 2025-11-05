import React, { memo, useState } from "react";
import {
  Card,
  Button,
  Typography,
  Space,
  Radio,
  Alert,
  Tag,
  theme,
} from "antd";
import {
  QuestionCircleOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  WarningOutlined,
  InfoCircleOutlined,
} from "@ant-design/icons";
import { QuestionMessage } from "../../types/chat";

const { Title, Text, Paragraph } = Typography;
const { useToken } = theme;

interface QuestionMessageCardProps {
  question: QuestionMessage;
  contextId: string;
  onAnswer: (answer: string) => void;
  disabled?: boolean;
  timestamp?: string;
}

const QuestionMessageCardComponent: React.FC<QuestionMessageCardProps> = ({
  question,
  contextId: _contextId,
  onAnswer,
  disabled = false,
  timestamp,
}) => {
  const { token } = useToken();
  const [selectedAnswer, setSelectedAnswer] = useState<string | undefined>(
    question.default,
  );
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!selectedAnswer) return;

    setLoading(true);
    try {
      await onAnswer(selectedAnswer);
    } catch (error) {
      console.error("Failed to submit answer:", error);
    } finally {
      setLoading(false);
    }
  };

  const getSeverityIcon = () => {
    switch (question.severity) {
      case "critical":
        return (
          <ExclamationCircleOutlined style={{ color: token.colorError }} />
        );
      case "major":
        return <WarningOutlined style={{ color: token.colorWarning }} />;
      case "minor":
        return <InfoCircleOutlined style={{ color: token.colorInfo }} />;
      default:
        return <QuestionCircleOutlined style={{ color: token.colorPrimary }} />;
    }
  };

  const getSeverityColor = () => {
    switch (question.severity) {
      case "critical":
        return token.colorErrorBg;
      case "major":
        return token.colorWarningBg;
      case "minor":
        return token.colorInfoBg;
      default:
        return token.colorPrimaryBg;
    }
  };

  const getSeverityBorder = () => {
    switch (question.severity) {
      case "critical":
        return token.colorError;
      case "major":
        return token.colorWarning;
      case "minor":
        return token.colorInfo;
      default:
        return token.colorPrimary;
    }
  };

  return (
    <Card
      style={{
        marginBottom: token.marginMD,
        borderColor: getSeverityBorder(),
        borderWidth: 2,
        backgroundColor: getSeverityColor(),
      }}
      title={
        <Space>
          {getSeverityIcon()}
          <Text strong style={{ color: getSeverityBorder() }}>
            Agent Question
          </Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
            ({question.severity})
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
      {/* Question */}
      <div style={{ marginBottom: token.marginLG }}>
        <Title level={5} style={{ marginBottom: token.marginXS }}>
          {question.question}
        </Title>
      </div>

      {/* Context */}
      {question.context && (
        <Alert
          message="Context"
          description={question.context}
          type="info"
          showIcon
          style={{ marginBottom: token.marginLG }}
        />
      )}

      {/* Options */}
      <div style={{ marginBottom: token.marginLG }}>
        <Text strong style={{ display: "block", marginBottom: token.marginSM }}>
          Please choose an option:
        </Text>
        <Radio.Group
          value={selectedAnswer}
          onChange={(e) => setSelectedAnswer(e.target.value)}
          disabled={disabled || loading}
          style={{ width: "100%" }}
        >
          <Space direction="vertical" style={{ width: "100%" }}>
            {question.options.map((option) => (
              <Card
                key={option.value}
                size="small"
                hoverable={!disabled && !loading}
                style={{
                  borderColor:
                    selectedAnswer === option.value
                      ? token.colorPrimary
                      : token.colorBorder,
                  backgroundColor:
                    selectedAnswer === option.value
                      ? token.colorPrimaryBg
                      : token.colorBgContainer,
                  cursor: disabled || loading ? "not-allowed" : "pointer",
                }}
                onClick={() =>
                  !disabled && !loading && setSelectedAnswer(option.value)
                }
              >
                <Radio value={option.value} style={{ width: "100%" }}>
                  <div>
                    <Text strong>{option.label}</Text>
                    {option.value === question.default && (
                      <Tag color="blue" style={{ marginLeft: token.marginXS }}>
                        Recommended
                      </Tag>
                    )}
                    <Paragraph
                      type="secondary"
                      style={{ marginTop: token.marginXXS, marginBottom: 0 }}
                    >
                      {option.description}
                    </Paragraph>
                  </div>
                </Radio>
              </Card>
            ))}
          </Space>
        </Radio.Group>
      </div>

      {/* Custom Answer Input (if allowed) */}
      {question.allow_custom && (
        <div style={{ marginBottom: token.marginMD }}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            Or provide a custom answer:
          </Text>
          <textarea
            value={
              selectedAnswer &&
              !question.options.find((o) => o.value === selectedAnswer)
                ? selectedAnswer
                : ""
            }
            onChange={(e) => setSelectedAnswer(e.target.value)}
            placeholder="Enter custom answer..."
            disabled={disabled || loading}
            style={{
              width: "100%",
              minHeight: 60,
              marginTop: token.marginXS,
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

      {/* Submit Button */}
      <div style={{ textAlign: "right" }}>
        <Button
          type="primary"
          icon={<CheckCircleOutlined />}
          onClick={handleSubmit}
          loading={loading}
          disabled={disabled || !selectedAnswer}
        >
          Submit Answer
        </Button>
      </div>
    </Card>
  );
};

const QuestionMessageCard = memo(QuestionMessageCardComponent);
QuestionMessageCard.displayName = "QuestionMessageCard";

export default QuestionMessageCard;

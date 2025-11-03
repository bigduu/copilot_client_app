import React from "react";
import { Alert, Card } from "antd";
import { CheckCircleOutlined, CloseCircleOutlined } from "@ant-design/icons";

interface WorkflowExecutionFeedbackProps {
  workflowName: string;
  success: boolean;
  result?: any;
  error?: string;
}

/**
 * Component to display workflow execution feedback
 * Shows success/error status and result details
 */
const WorkflowExecutionFeedback: React.FC<WorkflowExecutionFeedbackProps> = ({
  workflowName,
  success,
  result,
  error,
}) => {
  // Format result for display
  const formatResult = (result: any): string => {
    if (!result) return "";

    if (typeof result === "string") {
      return result;
    }

    if (typeof result === "object") {
      return JSON.stringify(result, null, 2);
    }

    return String(result);
  };

  if (success) {
    return (
      <Card
        size="small"
        style={{
          marginBottom: 8,
          background: "#f6ffed",
          borderColor: "#b7eb8f",
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
          <CheckCircleOutlined
            style={{ color: "#52c41a", fontSize: 16, marginTop: 4 }}
          />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, color: "#52c41a", marginBottom: 4 }}>
              Workflow '{workflowName}' executed successfully
            </div>
            {result && (
              <div
                style={{
                  background: "#fff",
                  padding: 8,
                  borderRadius: 4,
                  border: "1px solid #d9f7be",
                  marginTop: 8,
                }}
              >
                <div
                  style={{
                    fontSize: 12,
                    color: "#666",
                    marginBottom: 4,
                    fontWeight: 500,
                  }}
                >
                  Result:
                </div>
                <pre
                  style={{
                    margin: 0,
                    fontSize: 13,
                    fontFamily: "monospace",
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                  }}
                >
                  {formatResult(result)}
                </pre>
              </div>
            )}
          </div>
        </div>
      </Card>
    );
  } else {
    return (
      <Card
        size="small"
        style={{
          marginBottom: 8,
          background: "#fff2f0",
          borderColor: "#ffccc7",
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
          <CloseCircleOutlined
            style={{ color: "#ff4d4f", fontSize: 16, marginTop: 4 }}
          />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, color: "#ff4d4f", marginBottom: 4 }}>
              Workflow '{workflowName}' execution failed
            </div>
            {error && (
              <Alert
                message="Error Details"
                description={
                  <pre
                    style={{
                      margin: 0,
                      fontSize: 13,
                      fontFamily: "monospace",
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                    }}
                  >
                    {error}
                  </pre>
                }
                type="error"
                showIcon={false}
                style={{ marginTop: 8 }}
              />
            )}
          </div>
        </div>
      </Card>
    );
  }
};

export default WorkflowExecutionFeedback;

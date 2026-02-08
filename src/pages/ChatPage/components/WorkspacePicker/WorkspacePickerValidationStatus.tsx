import React from "react";
import { Alert, Space, Typography } from "antd";
import type { WorkspaceValidationResult } from "../../utils/workspaceValidator";

const { Text } = Typography;

interface WorkspacePickerValidationStatusProps {
  result: WorkspaceValidationResult | null;
  token: any;
}

const WorkspacePickerValidationStatus: React.FC<
  WorkspacePickerValidationStatusProps
> = ({ result, token }) => {
  if (!result) return null;

  return (
    <div style={{ marginTop: token.marginXS }}>
      {result.is_valid ? (
        <Alert
          type="success"
          message={
            <Space>
              <span>Valid Workspace</span>
              {result.workspace_name && (
                <Text type="secondary">({result.workspace_name})</Text>
              )}
              {result.file_count !== undefined && (
                <Text type="secondary">- {result.file_count} files</Text>
              )}
            </Space>
          }
          showIcon
        />
      ) : (
        <Alert
          type="error"
          message={result.error_message || "Invalid workspace path"}
          showIcon
        />
      )}
    </div>
  );
};

export default WorkspacePickerValidationStatus;

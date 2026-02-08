import React, { useEffect, useState } from "react";
import { Modal, Typography, Space, Alert, message } from "antd";
import WorkspacePicker from "../WorkspacePicker";
import { recentWorkspacesManager } from "../../services/RecentWorkspacesManager";
import { WorkspaceValidationResult } from "../../services/WorkspaceApiService";

const { Title } = Typography;

interface WorkspacePathModalProps {
  open: boolean;
  initialPath?: string;
  loading?: boolean;
  onSubmit: (workspacePath: string) => void;
  onCancel: () => void;
}

const WorkspacePathModal: React.FC<WorkspacePathModalProps> = ({
  open,
  initialPath = "",
  loading = false,
  onSubmit,
  onCancel,
}) => {
  const [path, setPath] = useState(initialPath);
  const [validationResult, setValidationResult] =
    useState<WorkspaceValidationResult | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setPath(initialPath);
      setValidationResult(null);
    }
  }, [open, initialPath]);

  const handlePathChange = (newPath: string) => {
    setPath(newPath);
  };

  const handleValidationChange = (result: WorkspaceValidationResult | null) => {
    setValidationResult(result);
  };

  const handleSubmit = async () => {
    if (!path.trim()) {
      message.error("Please enter a workspace path");
      return;
    }

    // If path is not valid, show warning but still allow submission
    if (validationResult && !validationResult.is_valid) {
      Modal.confirm({
        title: "Invalid Workspace Path",
        content: (
          <div>
            <p>Potential issues detected with the workspace path:</p>
            <p>{validationResult.error_message || "Invalid path"}</p>
            <p>Do you still want to save this path?</p>
          </div>
        ),
        okText: "Save Anyway",
        cancelText: "Cancel",
        onOk: () => performSubmit(),
      });
    } else {
      performSubmit();
    }
  };

  const performSubmit = async () => {
    setIsSubmitting(true);
    try {
      // Add to recent workspaces if valid
      if (validationResult?.is_valid) {
        await recentWorkspacesManager.addRecentWorkspace(path.trim(), {
          workspace_name: validationResult.workspace_name,
        });
      }

      onSubmit(path.trim());
    } catch (error) {
      console.error("Failed to save workspace path:", error);
      message.error("Failed to save workspace path");
    } finally {
      setIsSubmitting(false);
    }
  };

  const isSubmitDisabled = !path.trim() || loading || isSubmitting;

  return (
    <Modal
      open={open}
      title={
        <Space>
          <Title level={4} style={{ margin: 0 }}>
            Set Workspace Path
          </Title>
        </Space>
      }
      okText="Save"
      cancelText="Cancel"
      onOk={handleSubmit}
      onCancel={onCancel}
      okButtonProps={{
        disabled: isSubmitDisabled,
        loading: isSubmitting || loading,
      }}
      width={600}
      destroyOnClose
    >
      <Space direction="vertical" size="middle" style={{ width: "100%" }}>
        <Alert
          message="Workspace Path Description"
          description={
            <div>
              <p>
                Specify the project root directory associated with the current Chat.
                The backend will provide file listings based on this directory for @
                file references.
              </p>
              <p>It is recommended to select the root directory containing project source code, such as a Git repository root.</p>
            </div>
          }
          type="info"
          showIcon
        />

        <WorkspacePicker
          value={path}
          onChange={handlePathChange}
          onValidationChange={handleValidationChange}
          placeholder="e.g. /Users/alice/Workspace/MyProject"
          disabled={isSubmitting}
          allowBrowse={true}
          showRecentWorkspaces={true}
          showSuggestions={true}
        />

        {validationResult && !validationResult.is_valid && (
          <Alert
            message="Workspace Path Check"
            description={
              validationResult.error_message ||
              "Path may be invalid, please check if the directory exists and is accessible"
            }
            type="warning"
            showIcon
          />
        )}
      </Space>
    </Modal>
  );
};

export default WorkspacePathModal;

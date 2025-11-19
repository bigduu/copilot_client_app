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
  const [validationResult, setValidationResult] = useState<WorkspaceValidationResult | null>(null);
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
      message.error("请输入工作区路径");
      return;
    }

    // If path is not valid, show warning but still allow submission
    if (validationResult && !validationResult.is_valid) {
      Modal.confirm({
        title: "工作区路径无效",
        content: (
          <div>
            <p>检测到工作区路径可能存在问题：</p>
            <p>{validationResult.error_message || "路径无效"}</p>
            <p>是否仍要保存此路径？</p>
          </div>
        ),
        okText: "仍然保存",
        cancelText: "取消",
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
      message.error("保存工作区路径失败");
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
            设置 Workspace 路径
          </Title>
        </Space>
      }
      okText="保存"
      cancelText="取消"
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
          message="工作区路径说明"
          description={
            <div>
              <p>指定当前 Chat 关联的项目根目录。后端会基于该目录提供文件列表，以供 @ 文件引用。</p>
              <p>建议选择包含项目源代码的根目录，如 Git 仓库的根目录。</p>
            </div>
          }
          type="info"
          showIcon
        />

        <WorkspacePicker
          value={path}
          onChange={handlePathChange}
          onValidationChange={handleValidationChange}
          placeholder="例如 /Users/alice/Workspace/MyProject"
          disabled={isSubmitting}
          allowBrowse={true}
          showRecentWorkspaces={true}
          showSuggestions={true}
        />

        {validationResult && !validationResult.is_valid && (
          <Alert
            message="工作区路径检测"
            description={validationResult.error_message || "路径可能无效，请检查目录是否存在且可访问"}
            type="warning"
            showIcon
          />
        )}
      </Space>
    </Modal>
  );
};

export default WorkspacePathModal;









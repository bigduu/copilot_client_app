import React, { useEffect, useState } from "react";
import { Modal, Input, Typography, Space } from "antd";

const { Text } = Typography;

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

  useEffect(() => {
    if (open) {
      setPath(initialPath);
    }
  }, [open, initialPath]);

  const handleOk = () => {
    onSubmit(path.trim());
  };

  return (
    <Modal
      open={open}
      title="设置 Workspace 路径"
      okText="保存"
      cancelText="取消"
      onOk={handleOk}
      onCancel={onCancel}
      okButtonProps={{ disabled: !path.trim(), loading }}
    >
      <Space direction="vertical" size="small" style={{ width: "100%" }}>
        <Text type="secondary">
          指定当前 Chat 关联的项目根目录。后端会基于该目录提供一级文件列表，以供
          @ 文件引用。
        </Text>
        <Input
          value={path}
          onChange={(e) => setPath(e.target.value)}
          placeholder="例如 /Users/alice/Workspace/MyProject"
        />
      </Space>
    </Modal>
  );
};

export default WorkspacePathModal;

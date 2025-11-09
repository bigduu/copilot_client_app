import React from "react";
import { Card, List, Typography, Button, theme, Space, Tag } from "antd";
import { CloseOutlined, FileTextOutlined } from "@ant-design/icons";
import { ProcessedFile } from "../../utils/fileUtils";

const { Text } = Typography;
const { useToken } = theme;

interface FilePreviewProps {
  files: ProcessedFile[];
  onRemove: (fileId: string) => void;
  onClear?: () => void;
}

const FilePreview: React.FC<FilePreviewProps> = ({
  files,
  onRemove,
  onClear,
}) => {
  const { token } = useToken();

  if (files.length === 0) {
    return null;
  }

  return (
    <Card
      size="small"
      style={{
        marginBottom: token.marginXS,
        background: token.colorBgElevated,
        borderRadius: token.borderRadiusSM,
        border: `1px solid ${token.colorBorderSecondary}`,
      }}
      bodyStyle={{ padding: token.paddingSM }}
      title={
        <Space align="center" size={token.marginXS}>
          <FileTextOutlined />
          <Text strong>Attached Files</Text>
          <Tag color="geekblue">{files.length}</Tag>
        </Space>
      }
      extra={
        onClear ? (
          <Button type="text" size="small" onClick={onClear}>
            Clear All
          </Button>
        ) : null
      }
    >
      <List
        dataSource={files}
        renderItem={(file) => (
          <List.Item
            key={file.id}
            style={{
              alignItems: "flex-start",
              padding: `${token.paddingXS}px 0`,
            }}
            actions={[
              <Button
                key="remove"
                type="text"
                size="small"
                icon={<CloseOutlined />}
                onClick={() => onRemove(file.id)}
              >
                Remove
              </Button>,
            ]}
          >
            <List.Item.Meta
              title={
                <Space direction="vertical" size={token.marginXXS}>
                  <Text strong>{file.name}</Text>
                  <Space size={token.marginXS}>
                    <Tag>{file.type || "unknown"}</Tag>
                    <Tag color="purple">{(file.size / 1024).toFixed(1)} KB</Tag>
                    <Tag color="cyan">
                      {file.kind === "text" ? "Text" : "Binary"}
                    </Tag>
                  </Space>
                </Space>
              }
              description={
                <div
                  style={{
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                    fontFamily: "var(--ant-font-family-code)",
                    background: token.colorFillTertiary,
                    borderRadius: token.borderRadiusSM,
                    padding: token.paddingXS,
                    maxHeight: 160,
                    overflowY: "auto",
                  }}
                >
                  {file.preview}
                </div>
              }
            />
          </List.Item>
        )}
      />
    </Card>
  );
};

export default FilePreview;


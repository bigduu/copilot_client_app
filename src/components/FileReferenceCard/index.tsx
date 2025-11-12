import React, { memo } from "react";
import { Space, Tag, Typography, theme, Tooltip } from "antd";
import { FileTextOutlined, FolderOutlined } from "@ant-design/icons";

const { Text } = Typography;

export interface FileReferenceCardProps {
  paths: string[]; // ✅ Changed to array to support multiple files/folders
  displayText: string;
  timestamp?: string;
}

const FileReferenceCardComponent: React.FC<FileReferenceCardProps> = ({
  paths,
  displayText,
}) => {
  const { token } = theme.useToken();

  // Extract user's question (remove all @filename parts)
  const userQuestion = displayText.replace(/@[^\s]+/g, "").trim();

  return (
    <div
      style={{
        display: "inline-flex",
        flexDirection: "column",
        gap: token.marginXS,
        padding: `${token.paddingSM}px ${token.paddingMD}px`,
        backgroundColor: token.colorBgContainer,
        border: `1px solid ${token.colorBorder}`,
        borderRadius: token.borderRadiusLG,
        maxWidth: "100%",
      }}
    >
      {/* File/Folder list */}
      <Space direction="vertical" size={token.marginXXS}>
        {paths.map((path, index) => {
          const fileName = path.split("/").pop() || path;
          const directory = path.substring(0, path.lastIndexOf("/")) || "";
          // Simple heuristic: if no extension, treat as folder
          const isFolder = !fileName.includes(".");

          return (
            <div key={index}>
              {/* File/Folder name row */}
              <Space size={token.marginXS} align="center" wrap>
                {isFolder ? (
                  <FolderOutlined
                    style={{
                      color: token.colorWarning,
                      fontSize: token.fontSizeLG,
                    }}
                  />
                ) : (
                  <FileTextOutlined
                    style={{
                      color: token.colorPrimary,
                      fontSize: token.fontSizeLG,
                    }}
                  />
                )}
                <Tag
                  color={isFolder ? "orange" : "blue"}
                  style={{
                    margin: 0,
                    fontFamily: token.fontFamilyCode,
                    fontSize: token.fontSize,
                  }}
                >
                  {fileName}
                </Tag>
              </Space>

              {/* Directory path (if exists) */}
              {directory && (
                <Tooltip title={path}>
                  <Space size={4} align="center" style={{ marginTop: 4 }}>
                    <FolderOutlined
                      style={{
                        color: token.colorTextTertiary,
                        fontSize: token.fontSizeSM,
                      }}
                    />
                    <Text
                      type="secondary"
                      style={{
                        fontSize: token.fontSizeSM,
                        fontFamily: token.fontFamilyCode,
                        maxWidth: "400px",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                      copyable={{ text: path }}
                    >
                      {directory}
                    </Text>
                  </Space>
                </Tooltip>
              )}
            </div>
          );
        })}
      </Space>

      {/* User's question */}
      {userQuestion && (
        <Text
          style={{
            fontSize: token.fontSize,
            color: token.colorText,
            marginTop: token.marginXS,
            paddingTop: token.marginXS,
            borderTop: `1px solid ${token.colorBorderSecondary}`,
          }}
        >
          {userQuestion}
        </Text>
      )}
    </div>
  );
};

export const FileReferenceCard = memo(FileReferenceCardComponent);
FileReferenceCard.displayName = "FileReferenceCard";

export default FileReferenceCard;

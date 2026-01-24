import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Button,
  Card,
  Collapse,
  Flex,
  Modal,
  Spin,
  Typography,
  theme,
} from "antd";
import {
  DownOutlined,
  FileTextOutlined,
  EditOutlined,
} from "@ant-design/icons";

import {
  claudeCodeService,
  ClaudeMdFile,
} from "../services/ClaudeCodeService";

const { Text } = Typography;

type ClaudeMemoriesDropdownProps = {
  projectPath: string;
};

const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const formatDateTime = (unixSeconds: number): string => {
  const date = new Date(unixSeconds * 1000);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString();
};

export const ClaudeMemoriesDropdown: React.FC<ClaudeMemoriesDropdownProps> = ({
  projectPath,
}) => {
  const { token } = theme.useToken();
  const [open, setOpen] = useState(false);
  const [files, setFiles] = useState<ClaudeMdFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeFile, setActiveFile] = useState<ClaudeMdFile | null>(null);
  const [fileContent, setFileContent] = useState<string>("");
  const [contentLoading, setContentLoading] = useState(false);

  const loadFiles = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const found = await claudeCodeService.findClaudeMdFiles(projectPath);
      setFiles(found);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load CLAUDE.md files");
    } finally {
      setLoading(false);
    }
  }, [projectPath]);

  useEffect(() => {
    if (open && files.length === 0 && !loading) {
      void loadFiles();
    }
  }, [open, files.length, loading, loadFiles]);

  const handleOpenFile = useCallback(async (file: ClaudeMdFile) => {
    setActiveFile(file);
    setFileContent("");
    setContentLoading(true);
    try {
      const content = await claudeCodeService.readClaudeMdFile(
        file.absolute_path,
      );
      setFileContent(content);
    } catch (e) {
      setFileContent(
        e instanceof Error ? e.message : "Failed to load CLAUDE.md",
      );
    } finally {
      setContentLoading(false);
    }
  }, []);

  const fileCountLabel = useMemo(() => {
    if (loading) return "";
    if (!files.length) return "";
    return `(${files.length})`;
  }, [files.length, loading]);

  return (
    <>
      <Card size="small" styles={{ body: { padding: 0 } }}>
        <Collapse
          ghost
          onChange={(keys) => setOpen(Boolean(keys.length))}
          expandIconPosition="end"
          expandIcon={({ isActive }) => (
            <DownOutlined rotate={isActive ? 180 : 0} />
          )}
          items={[
            {
              key: "claude-memories",
              label: (
                <Flex align="center" gap={8}>
                  <FileTextOutlined />
                  <Text>CLAUDE.md Memories {fileCountLabel}</Text>
                </Flex>
              ),
              children: (
                <div style={{ padding: token.paddingSM }}>
                  {loading ? (
                    <Flex justify="center" style={{ padding: token.paddingSM }}>
                      <Spin />
                    </Flex>
                  ) : error ? (
                    <Text type="danger">{error}</Text>
                  ) : files.length === 0 ? (
                    <Text type="secondary">No CLAUDE.md files found</Text>
                  ) : (
                    <Flex vertical gap={token.marginXS}>
                      {files.map((file) => (
                        <Card
                          key={file.absolute_path}
                          size="small"
                          styles={{ body: { padding: token.paddingXS } }}
                        >
                          <Flex align="center" justify="space-between" gap={12}>
                            <Flex vertical style={{ minWidth: 0 }}>
                              <Text ellipsis>{file.relative_path}</Text>
                              <Flex gap={12} wrap>
                                <Text type="secondary" style={{ fontSize: 12 }}>
                                  {formatFileSize(file.size)}
                                </Text>
                                {file.modified ? (
                                  <Text type="secondary" style={{ fontSize: 12 }}>
                                    Modified {formatDateTime(file.modified)}
                                  </Text>
                                ) : null}
                              </Flex>
                            </Flex>
                            <Button
                              icon={<EditOutlined />}
                              onClick={() => handleOpenFile(file)}
                              size="small"
                            >
                              View
                            </Button>
                          </Flex>
                        </Card>
                      ))}
                    </Flex>
                  )}
                </div>
              ),
            },
          ]}
        />
      </Card>

      <Modal
        title={activeFile?.relative_path ?? "CLAUDE.md"}
        open={Boolean(activeFile)}
        onCancel={() => setActiveFile(null)}
        footer={null}
        width={720}
      >
        {contentLoading ? (
          <Flex justify="center" style={{ padding: token.paddingSM }}>
            <Spin />
          </Flex>
        ) : (
          <pre style={{ whiteSpace: "pre-wrap", fontSize: 12, margin: 0 }}>
            {fileContent}
          </pre>
        )}
      </Modal>
    </>
  );
};

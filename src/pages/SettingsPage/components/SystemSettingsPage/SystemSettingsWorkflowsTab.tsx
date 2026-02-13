import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Button,
  Card,
  Flex,
  Input,
  List,
  Space,
  Typography,
  message,
  theme,
} from "antd";
import {
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  ReloadOutlined,
  SaveOutlined,
} from "@ant-design/icons";
import { invoke } from "@tauri-apps/api/core";
import {
  WorkflowManagerService,
  type WorkflowMetadata,
} from "../../../ChatPage/services/WorkflowManagerService";

const { Text } = Typography;
const { TextArea } = Input;
const { useToken } = theme;

const isSafeWorkflowName = (name: string) => {
  if (!name) return false;
  if (name.includes("/") || name.includes("\\") || name.includes("..")) {
    return false;
  }
  return true;
};

const isTauri =
  typeof window !== "undefined" &&
  Boolean((window as any).__TAURI_INTERNALS__);

const SystemSettingsWorkflowsTab: React.FC = () => {
  const { token } = useToken();
  const [msgApi, contextHolder] = message.useMessage();
  const [workflows, setWorkflows] = useState<WorkflowMetadata[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingContent, setIsLoadingContent] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [selectedWorkflow, setSelectedWorkflow] =
    useState<WorkflowMetadata | null>(null);
  const [editorName, setEditorName] = useState("");
  const [editorContent, setEditorContent] = useState("");
  const [isDirty, setIsDirty] = useState(false);

  const workflowService = useMemo(
    () => WorkflowManagerService.getInstance(),
    [],
  );

  const loadWorkflows = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await workflowService.listWorkflows();
      setWorkflows(result);
      return result;
    } catch (error) {
      msgApi.error("Failed to load workflows");
      return [];
    } finally {
      setIsLoading(false);
    }
  }, [msgApi, workflowService]);

  useEffect(() => {
    loadWorkflows();
  }, [loadWorkflows]);

  const handleSelectWorkflow = useCallback(
    async (workflow: WorkflowMetadata) => {
      setSelectedWorkflow(workflow);
      setEditorName(workflow.name);
      setIsDirty(false);
      setIsLoadingContent(true);
      try {
        const result = await workflowService.getWorkflow(workflow.name);
        setEditorContent(result.content ?? "");
      } catch (error) {
        msgApi.error("Failed to load workflow content");
        setEditorContent("");
      } finally {
        setIsLoadingContent(false);
      }
    },
    [msgApi, workflowService],
  );

  const handleCreateNew = () => {
    setSelectedWorkflow(null);
    setEditorName("");
    setEditorContent("");
    setIsDirty(false);
  };

  const handleSave = useCallback(async () => {
    if (!isTauri) {
      msgApi.error("Workflow editing is only available in the desktop app");
      return;
    }
    if (!isSafeWorkflowName(editorName)) {
      msgApi.error("Invalid workflow name");
      return;
    }
    const exists = workflows.some((workflow) => workflow.name === editorName);
    if (!selectedWorkflow && exists) {
      msgApi.error("A workflow with this name already exists");
      return;
    }

    setIsSaving(true);
    try {
      await invoke("save_workflow", {
        name: editorName,
        content: editorContent,
      });
      msgApi.success("Workflow saved");
      setIsDirty(false);
      const updatedList = await loadWorkflows();
      const updated = updatedList.find((item) => item.name === editorName);
      if (updated) {
        setSelectedWorkflow(updated);
      }
    } catch (error) {
      msgApi.error(
        error instanceof Error ? error.message : "Failed to save workflow",
      );
    } finally {
      setIsSaving(false);
    }
  }, [
    editorContent,
    editorName,
    loadWorkflows,
    msgApi,
    selectedWorkflow,
    workflows,
  ]);

  const handleDelete = useCallback(
    async (workflow: WorkflowMetadata) => {
      if (!isTauri) {
        msgApi.error("Workflow deletion is only available in the desktop app");
        return;
      }

      try {
        await invoke("delete_workflow", { name: workflow.name });
        msgApi.success("Workflow deleted");
        if (selectedWorkflow?.name === workflow.name) {
          handleCreateNew();
        }
        await loadWorkflows();
      } catch (error) {
        msgApi.error(
          error instanceof Error ? error.message : "Failed to delete workflow",
        );
      }
    },
    [isTauri, msgApi, selectedWorkflow, loadWorkflows],
  );

  return (
    <div style={{ padding: "24px" }}>
      {contextHolder}
      <Card
        title="Workflows"
        extra={
          <Space>
            <Button
              icon={<ReloadOutlined />}
              onClick={loadWorkflows}
              loading={isLoading}
            >
              Refresh
            </Button>
            <Button icon={<PlusOutlined />} onClick={handleCreateNew}>
              New Workflow
            </Button>
            <Button
              type="primary"
              icon={<SaveOutlined />}
              onClick={handleSave}
              loading={isSaving}
              disabled={!isDirty}
            >
              Save
            </Button>
          </Space>
        }
      >
        <Text type="secondary">
          Workflows are stored in `~/.bamboo/workflows` as Markdown files. Use
          `/name` to insert a workflow in chat.
        </Text>
        <Flex gap={token.marginLG} style={{ marginTop: token.marginLG }}>
          <div style={{ width: 320, flexShrink: 0 }}>
            <List
              loading={isLoading}
              dataSource={workflows}
              locale={{ emptyText: "No workflows found" }}
              renderItem={(workflow) => (
                <List.Item
                  style={{
                    cursor: "pointer",
                    backgroundColor:
                      selectedWorkflow?.name === workflow.name
                        ? token.colorFillSecondary
                        : "transparent",
                    borderRadius: token.borderRadius,
                    padding: token.paddingSM,
                  }}
                  onClick={() => handleSelectWorkflow(workflow)}
                  actions={[
                    <Button
                      key="delete"
                      type="text"
                      danger
                      size="small"
                      icon={<DeleteOutlined />}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(workflow);
                      }}
                    />,
                  ]}
                >
                  <Space direction="vertical" size={0}>
                    <Text strong>/{workflow.name}</Text>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {workflow.filename}
                    </Text>
                  </Space>
                </List.Item>
              )}
            />
          </div>
          <div style={{ flex: 1 }}>
            <Space
              direction="vertical"
              size={token.marginSM}
              style={{ width: "100%" }}
            >
              <Input
                placeholder="Workflow name"
                value={editorName}
                onChange={(e) => {
                  setEditorName(e.target.value);
                  setIsDirty(true);
                }}
                disabled={Boolean(selectedWorkflow)}
                prefix={<EditOutlined />}
              />
              <TextArea
                placeholder="# Workflow Title\n\nDescribe the workflow steps here."
                value={editorContent}
                onChange={(e) => {
                  setEditorContent(e.target.value);
                  setIsDirty(true);
                }}
                autoSize={{ minRows: 12 }}
                disabled={isLoadingContent}
              />
            </Space>
          </div>
        </Flex>
      </Card>
    </div>
  );
};

export default SystemSettingsWorkflowsTab;

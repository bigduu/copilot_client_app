import { useCallback, useEffect, useState } from "react";
import { WorkflowManagerService } from "../../services/WorkflowManagerService";
import type { WorkflowCommandInfo } from "../../utils/inputHighlight";
import type { WorkflowDraft } from "./index";

interface UseInputContainerWorkflowProps {
  content: string;
  setContent: (value: string) => void;
  onWorkflowDraftChange?: (workflow: WorkflowDraft | null) => void;
  acknowledgeManualInput: () => void;
  currentChatId: string | null;
}

export const useInputContainerWorkflow = ({
  content,
  setContent,
  onWorkflowDraftChange,
  acknowledgeManualInput,
  currentChatId,
}: UseInputContainerWorkflowProps) => {
  const [showWorkflowSelector, setShowWorkflowSelector] = useState(false);
  const [workflowSearchText, setWorkflowSearchText] = useState("");
  const [selectedWorkflow, setSelectedWorkflow] =
    useState<WorkflowDraft | null>(null);

  useEffect(() => {
    setSelectedWorkflow(null);
    onWorkflowDraftChange?.(null);
  }, [currentChatId, onWorkflowDraftChange]);

  const matchesWorkflowToken = useCallback(
    (value: string, workflowName: string) => {
      const trimmedValue = value.trimStart();
      const token = `/${workflowName}`;
      if (!trimmedValue.startsWith(token)) {
        return false;
      }
      const nextChar = trimmedValue.charAt(token.length);
      return !nextChar || /\s/.test(nextChar);
    },
    [],
  );

  const clearWorkflowDraft = useCallback(() => {
    setSelectedWorkflow(null);
    onWorkflowDraftChange?.(null);
  }, [onWorkflowDraftChange]);

  const handleInputChange = useCallback(
    (value: string) => {
      acknowledgeManualInput();
      if (
        selectedWorkflow &&
        !matchesWorkflowToken(value, selectedWorkflow.name)
      ) {
        clearWorkflowDraft();
      }
      setContent(value);
    },
    [
      acknowledgeManualInput,
      clearWorkflowDraft,
      matchesWorkflowToken,
      selectedWorkflow,
      setContent,
    ],
  );

  const handleWorkflowCommandChange = useCallback(
    (info: WorkflowCommandInfo) => {
      setShowWorkflowSelector(info.isTriggerActive);
      setWorkflowSearchText(info.isTriggerActive ? info.searchText : "");
    },
    [],
  );

  const applyWorkflowDraft = useCallback(
    (workflow: { name: string; content: string }) => {
      setShowWorkflowSelector(false);
      const nextContent = workflow.content?.trim();
      setContent(`/${workflow.name} `);
      if (nextContent) {
        const draft: WorkflowDraft = {
          id: `workflow-draft-${workflow.name}`,
          name: workflow.name,
          content: nextContent,
          createdAt: new Date().toISOString(),
        };
        setSelectedWorkflow(draft);
        onWorkflowDraftChange?.(draft);
      } else {
        clearWorkflowDraft();
      }
    },
    [clearWorkflowDraft, onWorkflowDraftChange, setContent],
  );

  const handleWorkflowSelect = useCallback(
    (workflow: { name: string; content: string }) => {
      applyWorkflowDraft(workflow);
    },
    [applyWorkflowDraft],
  );

  const handleWorkflowSelectorCancel = useCallback(() => {
    setShowWorkflowSelector(false);
  }, []);

  const handleAutoComplete = useCallback(
    async (workflowName: string) => {
      setShowWorkflowSelector(false);
      try {
        const workflowService = WorkflowManagerService.getInstance();
        const workflow = await workflowService.getWorkflow(workflowName);
        applyWorkflowDraft(workflow);
      } catch (error) {
        console.error(
          `[InputContainer] Failed to load workflow '${workflowName}' in auto-complete:`,
          error,
        );
        setContent(`/${workflowName} `);
        clearWorkflowDraft();
      }
    },
    [applyWorkflowDraft, clearWorkflowDraft, setContent],
  );

  return {
    selectedWorkflow,
    showWorkflowSelector,
    workflowSearchText,
    clearWorkflowDraft,
    matchesWorkflowToken,
    handleInputChange,
    handleWorkflowCommandChange,
    handleWorkflowSelect,
    handleWorkflowSelectorCancel,
    handleAutoComplete,
    setShowWorkflowSelector,
  };
};

import { useEffect, useRef, useState } from "react";
import {
  WorkflowManagerService,
  type WorkflowMetadata,
} from "../../services/WorkflowManagerService";

interface UseWorkflowSelectorStateProps {
  visible: boolean;
  searchText: string;
  onSelect: (workflow: { name: string; content: string }) => void;
  onCancel: () => void;
  onAutoComplete?: (workflowName: string) => void;
}

export const useWorkflowSelectorState = ({
  visible,
  searchText,
  onSelect,
  onCancel,
  onAutoComplete,
}: UseWorkflowSelectorStateProps) => {
  const [workflows, setWorkflows] = useState<WorkflowMetadata[]>([]);
  const [filteredWorkflows, setFilteredWorkflows] = useState<
    WorkflowMetadata[]
  >([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const selectedItemRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!visible) return;

    const workflowService = WorkflowManagerService.getInstance();
    const fetchWorkflows = async () => {
      setIsLoading(true);
      try {
        const fetchedWorkflows = await workflowService.listWorkflows();
        console.log("[WorkflowSelector] Fetched workflows:", fetchedWorkflows);
        setWorkflows(fetchedWorkflows);
        setSelectedIndex(0);
      } catch (error) {
        console.error("[WorkflowSelector] Failed to fetch workflows:", error);
        setWorkflows([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchWorkflows();
  }, [visible]);

  useEffect(() => {
    const filtered = workflows.filter((workflow) =>
      workflow.name.toLowerCase().includes(searchText.toLowerCase()),
    );
    setFilteredWorkflows(filtered);
    setSelectedIndex(0);
  }, [workflows, searchText]);

  useEffect(() => {
    if (!selectedItemRef.current || !containerRef.current) return;
    const container = containerRef.current;
    const selectedItem = selectedItemRef.current;

    const containerRect = container.getBoundingClientRect();
    const selectedRect = selectedItem.getBoundingClientRect();

    if (selectedRect.top < containerRect.top) {
      selectedItem.scrollIntoView({ block: "start", behavior: "smooth" });
    } else if (selectedRect.bottom > containerRect.bottom) {
      selectedItem.scrollIntoView({ block: "end", behavior: "smooth" });
    }
  }, [selectedIndex, filteredWorkflows]);

  const handleWorkflowSelect = async (workflowName: string) => {
    try {
      const workflowService = WorkflowManagerService.getInstance();
      const workflow = await workflowService.getWorkflow(workflowName);

      onSelect({
        name: workflow.name,
        content: workflow.content,
      });
    } catch (error) {
      console.error(
        `[WorkflowSelector] Failed to load workflow '${workflowName}':`,
        error,
      );
      onSelect({ name: workflowName, content: "" });
    }
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!visible) return;

      switch (event.key) {
        case "ArrowDown":
        case "n":
          if (event.key === "n" && !event.ctrlKey) break;
          event.preventDefault();
          event.stopPropagation();
          setSelectedIndex((prev) =>
            prev < filteredWorkflows.length - 1 ? prev + 1 : 0,
          );
          break;
        case "ArrowUp":
        case "p":
          if (event.key === "p" && !event.ctrlKey) break;
          event.preventDefault();
          event.stopPropagation();
          setSelectedIndex((prev) =>
            prev > 0 ? prev - 1 : filteredWorkflows.length - 1,
          );
          break;
        case "Enter":
          event.preventDefault();
          event.stopPropagation();
          if (filteredWorkflows[selectedIndex]) {
            handleWorkflowSelect(filteredWorkflows[selectedIndex].name);
          }
          break;
        case " ":
        case "Tab":
          event.preventDefault();
          event.stopPropagation();
          if (filteredWorkflows[selectedIndex] && onAutoComplete) {
            onAutoComplete(filteredWorkflows[selectedIndex].name);
          }
          break;
        case "Escape":
          event.preventDefault();
          event.stopPropagation();
          onCancel();
          break;
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [visible, filteredWorkflows, selectedIndex, onCancel, onAutoComplete]);

  return {
    containerRef,
    selectedItemRef,
    filteredWorkflows,
    selectedIndex,
    setSelectedIndex,
    isLoading,
    handleWorkflowSelect,
  };
};

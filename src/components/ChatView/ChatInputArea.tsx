import React from "react";
import { Flex } from "antd";

import { InputContainer } from "../InputContainer";
import type { WorkflowDraft } from "../InputContainer";

type ChatInputAreaProps = {
  isCenteredLayout: boolean;
  maxWidth: string;
  onWorkflowDraftChange: (draft: WorkflowDraft | null) => void;
  showMessagesView: boolean;
};

export const ChatInputArea: React.FC<ChatInputAreaProps> = ({
  isCenteredLayout,
  maxWidth,
  onWorkflowDraftChange,
  showMessagesView,
}) => {
  return (
    <Flex
      justify="center"
      className={`chat-view-input-container-wrapper ${
        showMessagesView ? "messages-view" : "centered-view"
      }`}
    >
      <div
        style={{
          width: "100%",
          maxWidth,
          margin: showMessagesView ? "0 auto" : undefined,
        }}
      >
        <InputContainer
          isCenteredLayout={isCenteredLayout}
          onWorkflowDraftChange={onWorkflowDraftChange}
        />
      </div>
    </Flex>
  );
};

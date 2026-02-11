import React, { memo, useCallback, useMemo, useRef, useState } from "react";
import { Card, Dropdown, Flex, Grid, Space, theme } from "antd";
import rehypeSanitize from "rehype-sanitize";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import { format } from "date-fns";
import { ImageGrid } from "../ImageGrid";
import {
  ActionButtonGroup,
  createCopyButton,
  createFavoriteButton,
  createReferenceButton,
} from "../ActionButtonGroup";
import { selectCurrentChat, useAppStore } from "../../store";
import {
  isTodoListMessage,
  isUserFileReferenceMessage,
  type Message,
} from "../../types/chat";
import PlanMessageCard from "../PlanMessageCard";
import QuestionMessageCard from "../QuestionMessageCard";
import FileReferenceCard from "../FileReferenceCard";
import TodoListDisplay from "../TodoListDisplay";
import { createMarkdownComponents } from "../../../../shared/components/Markdown/markdownComponents";
import MessageCardContent from "./MessageCardContent";
import MessageCardHeader from "./MessageCardHeader";
import {
  detectMessageType,
  getMessageText,
  parsePlanMessage,
  parseQuestionMessage,
} from "./messageCardParsing";
import { formatUserToolCall } from "./messageCardFormatters";
import { useMessageCardActions } from "./useMessageCardActions";
import { useMessageCardPlanActions } from "./useMessageCardPlanActions";
import { useMessageCardMermaidFix } from "./useMessageCardMermaidFix";
import { getMessageCardMaxWidth } from "./messageCardLayout";

const { useToken } = theme;
const { useBreakpoint } = Grid;
const CHAT_SEND_MESSAGE_EVENT = "chat-send-message";

type ChatSendMessageEventDetail = {
  content: string;
  handled?: boolean;
  resolve?: () => void;
  reject?: (error: unknown) => void;
};

interface MessageCardProps {
  message: Message;
  onDelete?: (messageId: string) => void;
  messageType?: "text" | "plan" | "question" | "tool_call" | "tool_result";
}

const MessageCardComponent: React.FC<MessageCardProps> = ({
  message,
  onDelete,
  messageType,
}) => {
  const { role, id: messageId } = message;
  const { token } = useToken();
  const screens = useBreakpoint();
  const currentChatId = useAppStore((state) => state.currentChatId);
  const currentChat = useAppStore(selectCurrentChat);
  const updateChat = useAppStore((state) => state.updateChat);
  const isProcessing = useAppStore((state) => state.isProcessing);
  const addFavorite = useAppStore((state) => state.addFavorite);
  const selectedModel = useAppStore((state) => state.selectedModel);
  const cardRef = useRef<HTMLDivElement>(null);
  const [isHovering, setIsHovering] = useState<boolean>(false);

  const sendMessage = useCallback((content: string) => {
    if (typeof window === "undefined") {
      return Promise.reject(new Error("window is unavailable"));
    }

    return new Promise<void>((resolve, reject) => {
      const detail: ChatSendMessageEventDetail = {
        content,
        handled: false,
        resolve,
        reject,
      };

      window.dispatchEvent(
        new CustomEvent<ChatSendMessageEventDetail>(CHAT_SEND_MESSAGE_EVENT, {
          detail,
        }),
      );

      if (!detail.handled) {
        reject(new Error("No chat message dispatcher available"));
      }
    });
  }, []);

  const formattedTimestamp = useMemo(() => {
    if (!message.createdAt) return null;
    const parsed = new Date(message.createdAt);
    if (Number.isNaN(parsed.getTime())) {
      return null;
    }
    try {
      return format(parsed, "MMM d, yyyy HH:mm");
    } catch (error) {
      return parsed.toLocaleString();
    }
  }, [message.createdAt]);

  const detectedMessageType = useMemo(
    () => detectMessageType(message, messageType),
    [message, messageType],
  );

  const parsedPlan = useMemo(
    () => parsePlanMessage(message, detectedMessageType),
    [message, detectedMessageType],
  );

  const parsedQuestion = useMemo(
    () => parseQuestionMessage(message, detectedMessageType),
    [message, detectedMessageType],
  );

  const messageText = useMemo(() => getMessageText(message), [message]);

  const onFixMermaid = useMessageCardMermaidFix({
    message,
    messageId,
    selectedModel,
    currentChatId,
    currentChat,
    updateChat,
  });

  const {
    contextMenuItems,
    handleMouseUp,
    copyToClipboard,
    addMessageToFavorites,
    referenceMessage,
  } = useMessageCardActions({
    messageText,
    messageId,
    role,
    currentChatId,
    addFavorite,
    onDelete,
    cardRef,
  });

  const isUserToolCall = useMemo(
    () => role === "user" && messageText.startsWith("/"),
    [role, messageText],
  );

  const markdownComponents = useMemo(
    () =>
      createMarkdownComponents(token, {
        onFixMermaid,
      }),
    [token, onFixMermaid],
  );

  const markdownPlugins = useMemo(() => [remarkGfm, remarkBreaks], []);
  const rehypePlugins = useMemo(() => [rehypeSanitize], []);

  const { handleExecutePlan, handleRefinePlan, handleQuestionAnswer } =
    useMessageCardPlanActions({
      currentChatId,
      currentChat,
      updateChat,
      sendMessage,
    });

  if (detectedMessageType === "plan" && parsedPlan && role === "assistant") {
    return (
      <PlanMessageCard
        plan={parsedPlan}
        contextId={currentChatId || ""}
        onExecute={handleExecutePlan}
        onRefine={handleRefinePlan}
        timestamp={formattedTimestamp ?? undefined}
      />
    );
  }

  if (
    detectedMessageType === "question" &&
    parsedQuestion &&
    role === "assistant"
  ) {
    return (
      <QuestionMessageCard
        question={parsedQuestion}
        contextId={currentChatId || ""}
        onAnswer={handleQuestionAnswer}
        disabled={isProcessing || false}
        timestamp={formattedTimestamp ?? undefined}
      />
    );
  }

  if (isTodoListMessage(message)) {
    return <TodoListDisplay todoList={message.todoList} />;
  }

  if (isUserFileReferenceMessage(message)) {
    console.log(
      "[MessageCard] Rendering FileReferenceCard for message:",
      message.id,
      "paths:",
      message.paths,
    );
    return (
      <Flex justify="flex-end" style={{ width: "100%" }}>
        <FileReferenceCard
          paths={message.paths}
          displayText={message.displayText}
          timestamp={formattedTimestamp ?? undefined}
        />
      </Flex>
    );
  }

  return (
    <Flex
      vertical
      onContextMenu={(e) => handleMouseUp(e)}
      style={{ width: "100%" }}
    >
      <Dropdown menu={{ items: contextMenuItems }} trigger={["contextMenu"]}>
        <Card
          id={messageId ? `message-${messageId}` : undefined}
          ref={cardRef}
          style={{
            width: "100%",
            minWidth: "100%",
            maxWidth: getMessageCardMaxWidth(screens),
            margin: "0 auto",
            background:
              role === "user"
                ? token.colorPrimaryBg
                : role === "assistant"
                  ? token.colorBgLayout
                  : token.colorBgContainer,
            borderRadius: token.borderRadiusLG,
            boxShadow: token.boxShadow,
            position: "relative",
            wordWrap: "break-word",
            overflowWrap: "break-word",
          }}
          onMouseEnter={() => setIsHovering(true)}
          onMouseLeave={() => setIsHovering(false)}
        >
          <Space
            direction="vertical"
            size={token.marginXS}
            style={{ width: "100%", maxWidth: "100%" }}
          >
            <MessageCardHeader
              role={role}
              formattedTimestamp={formattedTimestamp}
              token={token}
            />

            {message.role === "user" && message.images && (
              <ImageGrid images={message.images} />
            )}

            <Flex vertical style={{ width: "100%", maxWidth: "100%" }}>
              <MessageCardContent
                message={message}
                messageText={messageText}
                isUserToolCall={isUserToolCall}
                formatUserToolCall={formatUserToolCall}
                markdownComponents={markdownComponents}
                markdownPlugins={markdownPlugins}
                rehypePlugins={rehypePlugins}
              />
            </Flex>

            <ActionButtonGroup
              isVisible={isHovering}
              position={{ bottom: token.paddingXS, right: token.paddingXS }}
              buttons={[
                createCopyButton(() => copyToClipboard(messageText)),
                createFavoriteButton(addMessageToFavorites),
                createReferenceButton(referenceMessage),
              ]}
            />
          </Space>
        </Card>
      </Dropdown>
    </Flex>
  );
};

const MessageCard = memo(MessageCardComponent, (prevProps, nextProps) => {
  return (
    prevProps.message === nextProps.message &&
    prevProps.messageType === nextProps.messageType &&
    prevProps.onDelete === nextProps.onDelete
  );
});

MessageCard.displayName = "MessageCard";

export default MessageCard;

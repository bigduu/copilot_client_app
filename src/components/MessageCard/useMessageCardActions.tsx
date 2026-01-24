import type { MouseEvent, RefObject } from "react";
import { useCallback, useMemo, useState } from "react";
import {
  BookOutlined,
  CopyOutlined,
  DeleteOutlined,
  StarOutlined,
} from "@ant-design/icons";

interface UseMessageCardActionsProps {
  messageText: string;
  messageId?: string;
  role: "user" | "assistant" | "system";
  currentChatId?: string | null;
  addFavorite: (favorite: {
    chatId: string;
    content: string;
    role: "user" | "assistant";
    messageId: string;
  }) => void;
  onDelete?: (messageId: string) => void;
  cardRef: RefObject<HTMLDivElement>;
}

export const useMessageCardActions = ({
  messageText,
  messageId,
  role,
  currentChatId,
  addFavorite,
  onDelete,
  cardRef,
}: UseMessageCardActionsProps) => {
  const [selectedText, setSelectedText] = useState<string>("");

  const copyToClipboard = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch (e) {
      console.error("Failed to copy text:", e);
    }
  }, []);

  const addSelectedToFavorites = useCallback(() => {
    if (currentChatId && selectedText && messageId) {
      addFavorite({
        chatId: currentChatId,
        content: selectedText,
        role: role as "user" | "assistant",
        messageId,
      });
      setSelectedText("");
    }
  }, [addFavorite, currentChatId, messageId, role, selectedText]);

  const addMessageToFavorites = useCallback(() => {
    if (!currentChatId || !messageId) return;
    if (selectedText) {
      addSelectedToFavorites();
      return;
    }
    addFavorite({
      chatId: currentChatId,
      content: messageText,
      role: role as "user" | "assistant",
      messageId,
    });
  }, [
    addFavorite,
    addSelectedToFavorites,
    currentChatId,
    messageId,
    messageText,
    role,
    selectedText,
  ]);

  const createReference = useCallback((text: string) => {
    return `> ${text.replace(/\n/g, "\n> ")}`;
  }, []);

  const referenceMessage = useCallback(() => {
    if (!currentChatId) return;
    const referenceText = selectedText
      ? createReference(selectedText)
      : createReference(messageText);
    const event = new CustomEvent("reference-text", {
      detail: { text: referenceText, chatId: currentChatId },
    });
    window.dispatchEvent(event);
  }, [createReference, currentChatId, messageText, selectedText]);

  const handleMouseUp = useCallback(
    (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const selection = window.getSelection();
      const text = selection ? selection.toString() : "";
      if (
        text &&
        cardRef.current &&
        selection &&
        cardRef.current.contains(selection.anchorNode)
      ) {
        setSelectedText(text);
      } else {
        setSelectedText("");
      }
    },
    [cardRef],
  );

  const contextMenuItems = useMemo(() => {
    const baseItems = [
      {
        key: "copy",
        label: "Copy",
        icon: <CopyOutlined />,
        onClick: () => {
          if (selectedText) {
            copyToClipboard(selectedText);
          } else {
            copyToClipboard(messageText);
          }
        },
      },
      {
        key: "favorite",
        label: "Add to favorites",
        icon: <StarOutlined />,
        onClick: addMessageToFavorites,
      },
      {
        key: "reference",
        label: "Reference message",
        icon: <BookOutlined />,
        onClick: referenceMessage,
      },
    ];

    if (onDelete && messageId) {
      baseItems.push({
        key: "delete",
        label: "Delete message",
        icon: <DeleteOutlined />,
        onClick: () => onDelete(messageId),
        danger: true,
      });
    }

    return baseItems;
  }, [
    addMessageToFavorites,
    copyToClipboard,
    messageId,
    messageText,
    onDelete,
    referenceMessage,
    selectedText,
  ]);

  return {
    contextMenuItems,
    handleMouseUp,
    copyToClipboard,
    addMessageToFavorites,
    referenceMessage,
  };
};

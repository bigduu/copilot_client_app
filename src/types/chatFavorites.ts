export interface FavoriteItem {
  id: string;
  chatId: string;
  content: string;
  role: "user" | "assistant";
  createdAt: number;
  originalContent?: string;
  selectionStart?: number;
  selectionEnd?: number;
  note?: string;
  messageId?: string;
}

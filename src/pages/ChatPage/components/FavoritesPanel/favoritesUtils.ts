export const copyToClipboard = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text);
  } catch (e) {
    console.error("Failed to copy text:", e);
  }
};

export const createReference = (content: string) => {
  return `> ${content.replace(/\n/g, "\n> ")}`;
};

export const formatFavoriteDate = (timestamp: number) => {
  return new Date(timestamp).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

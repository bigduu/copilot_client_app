import { v4 as uuid } from "uuid";

export type FileKind = "text" | "binary";

export interface ProcessedFile {
  id: string;
  file: File;
  name: string;
  size: number;
  type: string;
  kind: FileKind;
  content?: string;
  preview: string;
  lastModified: number;
}

const TEXT_MIME_PREFIXES = ["text/", "application/json", "application/xml"];
const TEXT_EXTENSIONS = [
  ".md",
  ".markdown",
  ".txt",
  ".log",
  ".json",
  ".yaml",
  ".yml",
  ".toml",
  ".ini",
  ".csv",
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".py",
  ".java",
  ".rs",
  ".go",
  ".rb",
  ".php",
  ".css",
  ".scss",
  ".less",
  ".html",
  ".sh",
  ".bash",
  ".zsh",
  ".sql",
  ".swift",
  ".kt",
  ".c",
  ".cpp",
  ".h",
  ".hpp",
];

const MAX_TEXT_PREVIEW_BYTES = 200 * 1024; // 200KB

const formatFileSize = (size: number): string => {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(2)} MB`;
};

const hasTextExtension = (fileName: string): boolean => {
  const lower = fileName.toLowerCase();
  return TEXT_EXTENSIONS.some((ext) => lower.endsWith(ext));
};

const isTextLike = (file: File): boolean => {
  if (!file.type && hasTextExtension(file.name)) {
    return true;
  }
  return (
    TEXT_MIME_PREFIXES.some((prefix) => file.type.startsWith(prefix)) ||
    hasTextExtension(file.name)
  );
};

const readFileAsText = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => resolve(reader.result as string);
    reader.readAsText(file);
  });
};

export const processFiles = async (
  files: File[],
  options?: { limitBytes?: number },
): Promise<{ processed: ProcessedFile[]; errors: string[] }> => {
  const limit = options?.limitBytes ?? MAX_TEXT_PREVIEW_BYTES;
  const processed: ProcessedFile[] = [];
  const errors: string[] = [];

  for (const file of files) {
    try {
      if (isTextLike(file) && file.size <= limit) {
        const content = await readFileAsText(file);
        processed.push({
          id: uuid(),
          file,
          name: file.name,
          size: file.size,
          type: file.type || "text/plain",
          kind: "text",
          content,
          preview: content.length > 400 ? `${content.slice(0, 400)}…` : content,
          lastModified: file.lastModified,
        });
      } else {
        processed.push({
          id: uuid(),
          file,
          name: file.name,
          size: file.size,
          type: file.type || "application/octet-stream",
          kind: "binary",
          preview: `(${formatFileSize(file.size)}) Preview unavailable for this file type.`,
          lastModified: file.lastModified,
        });
      }
    } catch (error) {
      console.error("[fileUtils] Failed to process file", file.name, error);
      errors.push(
        `Failed to process ${file.name}: ${(error as Error).message}`,
      );
    }
  }

  return { processed, errors };
};

export const separateImageFiles = (
  files: File[],
): { images: File[]; others: File[] } => {
  const images: File[] = [];
  const others: File[] = [];

  files.forEach((file) => {
    if (file.type.startsWith("image/")) {
      images.push(file);
    } else {
      others.push(file);
    }
  });

  return { images, others };
};

export const summarizeAttachments = (attachments: ProcessedFile[]): string => {
  if (attachments.length === 0) return "";

  return attachments
    .map((attachment) => {
      const header = `### File: ${attachment.name}`;
      const sizeLine = `(_${formatFileSize(attachment.size)}_, ${attachment.type || "unknown"})`;
      if (attachment.kind === "text" && attachment.content) {
        return `${header}\n${sizeLine}\n\n\u0060\u0060\u0060\n${attachment.content}\n\u0060\u0060\u0060`;
      }
      return `${header}\n${sizeLine}\n\n> Preview unavailable for this file type.`;
    })
    .join("\n\n");
};


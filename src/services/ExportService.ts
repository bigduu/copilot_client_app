import { FavoriteItem } from '../types/chat';
import { SUPPORTED_EXPORT_FORMATS } from '../constants';
import { FileOperationsService } from './FileOperationsService';

export interface ExportOptions {
  format: typeof SUPPORTED_EXPORT_FORMATS[number];
  data: FavoriteItem[];
  chatId: string;
  filename?: string;
}

export interface ExportResult {
  filename: string;
  success: boolean;
  error?: string;
}

/**
 * Unified Export Service
 * Consolidates all export functionality to eliminate code duplication
 */
export class ExportService {
  /**
   * Export favorites to specified format
   */
  static async exportFavorites(options: ExportOptions): Promise<ExportResult> {
    try {
      const { format, data, chatId, filename } = options;
      
      // Generate markdown content
      const markdownContent = this.generateMarkdownContent(data, chatId);
      
      // Generate file content based on format
      const fileContent = format === 'markdown' 
        ? new TextEncoder().encode(markdownContent)
        : await this.generatePDFContent(markdownContent);
      
      // Save file
      const savedFilename = await this.saveFile(
        fileContent, 
        format, 
        filename || this.generateFilename(chatId, format)
      );
      
      return {
        filename: savedFilename,
        success: true
      };
    } catch (error) {
      return {
        filename: '',
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  /**
   * Generate markdown content from favorites
   */
  private static generateMarkdownContent(favorites: FavoriteItem[], chatId: string): string {
    let content = `# Chat Favorites Export\n\n`;
    content += `**Generated:** ${new Date().toLocaleString("en-US")}\n`;
    content += `**Chat ID:** ${chatId}\n`;
    content += `**Total Favorites:** ${favorites.length}\n\n`;
    content += `---\n\n`;

    favorites.forEach((fav, index) => {
      content += `## ${fav.role === "user" ? "👤 You" : "🤖 Assistant"} (${index + 1})\n\n`;
      content += `**Created:** ${this.formatDate(fav.createdAt.toString())}\n\n`;
      content += fav.content + "\n\n";
      
      if (fav.note) {
        content += `> **Note:** ${fav.note}\n\n`;
      }
      
      content += `---\n\n`;
    });

    return content;
  }

  /**
   * Generate PDF content from markdown
   */
  private static async generatePDFContent(markdownContent: string): Promise<Uint8Array> {
    // Dynamic import to avoid bundling jsPDF if not needed
    const { jsPDF } = await import('jspdf');
    
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 20;
    const maxWidth = pageWidth - 2 * margin;
    
    // Set font
    doc.setFont("helvetica", "normal");
    doc.setFontSize(12);
    
    let yPosition = margin;
    const lineHeight = 7;
    
    // Split content into lines and process
    const lines = markdownContent.split('\n');
    
    for (const line of lines) {
      // Handle different markdown elements
      if (line.startsWith('# ')) {
        // Main heading
        doc.setFontSize(18);
        doc.setFont("helvetica", "bold");
        yPosition = this.addTextToPDF(doc, line.substring(2), margin, yPosition, maxWidth, lineHeight * 1.5);
        doc.setFontSize(12);
        doc.setFont("helvetica", "normal");
        yPosition += 5;
      } else if (line.startsWith('## ')) {
        // Section heading
        doc.setFontSize(14);
        doc.setFont("helvetica", "bold");
        yPosition = this.addTextToPDF(doc, line.substring(3), margin, yPosition, maxWidth, lineHeight * 1.2);
        doc.setFontSize(12);
        doc.setFont("helvetica", "normal");
        yPosition += 3;
      } else if (line.startsWith('**') && line.endsWith('**')) {
        // Bold text
        doc.setFont("helvetica", "bold");
        yPosition = this.addTextToPDF(doc, line.substring(2, line.length - 2), margin, yPosition, maxWidth, lineHeight);
        doc.setFont("helvetica", "normal");
      } else if (line.startsWith('> ')) {
        // Quote/note
        doc.setFont("helvetica", "italic");
        yPosition = this.addTextToPDF(doc, line.substring(2), margin + 10, yPosition, maxWidth - 10, lineHeight);
        doc.setFont("helvetica", "normal");
      } else if (line.trim() === '---') {
        // Separator
        yPosition += 5;
        doc.line(margin, yPosition, pageWidth - margin, yPosition);
        yPosition += 5;
      } else if (line.trim() !== '') {
        // Regular text
        yPosition = this.addTextToPDF(doc, line, margin, yPosition, maxWidth, lineHeight);
      } else {
        // Empty line
        yPosition += lineHeight / 2;
      }
      
      // Check if we need a new page
      if (yPosition > pageHeight - margin) {
        doc.addPage();
        yPosition = margin;
      }
    }
    
    return new Uint8Array(doc.output('arraybuffer'));
  }

  /**
   * Add text to PDF with word wrapping
   */
  private static addTextToPDF(
    doc: any, 
    text: string, 
    x: number, 
    y: number, 
    maxWidth: number, 
    lineHeight: number
  ): number {
    const lines = doc.splitTextToSize(text, maxWidth);
    
    for (const line of lines) {
      doc.text(line, x, y);
      y += lineHeight;
    }
    
    return y;
  }

  /**
   * Save file using unified FileOperationsService
   */
  private static async saveFile(
    content: Uint8Array,
    format: string,
    defaultFilename: string
  ): Promise<string> {
    const filters = format === 'markdown'
      ? FileOperationsService.FILTERS.MARKDOWN.map(f => ({ name: f.name, extensions: Array.from(f.extensions) }))
      : FileOperationsService.FILTERS.PDF.map(f => ({ name: f.name, extensions: Array.from(f.extensions) }));

    const result = await FileOperationsService.saveBinaryFile(
      content,
      filters,
      defaultFilename
    );

    if (!result.success) {
      throw new Error(result.error || "Failed to save file");
    }

    return result.filename;
  }

  /**
   * Generate filename based on chat ID and format
   */
  private static generateFilename(chatId: string, format: string): string {
    const extension = format === 'markdown' ? 'md' : 'pdf';
    return FileOperationsService.generateChatExportFilename(chatId, extension as 'md' | 'pdf');
  }

  /**
   * Format date for display
   */
  private static formatDate(dateString: string): string {
    try {
      return new Date(dateString).toLocaleString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return dateString;
    }
  }
}

// Application constants
// Add any frontend constants here that are not configuration-dependent

export const APP_NAME = 'Copilot Chat';
export const VERSION = '0.1.0';

// UI Constants
export const DEFAULT_THEME = 'light';
export const SUPPORTED_THEMES = ['light', 'dark'] as const;

// File size limits (in bytes)
export const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB
export const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

// Supported file types
export const SUPPORTED_IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp'
] as const;

export const SUPPORTED_EXPORT_FORMATS = ['markdown', 'pdf'] as const;
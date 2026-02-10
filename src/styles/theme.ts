/**
 * Unified theme configuration file
 * Based on Ant Design Design Tokens, providing a consistent design system
 */

// Base color system - Using CSS variables to ensure theme consistency
export const colors = {
  // Primary colors
  primary: "var(--ant-color-primary)",
  primaryHover: "var(--ant-color-primary-hover)",
  primaryActive: "var(--ant-color-primary-active)",

  // Status colors
  success: "var(--ant-color-success)",
  warning: "var(--ant-color-warning)",
  error: "var(--ant-color-error)",
  info: "var(--ant-color-info)",

  // Text colors
  text: "var(--ant-color-text)",
  textSecondary: "var(--ant-color-text-secondary)",
  textTertiary: "var(--ant-color-text-tertiary)",
  textDisabled: "var(--ant-color-text-disabled)",

  // Background colors
  bg: "var(--ant-color-bg-base)",
  bgElevated: "var(--ant-color-bg-elevated)",
  bgContainer: "var(--ant-color-bg-container)",

  // Border colors
  border: "var(--ant-color-border)",
  borderSecondary: "var(--ant-color-border-secondary)",

  // Fill colors
  fill: "var(--ant-color-fill)",
  fillSecondary: "var(--ant-color-fill-secondary)",
  fillTertiary: "var(--ant-color-fill-tertiary)",
  fillQuaternary: "var(--ant-color-fill-quaternary)",

  // Custom colors (maintaining existing functionality)
  pinned: "#faad14", // Pinned status color
  selected: {
    light: "#dddddd",
    dark: "#2b2b2b",
  },
} as const;

// Spacing system - Based on 8px grid
export const spacing = {
  xs: "4px", // 0.5x
  sm: "8px", // 1x
  md: "12px", // 1.5x
  lg: "16px", // 2x
  xl: "24px", // 3x
  xxl: "32px", // 4x
  xxxl: "48px", // 6x
} as const;

// Font size system
export const fontSize = {
  xs: "12px",
  sm: "13px", // Currently used by ChatItem title
  base: "14px",
  lg: "16px",
  xl: "18px",
  xxl: "20px",
  xxxl: "24px",
} as const;

// Border radius system
export const borderRadius = {
  none: "0",
  sm: "4px",
  base: "6px", // Currently used by ChatItem
  lg: "8px",
  xl: "12px",
  full: "9999px",
} as const;

// Shadow system
export const shadows = {
  none: "none",
  sm: "0 1px 2px 0 rgba(0, 0, 0, 0.05)",
  base: "0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)",
  lg: "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)",
  xl: "0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)",
} as const;

// Animation system
export const animation = {
  // Transition duration
  duration: {
    fast: "0.1s",
    normal: "0.2s",
    slow: "0.3s", // Currently used by ChatItem
  },

  // Easing functions
  easing: {
    ease: "ease",
    easeIn: "ease-in",
    easeOut: "ease-out",
    easeInOut: "ease-in-out",
  },

  // Common transition combinations
  transition: {
    all: "all 0.3s ease", // Currently used by ChatItem
    opacity: "opacity 0.2s ease", // Button hover effect
    background: "background-color 0.2s ease",
    transform: "transform 0.2s ease",
  },
} as const;

// Z-index layer management
export const zIndex = {
  base: 1,
  elevated: 10,
  dropdown: 100,
  modal: 1000,
  tooltip: 2000,
  notification: 3000,
} as const;

// Component-specific style mixins
export const components = {
  // ChatItem component styles
  chatItem: {
    padding: spacing.sm,
    borderRadius: borderRadius.base,
    marginBottom: spacing.xs,
    fontSize: fontSize.sm,
    transition: animation.transition.all,

    // Selected state
    selected: {
      fontWeight: 500,
    },

    // Button group
    buttonGroup: {
      gap: spacing.xs,
    },

    // Edit input field
    editInput: {
      fontSize: fontSize.sm,
      marginRight: spacing.sm,
    },
  },

  // Button component
  button: {
    // Opacity animation
    hoverOpacity: {
      default: 0,
      hover: 1,
      transition: animation.transition.opacity,
    },
  },
} as const;

// Responsive breakpoints
export const breakpoints = {
  xs: "480px",
  sm: "576px",
  md: "768px",
  lg: "992px",
  xl: "1200px",
  xxl: "1600px",
} as const;

// Export complete theme object
export const theme = {
  colors,
  spacing,
  fontSize,
  borderRadius,
  shadows,
  animation,
  zIndex,
  components,
  breakpoints,
} as const;

// Type definitions
export type Theme = typeof theme;
export type ThemeColors = typeof colors;
export type ThemeSpacing = typeof spacing;

// Default export
export default theme;

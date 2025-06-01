/**
 * 统一主题配置文件
 * 基于Ant Design Design Tokens，提供一致的设计系统
 */

// 基础颜色系统 - 使用CSS变量确保主题一致性
export const colors = {
  // 主色调
  primary: 'var(--ant-color-primary)',
  primaryHover: 'var(--ant-color-primary-hover)',
  primaryActive: 'var(--ant-color-primary-active)',
  
  // 状态色
  success: 'var(--ant-color-success)',
  warning: 'var(--ant-color-warning)', 
  error: 'var(--ant-color-error)',
  info: 'var(--ant-color-info)',
  
  // 文本色
  text: 'var(--ant-color-text)',
  textSecondary: 'var(--ant-color-text-secondary)',
  textTertiary: 'var(--ant-color-text-tertiary)',
  textDisabled: 'var(--ant-color-text-disabled)',
  
  // 背景色
  bg: 'var(--ant-color-bg-base)',
  bgElevated: 'var(--ant-color-bg-elevated)',
  bgContainer: 'var(--ant-color-bg-container)',
  bgSpotlight: 'var(--ant-color-bg-spotlight)',
  
  // 边框色
  border: 'var(--ant-color-border)',
  borderSecondary: 'var(--ant-color-border-secondary)',
  
  // 特殊色
  fill: 'var(--ant-color-fill)',
  fillSecondary: 'var(--ant-color-fill-secondary)',
  fillTertiary: 'var(--ant-color-fill-tertiary)',
  fillQuaternary: 'var(--ant-color-fill-quaternary)',
  
  // 自定义颜色 (保持现有功能)
  pinned: '#faad14', // 置顶状态色
  selected: {
    light: '#dddddd',
    dark: '#2b2b2b',
  },
} as const;

// 间距系统 - 基于8px基准
export const spacing = {
  xs: '4px',    // 0.5x
  sm: '8px',    // 1x  
  md: '12px',   // 1.5x
  lg: '16px',   // 2x
  xl: '24px',   // 3x
  xxl: '32px',  // 4x
  xxxl: '48px', // 6x
} as const;

// 字体大小系统
export const fontSize = {
  xs: '12px',
  sm: '13px',  // ChatItem title当前使用
  base: '14px',
  lg: '16px',
  xl: '18px',
  xxl: '20px',
  xxxl: '24px',
} as const;

// 圆角系统
export const borderRadius = {
  none: '0',
  sm: '4px',
  base: '6px',  // ChatItem当前使用
  lg: '8px',
  xl: '12px',
  full: '9999px',
} as const;

// 阴影系统
export const shadows = {
  none: 'none',
  sm: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
  base: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)',
  lg: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
  xl: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
} as const;

// 动画系统
export const animation = {
  // 过渡持续时间
  duration: {
    fast: '0.1s',
    normal: '0.2s',
    slow: '0.3s',  // ChatItem当前使用
  },
  
  // 缓动函数
  easing: {
    ease: 'ease',
    easeIn: 'ease-in',
    easeOut: 'ease-out',
    easeInOut: 'ease-in-out',
  },
  
  // 常用过渡组合
  transition: {
    all: 'all 0.3s ease',           // ChatItem当前使用
    opacity: 'opacity 0.2s ease',   // 按钮hover效果
    background: 'background-color 0.2s ease',
    transform: 'transform 0.2s ease',
  },
} as const;

// Z-index层级管理
export const zIndex = {
  base: 1,
  elevated: 10,
  dropdown: 100,
  modal: 1000,
  tooltip: 2000,
  notification: 3000,
} as const;

// 组件特定样式混合
export const components = {
  // ChatItem组件样式
  chatItem: {
    padding: spacing.sm,
    borderRadius: borderRadius.base,
    marginBottom: spacing.xs,
    fontSize: fontSize.sm,
    transition: animation.transition.all,
    
    // 选中状态
    selected: {
      fontWeight: 500,
    },
    
    // 按钮组
    buttonGroup: {
      gap: spacing.xs,
    },
    
    // 编辑输入框
    editInput: {
      fontSize: fontSize.sm,
      marginRight: spacing.sm,
    },
  },
  
  // 按钮组件
  button: {
    // 透明度动画
    hoverOpacity: {
      default: 0,
      hover: 1,
      transition: animation.transition.opacity,
    },
  },
} as const;

// 响应式断点
export const breakpoints = {
  xs: '480px',
  sm: '576px', 
  md: '768px',
  lg: '992px',
  xl: '1200px',
  xxl: '1600px',
} as const;

// 导出完整主题对象
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

// 类型定义
export type Theme = typeof theme;
export type ThemeColors = typeof colors;
export type ThemeSpacing = typeof spacing;

// 默认导出
export default theme;
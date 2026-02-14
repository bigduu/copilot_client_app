import React from 'react';
import { Progress, Tooltip, Space } from 'antd';
import {
  TokenUsage,
  getUsagePercentage,
  getUsageColor,
  formatTokenCount,
} from '../types/tokenBudget';

interface TokenUsageDisplayProps {
  /** Token usage information */
  usage: TokenUsage;
  /** Whether to show the detailed breakdown */
  showDetails?: boolean;
  /** Size of the progress bar */
  size?: 'small' | 'default';
  /** Additional CSS class */
  className?: string;
}

/**
 * Display token usage with a compact line progress bar.
 *
 * Shows:
 * - Line progress bar with color coding (green/yellow/red)
 * - Percentage text
 * - Tooltip with detailed breakdown on hover
 */
export const TokenUsageDisplay: React.FC<TokenUsageDisplayProps> = ({
  usage,
  showDetails = true,
  size = 'small',
  className = '',
}) => {
  const percentage = getUsagePercentage(usage);
  const color = getUsageColor(usage);

  const getProgressStrokeColor = () => {
    if (percentage >= 90) return '#ff4d4f';
    if (percentage >= 70) return '#faad14';
    return '#52c41a';
  };

  const tooltipContent = (
    <div style={{ minWidth: 180 }}>
      <div style={{ marginBottom: 4, fontWeight: 'bold' }}>Token Usage</div>
      <div style={{ fontSize: 12 }}>
        {formatTokenCount(usage.totalTokens)} / {formatTokenCount(usage.budgetLimit)} tokens
      </div>
      <div style={{ fontSize: 12, color: '#888' }}>{percentage.toFixed(1)}% used</div>
      {showDetails && (
        <div style={{ marginTop: 6, borderTop: '1px solid #ddd', paddingTop: 6, fontSize: 11 }}>
          <div>System: {formatTokenCount(usage.systemTokens)}</div>
          {usage.summaryTokens > 0 && (
            <div>Summary: {formatTokenCount(usage.summaryTokens)}</div>
          )}
          <div>Messages: {formatTokenCount(usage.windowTokens)}</div>
        </div>
      )}
    </div>
  );

  return (
    <Tooltip title={tooltipContent} placement="top" arrow>
      <Space
        className={`token-usage-display ${className}`}
        size={4}
        align="center"
        style={{ lineHeight: 1 }}
      >
        <Progress
          type="line"
          percent={Math.min(percentage, 100)}
          size={{ height: size === 'small' ? 6 : 8, width: 80 }}
          strokeColor={getProgressStrokeColor()}
          showInfo={false}
          style={{ margin: 0, lineHeight: 1 }}
        />
        <span
          style={{
            fontSize: size === 'small' ? 11 : 12,
            color: color === 'error' ? '#ff4d4f' : color === 'warning' ? '#faad14' : '#52c41a',
            whiteSpace: 'nowrap',
            fontWeight: 500,
          }}
        >
          {percentage.toFixed(0)}%
        </span>
      </Space>
    </Tooltip>
  );
};

/**
 * Ultra-compact token usage badge showing just the percentage.
 */
export const TokenUsageBadge: React.FC<{
  usage: TokenUsage;
  className?: string;
}> = ({ usage, className = '' }) => {
  const percentage = getUsagePercentage(usage);
  const color = getUsageColor(usage);

  const getBadgeColor = () => {
    switch (color) {
      case 'error':
        return '#ff4d4f';
      case 'warning':
        return '#faad14';
      case 'success':
        return '#52c41a';
      default:
        return '#bfbfbf';
    }
  };

  return (
    <Tooltip
      title={`${formatTokenCount(usage.totalTokens)} / ${formatTokenCount(usage.budgetLimit)} tokens (${percentage.toFixed(1)}%)`}
    >
      <span
        className={`token-usage-badge ${className}`}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          padding: '1px 6px',
          borderRadius: 10,
          fontSize: 11,
          fontWeight: 500,
          backgroundColor: getBadgeColor() + '20',
          color: getBadgeColor(),
          border: `1px solid ${getBadgeColor()}40`,
          lineHeight: 1,
        }}
      >
        {percentage.toFixed(0)}%
      </span>
    </Tooltip>
  );
};

export default TokenUsageDisplay;

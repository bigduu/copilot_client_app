import React, { useState, useEffect } from 'react';
import { Table, InputNumber, Switch, Select, Button, Space, Card, Typography, message, Divider } from 'antd';
import { SaveOutlined, ReloadOutlined } from '@ant-design/icons';
import {
  KNOWN_MODEL_LIMITS,
  BudgetStrategy,
} from '../ChatPage/types/tokenBudget';

const { Title, Text, Paragraph } = Typography;
const { Option } = Select;

interface ModelLimitConfig {
  model: string;
  maxContextTokens: number;
  maxOutputTokens: number;
  strategy: BudgetStrategy;
}

/**
 * Settings component for configuring model limits and token budgets.
 */
export const ModelLimitsSettings: React.FC = () => {
  const [configs, setConfigs] = useState<ModelLimitConfig[]>([]);
  const [defaultStrategy, setDefaultStrategy] = useState<BudgetStrategy>({
    type: 'hybrid',
    windowSize: 20,
    enableSummarization: true,
  });
  const [loading, setLoading] = useState(false);

  // Load settings from localStorage on mount
  useEffect(() => {
    const savedConfigs = localStorage.getItem('modelLimitsConfigs');
    const savedStrategy = localStorage.getItem('defaultBudgetStrategy');

    if (savedConfigs) {
      try {
        setConfigs(JSON.parse(savedConfigs));
      } catch {
        // If parsing fails, use defaults
        initializeDefaultConfigs();
      }
    } else {
      initializeDefaultConfigs();
    }

    if (savedStrategy) {
      try {
        setDefaultStrategy(JSON.parse(savedStrategy));
      } catch {
        // Use default
      }
    }
  }, []);

  const initializeDefaultConfigs = () => {
    const defaultConfigs = Object.entries(KNOWN_MODEL_LIMITS)
      .slice(0, 5) // Just show top 5 models
      .map(([model, maxContextTokens]) => ({
        model,
        maxContextTokens,
        maxOutputTokens: Math.min(4096, Math.floor(maxContextTokens / 4)),
        strategy: defaultStrategy,
      }));
    setConfigs(defaultConfigs);
  };

  const saveSettings = () => {
    setLoading(true);
    try {
      localStorage.setItem('modelLimitsConfigs', JSON.stringify(configs));
      localStorage.setItem('defaultBudgetStrategy', JSON.stringify(defaultStrategy));
      message.success('Settings saved successfully');
    } catch {
      message.error('Failed to save settings');
    } finally {
      setLoading(false);
    }
  };

  const resetToDefaults = () => {
    initializeDefaultConfigs();
    setDefaultStrategy({
      type: 'hybrid',
      windowSize: 20,
      enableSummarization: true,
    });
    localStorage.removeItem('modelLimitsConfigs');
    localStorage.removeItem('defaultBudgetStrategy');
    message.info('Settings reset to defaults');
  };

  const updateConfig = (index: number, updates: Partial<ModelLimitConfig>) => {
    setConfigs((prev) =>
      prev.map((config, i) => (i === index ? { ...config, ...updates } : config))
    );
  };

  const columns = [
    {
      title: 'Model',
      dataIndex: 'model',
      key: 'model',
      width: 200,
      render: (model: string) => <Text strong>{model}</Text>,
    },
    {
      title: 'Context Window',
      dataIndex: 'maxContextTokens',
      key: 'maxContextTokens',
      width: 150,
      render: (value: number, _record: ModelLimitConfig, index: number) => (
        <InputNumber
          value={value}
          onChange={(v) => updateConfig(index, { maxContextTokens: v || 128000 })}
          min={1000}
          max={1000000}
          step={1000}
          style={{ width: '100%' }}
        />
      ),
    },
    {
      title: 'Max Output',
      dataIndex: 'maxOutputTokens',
      key: 'maxOutputTokens',
      width: 150,
      render: (value: number, _record: ModelLimitConfig, index: number) => (
        <InputNumber
          value={value}
          onChange={(v) => updateConfig(index, { maxOutputTokens: v || 4096 })}
          min={256}
          max={100000}
          step={256}
          style={{ width: '100%' }}
        />
      ),
    },
    {
      title: 'Strategy',
      dataIndex: 'strategy',
      key: 'strategy',
      render: (strategy: BudgetStrategy, _record: ModelLimitConfig, index: number) => (
        <Space>
          <Select
            value={strategy.type}
            onChange={(type) =>
              updateConfig(index, {
                strategy:
                  type === 'window'
                    ? { type: 'window', size: 20 }
                    : { type: 'hybrid', windowSize: 20, enableSummarization: true },
              })
            }
            style={{ width: 100 }}
          >
            <Option value="window">Window</Option>
            <Option value="hybrid">Hybrid</Option>
          </Select>
          {strategy.type === 'window' && (
            <InputNumber
              value={strategy.size}
              onChange={(v) =>
                updateConfig(index, {
                  strategy: { type: 'window', size: v || 20 },
                })
              }
              min={5}
              max={100}
              addonBefore="Size"
            />
          )}
          {strategy.type === 'hybrid' && (
            <>
              <InputNumber
                value={strategy.windowSize}
                onChange={(v) =>
                  updateConfig(index, {
                    strategy: { ...strategy, windowSize: v || 20 },
                  })
                }
                min={5}
                max={100}
                addonBefore="Window"
              />
              <Switch
                checked={strategy.enableSummarization}
                onChange={(checked) =>
                  updateConfig(index, {
                    strategy: { ...strategy, enableSummarization: checked },
                  })
                }
                checkedChildren="Summary"
                unCheckedChildren="No sum"
              />
            </>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div className="model-limits-settings">
      <Card>
        <Title level={4}>Token Budget Management</Title>
        <Paragraph type="secondary">
          Configure how the application manages token budgets for conversations.
          When conversations exceed these limits, older messages are truncated
          while preserving tool-call chains.
        </Paragraph>

        <Divider />

        <Title level={5}>Default Strategy</Title>
        <Space direction="vertical" style={{ width: '100%', marginBottom: 16 }}>
          <Space>
            <Text>Strategy Type:</Text>
            <Select
              value={defaultStrategy.type}
              onChange={(type) =>
                setDefaultStrategy(
                  type === 'window'
                    ? { type: 'window', size: 20 }
                    : { type: 'hybrid', windowSize: 20, enableSummarization: true }
                )
              }
              style={{ width: 120 }}
            >
              <Option value="window">Window Only</Option>
              <Option value="hybrid">Hybrid</Option>
            </Select>
          </Space>
          {defaultStrategy.type === 'window' && (
            <Space>
              <Text>Window Size:</Text>
              <InputNumber
                value={defaultStrategy.size}
                onChange={(v) =>
                  setDefaultStrategy({ type: 'window', size: v || 20 })
                }
                min={5}
                max={100}
              />
            </Space>
          )}
          {defaultStrategy.type === 'hybrid' && (
            <>
              <Space>
                <Text>Window Size:</Text>
                <InputNumber
                  value={defaultStrategy.windowSize}
                  onChange={(v) =>
                    setDefaultStrategy({ ...defaultStrategy, windowSize: v || 20 })
                  }
                  min={5}
                  max={100}
                />
              </Space>
              <Space>
                <Text>Enable Summarization:</Text>
                <Switch
                  checked={defaultStrategy.enableSummarization}
                  onChange={(checked) =>
                    setDefaultStrategy({ ...defaultStrategy, enableSummarization: checked })
                  }
                />
              </Space>
            </>
          )}
        </Space>

        <Divider />

        <Title level={5}>Model Limits</Title>
        <Paragraph type="secondary">
          Context window limits for specific models. These are used when the
          session doesn't specify a custom budget.
        </Paragraph>

        <Table
          dataSource={configs}
          columns={columns}
          rowKey="model"
          pagination={false}
          size="small"
          style={{ marginBottom: 16 }}
        />

        <Space>
          <Button
            type="primary"
            icon={<SaveOutlined />}
            onClick={saveSettings}
            loading={loading}
          >
            Save Settings
          </Button>
          <Button icon={<ReloadOutlined />} onClick={resetToDefaults}>
            Reset to Defaults
          </Button>
        </Space>
      </Card>
    </div>
  );
};

export default ModelLimitsSettings;

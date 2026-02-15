import React, { useState, useEffect } from 'react';
import {
  Form,
  Select,
  Input,
  Button,
  Card,
  message,
  Space,
  Divider,
  Typography,
  Alert,
  Tag,
  Spin,
  Modal,
} from 'antd';
import {
  SaveOutlined,
  ReloadOutlined,
  KeyOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  LoginOutlined,
  LogoutOutlined,
  CopyOutlined,
} from '@ant-design/icons';
import {
  settingsService,
  type CopilotAuthStatus,
  type DeviceCodeInfo,
} from '../../../../services/config/SettingsService';
import type {
  ProviderConfig,
  ProviderType,
} from '../../../ChatPage/types/providerConfig';
import {
  PROVIDER_LABELS,
  OPENAI_MODELS,
  ANTHROPIC_MODELS,
  GEMINI_MODELS,
} from '../../../ChatPage/types/providerConfig';

const { Option } = Select;
const { Password } = Input;
const { Text, Paragraph } = Typography;

/**
 * Provider Settings Component
 *
 * Allows users to configure and switch between different LLM providers.
 */
export const ProviderSettings: React.FC = () => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [applyingConfig, setApplyingConfig] = useState(false);
  const [currentProvider, setCurrentProvider] = useState<ProviderType>('copilot');
  const [configLoaded, setConfigLoaded] = useState(false);
  const [copilotAuthStatus, setCopilotAuthStatus] = useState<CopilotAuthStatus | null>(null);
  const [checkingCopilotAuth, setCheckingCopilotAuth] = useState(false);
  const [authenticatingCopilot, setAuthenticatingCopilot] = useState(false);
  const [deviceCodeInfo, setDeviceCodeInfo] = useState<DeviceCodeInfo | null>(null);
  const [isDeviceCodeModalVisible, setIsDeviceCodeModalVisible] = useState(false);
  const [completingAuth, setCompletingAuth] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState<number>(0);
  const [copiedUserCode, setCopiedUserCode] = useState(false);

  // Countdown timer for device code expiration
  useEffect(() => {
    if (!isDeviceCodeModalVisible || !deviceCodeInfo) {
      setTimeRemaining(0);
      return;
    }

    setTimeRemaining(deviceCodeInfo.expires_in);

    const timer = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isDeviceCodeModalVisible, deviceCodeInfo]);

  useEffect(() => {
    loadConfig();
  }, []);

  useEffect(() => {
    if (currentProvider === 'copilot') {
      checkCopilotAuthStatus();
    }
  }, [currentProvider]);

  const loadConfig = async () => {
    try {
      setLoading(true);
      const config = await settingsService.getProviderConfig();
      setCurrentProvider(config.provider as ProviderType);
      form.setFieldsValue(config);
      setConfigLoaded(true);
    } catch (error) {
      message.error('Failed to load provider config');
      console.error('Failed to load provider config:', error);
    } finally {
      setLoading(false);
    }
  };

  const checkCopilotAuthStatus = async () => {
    try {
      setCheckingCopilotAuth(true);
      const status = await settingsService.getCopilotAuthStatus();
      setCopilotAuthStatus(status);
    } catch (error) {
      console.error('Failed to check Copilot auth status:', error);
      setCopilotAuthStatus({ authenticated: false, message: 'Failed to check status' });
    } finally {
      setCheckingCopilotAuth(false);
    }
  };

  const handleCopilotAuthenticate = async () => {
    try {
      setAuthenticatingCopilot(true);
      // Start authentication - get device code
      const deviceCode = await settingsService.startCopilotAuth();
      setDeviceCodeInfo(deviceCode);
      setIsDeviceCodeModalVisible(true);
    } catch (error) {
      message.error('Failed to start Copilot authentication');
      console.error('Failed to start Copilot authentication:', error);
    } finally {
      setAuthenticatingCopilot(false);
    }
  };

  const handleCompleteAuth = async () => {
    if (!deviceCodeInfo) return;

    try {
      setCompletingAuth(true);
      // Complete authentication - poll for token
      await settingsService.completeCopilotAuth({
        device_code: deviceCodeInfo.device_code, // Use the actual device code, not user code!
        interval: deviceCodeInfo.interval || 5,
        expires_in: deviceCodeInfo.expires_in,
      });
      message.success('Copilot authentication successful!');
      setIsDeviceCodeModalVisible(false);
      setDeviceCodeInfo(null);
      await checkCopilotAuthStatus();
      // Reload provider to use the new authentication
      await settingsService.reloadConfig();
      message.success('Provider reloaded with new authentication.');
    } catch (error) {
      message.error('Authentication completion failed. Please try again.');
      console.error('Authentication completion failed:', error);
    } finally {
      setCompletingAuth(false);
    }
  };

  // Note: Browser is opened automatically by backend when starting auth

  const handleCopyUserCode = async () => {
    if (deviceCodeInfo) {
      try {
        await navigator.clipboard.writeText(deviceCodeInfo.user_code);
        setCopiedUserCode(true);
        message.success('User code copied to clipboard!');
        setTimeout(() => setCopiedUserCode(false), 2000);
      } catch (error) {
        message.error('Failed to copy code. Please manually copy: ' + deviceCodeInfo.user_code);
      }
    }
  };

  const handleCopilotLogout = async () => {
    try {
      setAuthenticatingCopilot(true);
      await settingsService.logoutCopilot();
      message.success('Logged out from Copilot');
      await checkCopilotAuthStatus();
    } catch (error) {
      message.error('Failed to logout from Copilot');
      console.error('Failed to logout:', error);
    } finally {
      setAuthenticatingCopilot(false);
    }
  };

  const handleProviderChange = (value: ProviderType) => {
    setCurrentProvider(value);
    form.setFieldsValue({ provider: value });
  };

  const handleSave = async (values: ProviderConfig) => {
    try {
      setLoading(true);
      await settingsService.saveProviderConfig(values);
      message.success('Configuration saved successfully');
    } catch (error) {
      message.error('Failed to save configuration');
      console.error('Failed to save configuration:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleApply = async () => {
    try {
      setApplyingConfig(true);
      await settingsService.reloadConfig();
      message.success('Configuration applied successfully. Changes will take effect for new conversations.');
    } catch (error) {
      message.error('Failed to apply configuration');
      console.error('Failed to apply configuration:', error);
    } finally {
      setApplyingConfig(false);
    }
  };

  const renderProviderFields = () => {
    switch (currentProvider) {
      case 'openai':
        return (
          <>
            <Alert
              message="OpenAI Configuration"
              description="Enter your OpenAI API key to use GPT models. You can optionally specify a custom base URL for proxy servers."
              type="info"
              showIcon
              style={{ marginBottom: 16 }}
            />
            <Form.Item
              name={['providers', 'openai', 'api_key']}
              label="OpenAI API Key"
              rules={[{ required: true, message: 'Please enter your OpenAI API key' }]}
            >
              <Password
                placeholder="sk-..."
                prefix={<KeyOutlined />}
              />
            </Form.Item>
            <Form.Item
              name={['providers', 'openai', 'base_url']}
              label="Base URL (Optional)"
              extra="Leave empty to use the default OpenAI API endpoint"
            >
              <Input placeholder="https://api.openai.com/v1" />
            </Form.Item>
            <Form.Item
              name={['providers', 'openai', 'model']}
              label="Default Model"
            >
              <Select placeholder="Select a model" allowClear>
                {OPENAI_MODELS.map((model) => (
                  <Option key={model.value} value={model.value}>
                    {model.label}
                  </Option>
                ))}
              </Select>
            </Form.Item>
          </>
        );

      case 'anthropic':
        return (
          <>
            <Alert
              message="Anthropic Configuration"
              description="Enter your Anthropic API key to use Claude models."
              type="info"
              showIcon
              style={{ marginBottom: 16 }}
            />
            <Form.Item
              name={['providers', 'anthropic', 'api_key']}
              label="Anthropic API Key"
              rules={[{ required: true, message: 'Please enter your Anthropic API key' }]}
            >
              <Password
                placeholder="sk-ant-..."
                prefix={<KeyOutlined />}
              />
            </Form.Item>
            <Form.Item
              name={['providers', 'anthropic', 'base_url']}
              label="Base URL (Optional)"
              extra="Leave empty to use the default Anthropic API endpoint"
            >
              <Input placeholder="https://api.anthropic.com" />
            </Form.Item>
            <Form.Item
              name={['providers', 'anthropic', 'model']}
              label="Default Model"
            >
              <Select placeholder="Select a model" allowClear>
                {ANTHROPIC_MODELS.map((model) => (
                  <Option key={model.value} value={model.value}>
                    {model.label}
                  </Option>
                ))}
              </Select>
            </Form.Item>
            <Form.Item
              name={['providers', 'anthropic', 'max_tokens']}
              label="Max Tokens (Optional)"
              extra="Maximum number of tokens to generate"
            >
              <Input type="number" placeholder="4096" min={1} max={100000} />
            </Form.Item>
          </>
        );

      case 'gemini':
        return (
          <>
            <Alert
              message="Google Gemini Configuration"
              description="Enter your Google AI API key to use Gemini models."
              type="info"
              showIcon
              style={{ marginBottom: 16 }}
            />
            <Form.Item
              name={['providers', 'gemini', 'api_key']}
              label="Gemini API Key"
              rules={[{ required: true, message: 'Please enter your Gemini API key' }]}
            >
              <Password
                placeholder="AIza..."
                prefix={<KeyOutlined />}
              />
            </Form.Item>
            <Form.Item
              name={['providers', 'gemini', 'base_url']}
              label="Base URL (Optional)"
              extra="Leave empty to use the default Google AI API endpoint"
            >
              <Input placeholder="https://generativelanguage.googleapis.com" />
            </Form.Item>
            <Form.Item
              name={['providers', 'gemini', 'model']}
              label="Default Model"
            >
              <Select placeholder="Select a model" allowClear>
                {GEMINI_MODELS.map((model) => (
                  <Option key={model.value} value={model.value}>
                    {model.label}
                  </Option>
                ))}
              </Select>
            </Form.Item>
          </>
        );

      case 'copilot':
        return (
          <>
            <Alert
              message="GitHub Copilot Configuration"
              description="GitHub Copilot uses OAuth authentication. No API key is required. Make sure you have an active GitHub Copilot subscription."
              type="info"
              showIcon
            />

            <Card
              size="small"
              style={{ marginTop: 16, marginBottom: 16 }}
              title="Authentication Status"
              extra={
                checkingCopilotAuth ? (
                  <Spin size="small" />
                ) : copilotAuthStatus?.authenticated ? (
                  <Tag icon={<CheckCircleOutlined />} color="success">
                    Authenticated
                  </Tag>
                ) : (
                  <Tag icon={<CloseCircleOutlined />} color="error">
                    Not Authenticated
                  </Tag>
                )
              }
            >
              {copilotAuthStatus?.message && (
                <Paragraph type="secondary" style={{ marginBottom: 16 }}>
                  {copilotAuthStatus.message}
                </Paragraph>
              )}

              <Space>
                {copilotAuthStatus?.authenticated ? (
                  <Button
                    danger
                    icon={<LogoutOutlined />}
                    onClick={handleCopilotLogout}
                    loading={authenticatingCopilot}
                  >
                    Logout from Copilot
                  </Button>
                ) : (
                  <Button
                    type="primary"
                    icon={<LoginOutlined />}
                    onClick={handleCopilotAuthenticate}
                    loading={authenticatingCopilot}
                  >
                    Authenticate Copilot
                  </Button>
                )}
                <Button
                  onClick={checkCopilotAuthStatus}
                  loading={checkingCopilotAuth}
                >
                  Refresh Status
                </Button>
              </Space>
            </Card>

            <Paragraph type="secondary">
              To use GitHub Copilot:
              <ul style={{ marginTop: 8, marginBottom: 0 }}>
                <li>Ensure you have an active GitHub Copilot subscription</li>
                <li>Click "Authenticate Copilot" to start the device code flow</li>
                <li>Follow the instructions in your terminal to complete authentication</li>
              </ul>
            </Paragraph>
          </>
        );

      default:
        return null;
    }
  };

  return (
    <Card
      title="LLM Provider Configuration"
      loading={loading && !configLoaded}
      extra={
        <Text type="secondary">
          Current Provider: <Text strong>{PROVIDER_LABELS[currentProvider]}</Text>
        </Text>
      }
    >
      <Paragraph type="secondary">
        Configure your preferred LLM provider. Changes will take effect for new conversations
        after you click "Apply Configuration".
      </Paragraph>

      <Divider />

      <Form
        form={form}
        layout="vertical"
        onFinish={handleSave}
        disabled={loading}
      >
        <Form.Item
          name="provider"
          label="Active LLM Provider"
          rules={[{ required: true, message: 'Please select a provider' }]}
        >
          <Select onChange={handleProviderChange} size="large">
            {(Object.keys(PROVIDER_LABELS) as ProviderType[]).map((key) => (
              <Option key={key} value={key}>
                {PROVIDER_LABELS[key]}
              </Option>
            ))}
          </Select>
        </Form.Item>

        <Divider />

        {renderProviderFields()}

        <Divider />

        <Space size="middle">
          <Button
            type="primary"
            htmlType="submit"
            icon={<SaveOutlined />}
            loading={loading}
            size="large"
          >
            Save Configuration
          </Button>
          <Button
            icon={<ReloadOutlined />}
            onClick={handleApply}
            loading={applyingConfig}
            disabled={loading}
            size="large"
          >
            Apply Configuration
          </Button>
        </Space>
      </Form>

      {/* Device Code Modal for Copilot Authentication */}
      <Modal
        title="Copilot Authentication"
        open={isDeviceCodeModalVisible}
        onCancel={() => setIsDeviceCodeModalVisible(false)}
        footer={[
          <Button key="cancel" onClick={() => setIsDeviceCodeModalVisible(false)}>
            Cancel
          </Button>,
          <Button
            key="complete"
            type="primary"
            onClick={handleCompleteAuth}
            loading={completingAuth}
          >
            I've Completed Authorization
          </Button>,
        ]}
      >
        {deviceCodeInfo && (
          <Space direction="vertical" size="large" style={{ width: '100%' }}>
            <Alert
              message="Browser opened automatically"
              description={
                <ol>
                  <li>A GitHub page should have opened in your browser</li>
                  <li>Copy the code below and paste it on the GitHub page</li>
                  <li>Click "Continue" on GitHub to authorize</li>
                </ol>
              }
              type="info"
            />

            {/* Verification URL */}
            <Card size="small">
              <Space direction="vertical" style={{ width: '100%' }}>
                <Text type="secondary">1. Visit this URL:</Text>
                <Space>
                  <Text copyable={{ text: deviceCodeInfo.verification_uri }}>
                    {deviceCodeInfo.verification_uri}
                  </Text>
                </Space>
              </Space>
            </Card>

            {/* User Code */}
            <Card style={{ textAlign: 'center', background: '#f5f5f5' }}>
              <Space direction="vertical" style={{ width: '100%' }}>
                <Text type="secondary">2. Enter this code:</Text>
                <Space>
                  <Text style={{ fontSize: '32px', fontFamily: 'monospace', fontWeight: 'bold', letterSpacing: '4px' }}>
                    {deviceCodeInfo.user_code}
                  </Text>
                  <Button
                    icon={copiedUserCode ? <CheckCircleOutlined /> : <CopyOutlined />}
                    onClick={handleCopyUserCode}
                    type={copiedUserCode ? "default" : "primary"}
                  >
                    {copiedUserCode ? 'Copied!' : 'Copy Code'}
                  </Button>
                </Space>
                <div style={{ marginTop: 8 }}>
                  <Tag color={timeRemaining < 60 ? 'red' : timeRemaining < 180 ? 'orange' : 'green'}>
                    ⏱️ Expires in {Math.floor(timeRemaining / 60)}:{(timeRemaining % 60).toString().padStart(2, '0')}
                  </Tag>
                </div>
              </Space>
            </Card>

            <Paragraph type="secondary">
              After clicking "Continue" on GitHub, click the "I've Completed Authorization" button below.
            </Paragraph>
          </Space>
        )}
      </Modal>
    </Card>
  );
};

export default ProviderSettings;

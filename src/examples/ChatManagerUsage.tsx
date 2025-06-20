import React, { useState, useEffect } from "react";
import {
  useUnifiedChatManager,
  useDevChatManager,
} from "../hooks/useUnifiedChatManager";
import {
  ChatManagerFactory,
  ConfigurationScenario,
} from "../core/ChatManagerFactory";
import { CreateChatOptions, CreateMessageOptions } from "../types/unified-chat";
import {
  Button,
  Card,
  Input,
  List,
  message,
  Space,
  Typography,
  Divider,
} from "antd";

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;

/**
 * UnifiedChatManager使用示例组件
 * 展示如何使用UnifiedChatManager的各种功能
 */
export const ChatManagerUsage: React.FC = () => {
  return (
    <div style={{ padding: "24px", maxWidth: "1200px", margin: "0 auto" }}>
      <Title level={2}>UnifiedChatManager 使用示例</Title>

      <Space direction="vertical" size="large" style={{ width: "100%" }}>
        {/* Hook使用示例 */}
        <HookUsageExample />

        <Divider />

        {/* 工厂模式使用示例 */}
        <FactoryUsageExample />

        <Divider />

        {/* 原子操作示例 */}
        <AtomicOperationsExample />

        <Divider />

        {/* 批量操作示例 */}
        <BatchOperationsExample />
      </Space>
    </div>
  );
};

/**
 * React Hook使用示例
 */
const HookUsageExample: React.FC = () => {
  const {
    manager,
    isInitialized,
    isLoading,
    error,
    state,
    addChat,
    addMessage,
    getCurrentChat,
    getAllChats,
  } = useDevChatManager({
    onStateChange: (newState) => {
      console.log("状态已更新:", newState);
    },
    onError: (err) => {
      console.error("Hook错误:", err);
    },
  });

  const [chatTitle, setChatTitle] = useState("");
  const [messageContent, setMessageContent] = useState("");

  const handleCreateChat = async () => {
    if (!chatTitle.trim()) {
      message.warning("请输入聊天标题");
      return;
    }

    try {
      const result = await addChat({
        title: chatTitle,
        systemPrompt: "你是一个helpful助手",
        autoApproval: true,
      });

      if (result.success) {
        message.success(`聊天创建成功: ${result.data}`);
        setChatTitle("");
      } else {
        message.error(`创建失败: ${result.error}`);
      }
    } catch (err) {
      message.error("创建聊天时发生错误");
    }
  };

  const handleSendMessage = async () => {
    const currentChat = getCurrentChat();
    if (!currentChat) {
      message.warning("请先创建一个聊天");
      return;
    }

    if (!messageContent.trim()) {
      message.warning("请输入消息内容");
      return;
    }

    try {
      const result = await addMessage(currentChat.id, {
        content: messageContent,
        role: "user",
      });

      if (result.success) {
        message.success("消息发送成功");
        setMessageContent("");
      } else {
        message.error(`发送失败: ${result.error}`);
      }
    } catch (err) {
      message.error("发送消息时发生错误");
    }
  };

  return (
    <Card title="React Hook 使用示例" style={{ width: "100%" }}>
      <Space direction="vertical" size="middle" style={{ width: "100%" }}>
        <div>
          <Text strong>状态信息:</Text>
          <ul>
            <li>初始化状态: {isInitialized ? "已初始化" : "未初始化"}</li>
            <li>加载状态: {isLoading ? "加载中" : "空闲"}</li>
            <li>错误状态: {error ? error.message : "无错误"}</li>
            <li>聊天数量: {getAllChats().length}</li>
          </ul>
        </div>

        <Space>
          <Input
            placeholder="输入聊天标题"
            value={chatTitle}
            onChange={(e) => setChatTitle(e.target.value)}
            style={{ width: 200 }}
          />
          <Button
            type="primary"
            onClick={handleCreateChat}
            disabled={!isInitialized}
          >
            创建聊天
          </Button>
        </Space>

        <Space>
          <TextArea
            placeholder="输入消息内容"
            value={messageContent}
            onChange={(e) => setMessageContent(e.target.value)}
            rows={2}
            style={{ width: 300 }}
          />
          <Button
            type="primary"
            onClick={handleSendMessage}
            disabled={!isInitialized}
          >
            发送消息
          </Button>
        </Space>

        {getAllChats().length > 0 && (
          <div>
            <Text strong>聊天列表:</Text>
            <List
              size="small"
              dataSource={getAllChats()}
              renderItem={(chat) => (
                <List.Item>
                  <Text>{chat.title}</Text>
                  <Text type="secondary"> (ID: {chat.id})</Text>
                </List.Item>
              )}
            />
          </div>
        )}
      </Space>
    </Card>
  );
};

/**
 * 工厂模式使用示例
 */
const FactoryUsageExample: React.FC = () => {
  const [manager, setManager] = useState<any>(null);
  const [logs, setLogs] = useState<string[]>([]);

  const addLog = (message: string) => {
    setLogs((prev) => [
      ...prev,
      `${new Date().toLocaleTimeString()}: ${message}`,
    ]);
  };

  const createDevelopmentManager = () => {
    const devManager = ChatManagerFactory.createForDevelopment();
    setManager(devManager);
    addLog("创建开发环境ChatManager");
  };

  const createProductionManager = () => {
    const prodManager = ChatManagerFactory.createForProduction();
    setManager(prodManager);
    addLog("创建生产环境ChatManager");
  };

  const createCustomManager = () => {
    const customManager = ChatManagerFactory.createWithConfig({
      enablePerformanceMonitoring: true,
      enableAutoApproval: false,
      maxConcurrentOperations: 15,
      defaultErrorRetryCount: 2,
    });
    setManager(customManager);
    addLog("创建自定义配置ChatManager");
  };

  const initializeManager = async () => {
    if (!manager) return;

    try {
      await manager.initialize();
      addLog("ChatManager初始化成功");
    } catch (err) {
      addLog(`初始化失败: ${err}`);
    }
  };

  return (
    <Card title="工厂模式使用示例" style={{ width: "100%" }}>
      <Space direction="vertical" size="middle" style={{ width: "100%" }}>
        <Paragraph>
          使用工厂模式可以快速创建不同配置的ChatManager实例：
        </Paragraph>

        <Space wrap>
          <Button onClick={createDevelopmentManager}>
            创建开发环境Manager
          </Button>
          <Button onClick={createProductionManager}>创建生产环境Manager</Button>
          <Button onClick={createCustomManager}>创建自定义配置Manager</Button>
          <Button
            type="primary"
            onClick={initializeManager}
            disabled={!manager}
          >
            初始化Manager
          </Button>
        </Space>

        {logs.length > 0 && (
          <div>
            <Text strong>操作日志:</Text>
            <List
              size="small"
              dataSource={logs}
              renderItem={(log) => (
                <List.Item>
                  <Text code>{log}</Text>
                </List.Item>
              )}
            />
          </div>
        )}
      </Space>
    </Card>
  );
};

/**
 * 原子操作示例
 */
const AtomicOperationsExample: React.FC = () => {
  const {
    manager,
    isInitialized,
    addChat,
    updateChat,
    addMessage,
    updateMessage,
  } = useDevChatManager();
  const [operationLogs, setOperationLogs] = useState<string[]>([]);

  const addOperationLog = (message: string) => {
    setOperationLogs((prev) => [
      ...prev,
      `${new Date().toLocaleTimeString()}: ${message}`,
    ]);
  };

  const demonstrateAtomicOperations = async () => {
    if (!manager || !isInitialized) {
      addOperationLog("Manager未初始化");
      return;
    }

    try {
      // 1. 创建聊天
      addOperationLog("开始原子操作演示...");

      const chatResult = await addChat({
        title: "原子操作测试聊天",
        systemPrompt: "这是一个测试聊天",
        autoApproval: true,
      });

      if (!chatResult.success) {
        addOperationLog(`创建聊天失败: ${chatResult.error}`);
        return;
      }

      const chatId = chatResult.data!;
      addOperationLog(`✓ 创建聊天成功: ${chatId}`);

      // 2. 更新聊天
      const updateResult = await updateChat(chatId, {
        title: "更新后的聊天标题",
        pinned: true,
      });

      if (updateResult.success) {
        addOperationLog("✓ 聊天更新成功");
      } else {
        addOperationLog(`聊天更新失败: ${updateResult.error}`);
      }

      // 3. 添加消息
      const messageResult = await addMessage(chatId, {
        content: "这是第一条测试消息",
        role: "user",
      });

      if (messageResult.success) {
        const messageId = messageResult.data!;
        addOperationLog(`✓ 添加消息成功: ${messageId}`);

        // 4. 更新消息
        const updateMessageResult = await updateMessage(messageId, {
          content: "这是更新后的消息内容",
        });

        if (updateMessageResult.success) {
          addOperationLog("✓ 消息更新成功");
        } else {
          addOperationLog(`消息更新失败: ${updateMessageResult.error}`);
        }
      } else {
        addOperationLog(`添加消息失败: ${messageResult.error}`);
      }

      addOperationLog("原子操作演示完成");
    } catch (err) {
      addOperationLog(`操作过程中发生错误: ${err}`);
    }
  };

  return (
    <Card title="原子操作示例" style={{ width: "100%" }}>
      <Space direction="vertical" size="middle" style={{ width: "100%" }}>
        <Paragraph>
          演示UnifiedChatManager的原子操作：addChat、updateChat、addMessage、updateMessage
        </Paragraph>

        <Button
          type="primary"
          onClick={demonstrateAtomicOperations}
          disabled={!isInitialized}
        >
          执行原子操作演示
        </Button>

        {operationLogs.length > 0 && (
          <div>
            <Text strong>操作日志:</Text>
            <List
              size="small"
              dataSource={operationLogs}
              renderItem={(log) => (
                <List.Item>
                  <Text code>{log}</Text>
                </List.Item>
              )}
            />
          </div>
        )}
      </Space>
    </Card>
  );
};

/**
 * 批量操作示例
 */
const BatchOperationsExample: React.FC = () => {
  const { manager, isInitialized } = useDevChatManager();
  const [batchLogs, setBatchLogs] = useState<string[]>([]);

  const addBatchLog = (message: string) => {
    setBatchLogs((prev) => [
      ...prev,
      `${new Date().toLocaleTimeString()}: ${message}`,
    ]);
  };

  const demonstrateBatchOperations = async () => {
    if (!manager || !isInitialized) {
      addBatchLog("Manager未初始化");
      return;
    }

    try {
      addBatchLog("开始批量操作演示...");

      // 创建批量操作
      const operations = [
        {
          type: "addChat" as const,
          data: {
            title: "批量聊天1",
            systemPrompt: "这是批量创建的聊天1",
          },
        },
        {
          type: "addChat" as const,
          data: {
            title: "批量聊天2",
            systemPrompt: "这是批量创建的聊天2",
          },
        },
        {
          type: "addChat" as const,
          data: {
            title: "批量聊天3",
            systemPrompt: "这是批量创建的聊天3",
          },
        },
      ];

      // 执行批量操作
      const batchResult = await manager.batchOperation(operations);

      if (batchResult.success) {
        addBatchLog(
          `✓ 批量操作成功: ${batchResult.successCount}/${operations.length}`
        );
        addBatchLog(`成功操作数: ${batchResult.successCount}`);
        addBatchLog(`失败操作数: ${batchResult.failureCount}`);
      } else {
        addBatchLog(`批量操作失败: ${batchResult.message}`);
      }

      addBatchLog("批量操作演示完成");
    } catch (err) {
      addBatchLog(`批量操作过程中发生错误: ${err}`);
    }
  };

  return (
    <Card title="批量操作示例" style={{ width: "100%" }}>
      <Space direction="vertical" size="middle" style={{ width: "100%" }}>
        <Paragraph>演示UnifiedChatManager的批量操作功能</Paragraph>

        <Button
          type="primary"
          onClick={demonstrateBatchOperations}
          disabled={!isInitialized}
        >
          执行批量操作演示
        </Button>

        {batchLogs.length > 0 && (
          <div>
            <Text strong>批量操作日志:</Text>
            <List
              size="small"
              dataSource={batchLogs}
              renderItem={(log) => (
                <List.Item>
                  <Text code>{log}</Text>
                </List.Item>
              )}
            />
          </div>
        )}
      </Space>
    </Card>
  );
};

export default ChatManagerUsage;

# Chat Persistence - 聊天记忆功能

## ADDED Requirements

### Requirement: Last Opened Chat Memory

系统 SHALL 通过后端存储记住用户最后打开的 Chat,并在应用重新启动时自动恢复,支持多端同步。

**背景**: 项目支持多种前端(Web、Desktop、Mobile),需要后端统一管理用户偏好。

#### Scenario: 保存最后打开的 Chat 到后端

- **WHEN** 用户选择一个 Chat
- **THEN** 系统异步调用后端 API 保存该 Chat 的 ID
- **AND** 使用 `PUT /api/user/preferences` 端点
- **AND** 请求体包含 `last_opened_chat_id` 字段
- **AND** 保存操作不阻塞 UI,异步进行

#### Scenario: 应用启动时从后端恢复 Chat

- **WHEN** 应用启动并加载 Chat 列表
- **THEN** 系统调用 `GET /api/user/preferences` 获取用户偏好
- **AND** 从返回的数据中读取 `last_opened_chat_id`
- **AND** 如果该 Chat 仍然存在,自动选中并打开
- **AND** Chat 的消息和状态被正确加载

#### Scenario: 上次 Chat 已被删除的处理

- **WHEN** 后端返回的 `last_opened_chat_id` 对应的 Chat 已不存在
- **THEN** 系统选择第一个可用的 Chat(按时间倒序)
- **AND** 如果没有任何 Chat,保持无选中状态
- **AND** 不显示错误信息,静默处理

#### Scenario: 后端请求失败的降级处理

- **WHEN** 保存或获取偏好设置的 API 调用失败
- **THEN** 系统记录警告日志但不中断用户操作
- **AND** 启动时如果无法获取偏好,使用兜底逻辑(选择第一个 Chat)
- **AND** 不显示错误提示,保证用户体验

#### Scenario: 跨设备/客户端同步

- **WHEN** 用户在不同设备或客户端(Web/Desktop/Mobile)间切换
- **THEN** 每个设备都能获取到最后打开的 Chat
- **AND** 后端存储确保数据一致性
- **AND** 提供统一的用户体验

#### Scenario: 用户偏好的异步保存

- **WHEN** 用户快速切换多个 Chat
- **THEN** 系统使用防抖或节流避免频繁请求
- **AND** 最终保存最后一次的选择
- **AND** 不影响 UI 的响应速度

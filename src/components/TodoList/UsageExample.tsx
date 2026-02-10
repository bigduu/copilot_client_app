/**
 * TodoList Usage Examples
 *
 * Using TodoList component in ChatPage or other pages
 */

import React, { useState } from 'react';
import TodoList from './TodoList';

// Example 1: Basic Usage
export const BasicExample: React.FC = () => {
  const sessionId = 'your-session-uuid';

  return (
    <div>
      <h2>Conversation</h2>
      {/* Default collapsed */}
      <TodoList sessionId={sessionId} />
      {/* Chat content... */}
    </div>
  );
};

// Example 2: Initially Expanded
export const ExpandedExample: React.FC = () => {
  const sessionId = 'your-session-uuid';

  return (
    <div>
      <TodoList
        sessionId={sessionId}
        initialCollapsed={false} // Initially expanded
      />
    </div>
  );
};

// Example 3: Integration with Chat Interface
export const ChatPageIntegration: React.FC = () => {
  const [currentSessionId] = useState<string>('');
  const [messages] = useState<any[]>([]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      {/* Top: TodoList */}
      {currentSessionId && (
        <TodoList
          sessionId={currentSessionId}
          initialCollapsed={true}
        />
      )}

      {/* Middle: Chat Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
        {messages.map((_msg, idx) => (
          <div key={idx}>{/* Message content */}</div>
        ))}
      </div>

      {/* Bottom: Input Box */}
      <div style={{ padding: 16, borderTop: '1px solid #e0e0e0' }}>
        <input type="text" placeholder="Enter message..." />
      </div>
    </div>
  );
};

// Example 4: Sidebar Mode (Fixed Display)
export const SidebarModeExample: React.FC = () => {
  const sessionId = 'your-session-uuid';

  return (
    <div style={{ display: 'flex', height: '100vh' }}>
      {/* Left: TodoList */}
      <div style={{ width: 320, padding: 16, borderRight: '1px solid #e0e0e0' }}>
        <h3>Task Progress</h3>
        <TodoList
          sessionId={sessionId}
          initialCollapsed={false}
        />
      </div>

      {/* Right: Chat Content */}
      <div style={{ flex: 1, padding: 16 }}>{/* Chat content */}</div>
    </div>
  );
};

// Example 5: Custom Styled Wrapper
export const CustomStyledExample: React.FC = () => {
  const sessionId = 'your-session-uuid';

  return (
    <div
      style={{
        maxWidth: 800,
        margin: '0 auto',
        padding: 20,
      }}
    >
      <div
        style={{
          background: '#f0f7ff',
          borderRadius: 12,
          padding: 16,
          marginBottom: 20,
        }}
      >
        <h3 style={{ marginTop: 0 }}>Current Tasks</h3>
        <TodoList sessionId={sessionId} />
      </div>
    </div>
  );
};

export default ChatPageIntegration;

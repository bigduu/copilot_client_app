import { describe, it, expect } from 'vitest';
import { transformMessageDTOToMessage } from '../messageTransformers';

describe('messageTransformers - Tool Result Image Fix', () => {
  it('should handle tool messages with image reference content like "#2"', () => {
    const dto = {
      id: 'test-message-1',
      role: 'tool',
      content: [
        {
          type: 'image',
          url: '#2'
        }
      ],
      created_at: '2025-01-01T00:00:00Z'
    };

    const result = transformMessageDTOToMessage(dto);

    expect(result.role).toBe('assistant');
    expect(result.type).toBe('text');
    expect(result.content).toBe('[Tool Result]\nTool executed successfully (result content not available in message format)');
  });

  it('should handle tool messages with "[Image #2]" content', () => {
    const dto = {
      id: 'test-message-2',
      role: 'tool',
      content: [
        {
          type: 'image',
          url: '[Image #2]'
        }
      ],
      created_at: '2025-01-01T00:00:00Z'
    };

    const result = transformMessageDTOToMessage(dto);

    expect(result.role).toBe('assistant');
    expect(result.type).toBe('text');
    expect(result.content).toBe('[Tool Result]\nTool executed successfully (result content not available in message format)');
  });

  it('should extract tool result from tool_result field when available', () => {
    const dto = {
      id: 'test-message-3',
      role: 'tool',
      content: [
        {
          type: 'image',
          url: '#2'
        }
      ],
      tool_result: {
        result: {
          content: 'Actual tool result content here',
          status: 'success'
        }
      },
      created_at: '2025-01-01T00:00:00Z'
    };

    const result = transformMessageDTOToMessage(dto);

    expect(result.role).toBe('assistant');
    expect(result.type).toBe('tool_result'); // When tool_result is present, it becomes a tool_result type message
    expect(result.result).toBeDefined();
    expect(result.result.result).toBe('{\n  "content": "Actual tool result content here",\n  "status": "success"\n}');
  });

  it('should handle normal text tool content without modification', () => {
    const dto = {
      id: 'test-message-4',
      role: 'tool',
      content: [
        {
          type: 'text',
          text: 'Normal tool execution result'
        }
      ],
      created_at: '2025-01-01T00:00:00Z'
    };

    const result = transformMessageDTOToMessage(dto);

    expect(result.role).toBe('assistant');
    expect(result.type).toBe('text');
    expect(result.content).toBe('[Tool Result]\nNormal tool execution result');
  });

  it('should handle mixed content with text and image references', () => {
    const dto = {
      id: 'test-message-5',
      role: 'tool',
      content: [
        {
          type: 'text',
          text: 'Some result'
        },
        {
          type: 'image',
          url: '#2'
        }
      ],
      created_at: '2025-01-01T00:00:00Z'
    };

    const result = transformMessageDTOToMessage(dto);

    expect(result.role).toBe('assistant');
    expect(result.type).toBe('text');
    // Since the baseContent includes both text and image URL, it shouldn't trigger the fallback
    expect(result.content).toBe('[Tool Result]\nSome result\n#2');
  });
});
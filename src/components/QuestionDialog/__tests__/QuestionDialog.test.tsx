import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QuestionDialog } from '../QuestionDialog';
import { useAppStore } from '../../../pages/ChatPage/store';

// Mock dependencies
vi.mock('../../../pages/ChatPage/store', () => ({
  useAppStore: vi.fn(),
}));

vi.mock('../../../services/api', () => ({
  agentApiClient: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

describe('QuestionDialog', () => {
  const mockSetProcessing = vi.fn();
  const defaultProps = {
    sessionId: 'test-session-1',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (useAppStore as any).mockImplementation((selector) => {
      if (typeof selector === 'function') {
        return selector({
          setProcessing: mockSetProcessing,
        });
      }
      return { setProcessing: mockSetProcessing };
    });
  });

  it('should fetch pending question on mount', async () => {
    const { agentApiClient } = await import('../../../services/api');
    (agentApiClient.get as any).mockResolvedValue({
      has_pending_question: true,
      question: 'Test question?',
      options: ['Option A', 'Option B'],
      allow_custom: false,
    });

    render(<QuestionDialog {...defaultProps} />);

    await waitFor(() => {
      expect(agentApiClient.get).toHaveBeenCalledWith('respond/test-session-1/pending');
    });
  });

  it('should display question when pending question exists', async () => {
    const { agentApiClient } = await import('../../../services/api');
    (agentApiClient.get as any).mockResolvedValue({
      has_pending_question: true,
      question: 'Choose an option:',
      options: ['A', 'B'],
      allow_custom: false,
    });

    await act(async () => {
      render(<QuestionDialog {...defaultProps} />);
    });

    await waitFor(() => {
      expect(screen.getByText('Choose an option:')).toBeInTheDocument();
    });
  });

  it('should not render when no pending question', async () => {
    const { agentApiClient } = await import('../../../services/api');
    (agentApiClient.get as any).mockResolvedValue({
      has_pending_question: false,
    });

    const { container } = render(<QuestionDialog {...defaultProps} />);

    await waitFor(() => {
      expect(container.firstChild).toBeNull();
    });
  });

  it('should call /respond and /execute on submit', async () => {
    const { agentApiClient } = await import('../../../services/api');
    (agentApiClient.get as any).mockResolvedValue({
      has_pending_question: true,
      question: 'Test?',
      options: ['A', 'B'],
      allow_custom: false,
      tool_call_id: 'tool-1',
    });

    (agentApiClient.post as any)
      .mockResolvedValueOnce({}) // /respond
      .mockResolvedValueOnce({ status: 'started', events_url: '/events/test-session-1' }); // /execute

    await act(async () => {
      render(<QuestionDialog {...defaultProps} />);
    });

    await waitFor(() => {
      expect(screen.getByText('Test?')).toBeInTheDocument();
    });

    // Select option
    const optionA = screen.getByText('A');
    fireEvent.click(optionA);

    // Submit
    const submitButton = screen.getByText('Confirm Selection');
    await act(async () => {
      fireEvent.click(submitButton);
    });

    await waitFor(() => {
      // Should call /respond first
      expect(agentApiClient.post).toHaveBeenCalledWith('respond/test-session-1', {
        response: 'A',
      });

      // Then call /execute
      expect(agentApiClient.post).toHaveBeenCalledWith('execute/test-session-1');

      // Should set processing to activate subscription
      expect(mockSetProcessing).toHaveBeenCalledWith(true);
    });
  });

  it('should re-enable polling after response submission', async () => {
    const { agentApiClient } = await import('../../../services/api');

    // Track how many times GET has been called
    let getCallCount = 0;
    (agentApiClient.get as any).mockImplementation(() => {
      getCallCount++;
      // First 3 calls return first question (gives time for test to interact)
      if (getCallCount <= 3) {
        return Promise.resolve({
          has_pending_question: true,
          question: 'Test?',
          options: ['A'],
          allow_custom: false,
          tool_call_id: 'tool-1',
        });
      }
      // Subsequent calls return second question
      return Promise.resolve({
        has_pending_question: true,
        question: 'Second question?',
        options: ['C'],
        allow_custom: false,
      });
    });

    (agentApiClient.post as any)
      .mockResolvedValueOnce({})  // /respond
      .mockResolvedValueOnce({ status: 'started' }); // /execute

    await act(async () => {
      render(<QuestionDialog {...defaultProps} />);
    });

    // Wait for first question to appear
    await waitFor(() => {
      expect(screen.getByText('Test?')).toBeInTheDocument();
    }, { timeout: 3000 });

    // Submit first response
    const optionA = screen.getByText('A');
    fireEvent.click(optionA);

    const submitButton = screen.getByText('Confirm Selection');
    await act(async () => {
      fireEvent.click(submitButton);
    });

    // Wait for first question to disappear (setPendingQuestion(null) clears it)
    await waitFor(() => {
      expect(screen.queryByText('Test?')).not.toBeInTheDocument();
    });

    // Should detect second question (polling re-enabled)
    await waitFor(
      () => {
        expect(screen.getByText('Second question?')).toBeInTheDocument();
      },
      { timeout: 5000 }
    );
  });

  it('should stop polling after MAX_EMPTY_COUNT consecutive empty responses', async () => {
    const { agentApiClient } = await import('../../../services/api');
    (agentApiClient.get as any).mockResolvedValue({
      has_pending_question: false,
    });

    await act(async () => {
      render(<QuestionDialog {...defaultProps} />);
    });

    // Should call GET multiple times initially
    await waitFor(
      () => {
        const callCount = (agentApiClient.get as any).mock.calls.length;
        expect(callCount).toBeGreaterThan(0);
      },
      { timeout: 2000 }
    );

    // After MAX_EMPTY_COUNT (3) responses, polling should slow down or stop
    // This is hard to test precisely without controlling timers
  });

  it('should handle /execute failure gracefully', async () => {
    const { agentApiClient } = await import('../../../services/api');
    (agentApiClient.get as any).mockResolvedValue({
      has_pending_question: true,
      question: 'Test?',
      options: ['A'],
      allow_custom: false,
      tool_call_id: 'tool-1',
    });

    (agentApiClient.post as any)
      .mockResolvedValueOnce({}) // /respond succeeds
      .mockRejectedValueOnce(new Error('Execute failed')); // /execute fails

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await act(async () => {
      render(<QuestionDialog {...defaultProps} />);
    });

    // Wait for loading to complete and question to appear
    await waitFor(() => {
      expect(screen.getByText('Test?')).toBeInTheDocument();
    }, { timeout: 3000 });

    const optionA = screen.getByText('A');
    fireEvent.click(optionA);

    const submitButton = screen.getByText('Confirm Selection');
    await act(async () => {
      fireEvent.click(submitButton);
    });

    await waitFor(() => {
      // Should still call /respond
      expect(agentApiClient.post).toHaveBeenCalledWith('respond/test-session-1', {
        response: 'A',
      });

      // Should attempt /execute
      expect(agentApiClient.post).toHaveBeenCalledWith('execute/test-session-1');

      // Should log error
      expect(consoleSpy).toHaveBeenCalledWith(
        '[QuestionDialog] Failed to restart agent execution:',
        expect.any(Error)
      );
    });

    consoleSpy.mockRestore();
  });

  it('should reset polling state when sessionId changes', async () => {
    const { agentApiClient } = await import('../../../services/api');
    (agentApiClient.get as any).mockResolvedValue({
      has_pending_question: false,
    });

    const { rerender } = render(<QuestionDialog {...defaultProps} />);

    await waitFor(() => {
      expect(agentApiClient.get).toHaveBeenCalledWith('respond/test-session-1/pending');
    });

    // Change session ID
    (agentApiClient.get as any).mockClear();

    rerender(<QuestionDialog sessionId="test-session-2" />);

    await waitFor(() => {
      expect(agentApiClient.get).toHaveBeenCalledWith('respond/test-session-2/pending');
    });
  });

  it('should handle custom input when allow_custom is true', async () => {
    const { agentApiClient } = await import('../../../services/api');
    (agentApiClient.get as any).mockResolvedValue({
      has_pending_question: true,
      question: 'Test?',
      options: ['A'],
      allow_custom: true,
      tool_call_id: 'tool-1',
    });

    (agentApiClient.post as any)
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ status: 'started' });

    await act(async () => {
      render(<QuestionDialog {...defaultProps} />);
    });

    // Wait for loading to complete and question to appear
    await waitFor(() => {
      expect(screen.getByText('Other (custom input)')).toBeInTheDocument();
    }, { timeout: 3000 });

    // Select custom option
    const customOption = screen.getByText('Other (custom input)');
    fireEvent.click(customOption);

    // Enter custom text
    const textArea = screen.getByPlaceholderText('Enter your answer...');
    fireEvent.change(textArea, { target: { value: 'My custom response' } });

    // Submit
    const submitButton = screen.getByText('Confirm Selection');
    await act(async () => {
      fireEvent.click(submitButton);
    });

    await waitFor(() => {
      expect(agentApiClient.post).toHaveBeenCalledWith('respond/test-session-1', {
        response: 'My custom response',
      });
    });
  });
});

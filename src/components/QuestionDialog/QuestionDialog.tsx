import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Button, Card, Input, Radio, Space, Typography, message } from 'antd';
import { agentApiClient } from '../../services/api';
import { useAppStore } from '../../pages/ChatPage/store';
import styles from './QuestionDialog.module.css';

const { Text, Title } = Typography;

export interface PendingQuestion {
  has_pending_question: boolean;
  question?: string;
  options?: string[];
  allow_custom?: boolean;
  tool_call_id?: string;
}

interface QuestionDialogProps {
  sessionId: string;
  onResponseSubmitted?: () => void;
}

export const QuestionDialog: React.FC<QuestionDialogProps> = ({
  sessionId,
  onResponseSubmitted,
}) => {
  const [pendingQuestion, setPendingQuestion] = useState<PendingQuestion | null>(null);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [customInput, setCustomInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [pollingEnabled, setPollingEnabled] = useState(true); // Use state instead of ref
  const emptyCountRef = useRef(0);
  const MAX_EMPTY_COUNT = 3; // Stop polling after 3 consecutive empty responses

  const setProcessing = useAppStore((state) => state.setProcessing);

  // Fetch pending question
  const fetchPendingQuestion = useCallback(async () => {
    try {
      const data = await agentApiClient.get<PendingQuestion>(`respond/${sessionId}/pending`);
      if (data.has_pending_question) {
        setPendingQuestion(data);
        emptyCountRef.current = 0; // Reset counter when we have a question
      } else {
        setPendingQuestion(null);
        emptyCountRef.current += 1;

        // Stop polling after reaching threshold
        if (emptyCountRef.current >= MAX_EMPTY_COUNT) {
          setPollingEnabled(false);
        }
      }
    } catch (err) {
      // Handle 404 - no pending question for this session
      if (err instanceof Error && err.message.includes('404')) {
        setPendingQuestion(null);
        emptyCountRef.current += 1;

        // Stop polling after reaching threshold
        if (emptyCountRef.current >= MAX_EMPTY_COUNT) {
          setPollingEnabled(false);
        }
        return;
      }
      console.error('Failed to fetch pending question:', err);
    } finally {
      setIsLoading(false);
    }
  }, [sessionId]);

  // Reset polling when session changes
  useEffect(() => {
    emptyCountRef.current = 0;
    setPollingEnabled(true);
    setIsLoading(true);
  }, [sessionId]);

  // Poll for pending question periodically
  const pollInterval = pendingQuestion?.has_pending_question ? 3000 : 15000;

  useEffect(() => {
    // Don't poll if polling is disabled
    if (!pollingEnabled) {
      return;
    }

    fetchPendingQuestion();

    const interval = setInterval(() => {
      if (!isSubmitting && pollingEnabled) {
        fetchPendingQuestion();
      }
    }, pollInterval);

    return () => clearInterval(interval);
  }, [fetchPendingQuestion, isSubmitting, pollInterval, pollingEnabled]);

  // Submit response
  const handleSubmit = async () => {
    const response = selectedOption === 'custom' ? customInput.trim() : selectedOption;

    if (!response) {
      message.warning('Please select an option or enter a custom answer');
      return;
    }

    setIsSubmitting(true);

    try {
      // Step 1: Submit response to backend
      await agentApiClient.post(`respond/${sessionId}`, { response });

      message.success('Response submitted, AI will continue processing');
      setPendingQuestion(null);
      setSelectedOption(null);
      setCustomInput('');
      emptyCountRef.current = 0; // Reset counter to resume polling
      setPollingEnabled(true); // Re-enable polling in case it was stopped

      // Step 2: Restart agent execution
      try {
        const executeResult = await agentApiClient.post<{ status: string; events_url: string }>(`execute/${sessionId}`);
        console.log('[QuestionDialog] Agent execution restarted:', executeResult.status);

        // Set processing flag to activate event subscription
        if (['started', 'already_running'].includes(executeResult.status)) {
          setProcessing(true);
        }
      } catch (execError) {
        console.error('[QuestionDialog] Failed to restart agent execution:', execError);
        // Don't show error to user - response was saved successfully
        // Agent may resume on next interaction
      }

      // Notify parent (optional)
      onResponseSubmitted?.();
    } catch (err) {
      console.error('Failed to submit response:', err);
      message.error(err instanceof Error ? err.message : 'Submission failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading || !pendingQuestion?.has_pending_question) {
    return null;
  }

  const { question, options, allow_custom } = pendingQuestion;

  return (
    <Card className={styles.questionCard} bordered={true}>
      <div className={styles.questionHeader}>
        <Title level={5} className={styles.questionTitle}>
          🤔 AI Needs Your Decision
        </Title>
      </div>

      <div className={styles.questionContent}>
        <Text className={styles.questionText}>{question}</Text>

        <Radio.Group
          className={styles.optionsGroup}
          value={selectedOption}
          onChange={(e) => setSelectedOption(e.target.value)}
        >
          <Space direction="vertical" style={{ width: '100%' }}>
            {options?.map((option, index) => (
              <Radio key={index} value={option} className={styles.optionItem}>
                <Text>{option}</Text>
              </Radio>
            ))}

            {allow_custom && (
              <Radio value="custom" className={styles.optionItem}>
                <div className={styles.customOption}>
                  <Text>Other (custom input)</Text>
                  {selectedOption === 'custom' && (
                    <Input.TextArea
                      className={styles.customInput}
                      placeholder="Enter your answer..."
                      value={customInput}
                      onChange={(e) => setCustomInput(e.target.value)}
                      rows={2}
                      autoFocus
                    />
                  )}
                </div>
              </Radio>
            )}
          </Space>
        </Radio.Group>
      </div>

      <div className={styles.questionFooter}>
        <Button
          type="primary"
          onClick={handleSubmit}
          loading={isSubmitting}
          disabled={!selectedOption || (selectedOption === 'custom' && !customInput.trim())}
        >
          Confirm Selection
        </Button>
      </div>
    </Card>
  );
};

export default QuestionDialog;

import React, { useEffect, useState, useCallback } from 'react';
import { Button, Card, Input, Radio, Space, Typography, message } from 'antd';
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
  apiBaseUrl: string;
  onResponseSubmitted?: () => void;
}

export const QuestionDialog: React.FC<QuestionDialogProps> = ({
  sessionId,
  apiBaseUrl,
  onResponseSubmitted,
}) => {
  const [pendingQuestion, setPendingQuestion] = useState<PendingQuestion | null>(null);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [customInput, setCustomInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch pending question
  const fetchPendingQuestion = useCallback(async () => {
    try {
      const response = await fetch(`${apiBaseUrl}/api/v1/respond/${sessionId}/pending`);
      if (!response.ok) {
        if (response.status === 404) {
          setPendingQuestion(null);
          return;
        }
        throw new Error(`HTTP ${response.status}`);
      }
      const data: PendingQuestion = await response.json();
      if (data.has_pending_question) {
        setPendingQuestion(data);
      } else {
        setPendingQuestion(null);
      }
    } catch (err) {
      console.error('Failed to fetch pending question:', err);
    } finally {
      setIsLoading(false);
    }
  }, [sessionId, apiBaseUrl]);

  // Poll for pending question periodically
  useEffect(() => {
    fetchPendingQuestion();

    const interval = setInterval(() => {
      if (!isSubmitting) {
        fetchPendingQuestion();
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [fetchPendingQuestion, isSubmitting]);

  // Submit response
  const handleSubmit = async () => {
    const response = selectedOption === 'custom' ? customInput.trim() : selectedOption;

    if (!response) {
      message.warning('Please select an option or enter a custom answer');
      return;
    }

    setIsSubmitting(true);

    try {
      const res = await fetch(`${apiBaseUrl}/api/v1/respond/${sessionId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ response }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.message || errorData.error || `HTTP ${res.status}`);
      }

      message.success('Response submitted, AI will continue processing');
      setPendingQuestion(null);
      setSelectedOption(null);
      setCustomInput('');
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

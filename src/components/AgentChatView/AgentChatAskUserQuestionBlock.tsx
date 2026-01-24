import React, { useCallback, useMemo, useState } from "react";
import {
  Button,
  Card,
  Checkbox,
  Flex,
  Input,
  Radio,
  Space,
  Tag,
  Typography,
  theme,
} from "antd";

import type { ClaudeContentPart } from "../ClaudeStream";

const { Text } = Typography;

type AskUserQuestionOption = {
  label?: string;
  value?: string;
  description?: string;
};

type AskUserQuestionSpec = {
  id: string;
  header?: string;
  question?: string;
  multiSelect?: boolean;
  allowCustom?: boolean;
  options: AskUserQuestionOption[];
};

const parseAskUserQuestions = (input: any): AskUserQuestionSpec[] => {
  if (!input || typeof input !== "object") return [];
  const rawQuestions: any[] = Array.isArray(input.questions)
    ? input.questions
    : [input];
  const parsed = rawQuestions.map(
    (q: any, idx: number): AskUserQuestionSpec => {
      const options: AskUserQuestionOption[] = Array.isArray(q?.options)
        ? q.options.map((opt: any) => ({
            label: opt?.label ?? opt?.value ?? opt?.id ?? String(opt),
            value: opt?.value ?? opt?.label ?? opt?.id ?? String(opt),
            description: opt?.description,
          }))
        : [];
      return {
        id: String(q?.id ?? q?.key ?? idx),
        header: q?.header ?? q?.title,
        question: q?.question ?? q?.prompt,
        multiSelect: Boolean(q?.multiSelect ?? q?.multi_select),
        allowCustom: Boolean(q?.allowCustom ?? q?.allow_custom),
        options,
      };
    },
  );
  return parsed.filter((q) => q.options.length || q.question || q.header);
};

const buildAskUserPrompt = (
  toolUseId: string | undefined,
  questions: AskUserQuestionSpec[],
  answers: Record<string, string[]>,
  customAnswers: Record<string, string>,
): string => {
  const normalized = questions.map((q) => {
    const selected = answers[q.id] ?? [];
    const custom = customAnswers[q.id]?.trim();
    return {
      id: q.id,
      header: q.header,
      question: q.question,
      answers: custom ? [...selected, custom] : selected,
    };
  });
  if (questions.length === 1) {
    const only = normalized[0];
    if (only.answers.length === 1 && !only.question && !only.header) {
      return only.answers[0];
    }
  }
  return JSON.stringify(
    {
      tool: "AskUserQuestion",
      tool_use_id: toolUseId,
      responses: normalized,
    },
    null,
    2,
  );
};

export const AgentChatAskUserQuestionBlock: React.FC<{
  part: Extract<ClaudeContentPart, { type: "tool_use" }>;
  toolResult?: any;
  sessionId?: string;
  onAnswer?: (payload: { prompt: string; sessionId?: string }) => void;
  isRunning?: boolean;
}> = ({ part, toolResult, sessionId, onAnswer, isRunning }) => {
  const { token } = theme.useToken();
  const questions = useMemo(
    () => parseAskUserQuestions(part.input),
    [part.input],
  );
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const [customAnswers, setCustomAnswers] = useState<Record<string, string>>(
    {},
  );

  const hasResult = Boolean(toolResult);
  const disabled = hasResult || !onAnswer;

  const handleSingleSelect = useCallback((qid: string, value: string) => {
    setAnswers((prev) => ({ ...prev, [qid]: value ? [value] : [] }));
  }, []);

  const handleMultiSelect = useCallback((qid: string, values: string[]) => {
    setAnswers((prev) => ({ ...prev, [qid]: values }));
  }, []);

  const handleCustomChange = useCallback((qid: string, value: string) => {
    setCustomAnswers((prev) => ({ ...prev, [qid]: value }));
  }, []);

  const isSubmitDisabled = useMemo(() => {
    if (disabled || questions.length === 0) return true;
    return questions.every((q) => {
      const selected = answers[q.id]?.filter(Boolean) ?? [];
      const custom = customAnswers[q.id]?.trim();
      return selected.length === 0 && !custom;
    });
  }, [answers, customAnswers, disabled, questions]);

  const handleSubmit = useCallback(() => {
    if (!onAnswer) return;
    const prompt = buildAskUserPrompt(
      part.id,
      questions,
      answers,
      customAnswers,
    );
    onAnswer({ prompt, sessionId });
  }, [answers, customAnswers, onAnswer, part.id, questions, sessionId]);

  return (
    <Card size="small" styles={{ body: { padding: 12 } }}>
      <Flex vertical gap={12}>
        <Flex gap={8} align="center" wrap>
          <Tag color="purple">AskUserQuestion</Tag>
          {part.id ? <Text type="secondary">#{part.id}</Text> : null}
          {isRunning ? <Tag color="processing">Running</Tag> : null}
        </Flex>
        {questions.map((q) => {
          const values = answers[q.id] ?? [];
          return (
            <Card
              key={q.id}
              size="small"
              styles={{ body: { padding: 12 } }}
              style={{ background: token.colorBgLayout }}
            >
              <Flex vertical gap={8}>
                {q.header ? <Text strong>{q.header}</Text> : null}
                {q.question ? <Text>{q.question}</Text> : null}
                {q.multiSelect ? (
                  <Checkbox.Group
                    value={values}
                    onChange={(vals) =>
                      handleMultiSelect(q.id, vals as string[])
                    }
                    disabled={disabled}
                  >
                    <Space direction="vertical" style={{ width: "100%" }}>
                      {q.options.map((opt, idx) => {
                        const value = opt.value ?? opt.label ?? String(idx);
                        return (
                          <Checkbox key={value} value={value}>
                            <Flex vertical>
                              <Text strong>{opt.label ?? value}</Text>
                              {opt.description ? (
                                <Text type="secondary">{opt.description}</Text>
                              ) : null}
                            </Flex>
                          </Checkbox>
                        );
                      })}
                    </Space>
                  </Checkbox.Group>
                ) : (
                  <Radio.Group
                    value={values[0]}
                    onChange={(e) => handleSingleSelect(q.id, e.target.value)}
                    disabled={disabled}
                  >
                    <Space direction="vertical" style={{ width: "100%" }}>
                      {q.options.map((opt, idx) => {
                        const value = opt.value ?? opt.label ?? String(idx);
                        return (
                          <Radio key={value} value={value}>
                            <Flex vertical>
                              <Text strong>{opt.label ?? value}</Text>
                              {opt.description ? (
                                <Text type="secondary">{opt.description}</Text>
                              ) : null}
                            </Flex>
                          </Radio>
                        );
                      })}
                    </Space>
                  </Radio.Group>
                )}
                {q.allowCustom ? (
                  <Input.TextArea
                    value={customAnswers[q.id] ?? ""}
                    onChange={(e) => handleCustomChange(q.id, e.target.value)}
                    placeholder="Custom answer"
                    autoSize={{ minRows: 2, maxRows: 6 }}
                    disabled={disabled}
                  />
                ) : null}
              </Flex>
            </Card>
          );
        })}
        {hasResult ? (
          <Card size="small" styles={{ body: { padding: 10 } }}>
            <Text type="secondary">Answer submitted.</Text>
          </Card>
        ) : null}
        <Flex justify="flex-end">
          <Button
            type="primary"
            onClick={handleSubmit}
            disabled={isSubmitDisabled}
          >
            Submit Answer
          </Button>
        </Flex>
      </Flex>
    </Card>
  );
};

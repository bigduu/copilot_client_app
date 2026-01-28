import React, { useEffect } from "react";
import { Button, Form, Input, Radio, Select, Space, Switch, message } from "antd";
import { useAppStore } from "../../store";
import type { SkillDefinition } from "../../types/skill";

interface SkillEditorProps {
  skill: SkillDefinition | null;
  onClose: () => void;
  mode: "create" | "edit";
}

interface SkillFormValues {
  name: string;
  description: string;
  category: string;
  tags: string[];
  prompt: string;
  tool_refs: string[];
  workflow_refs: string[];
  visibility: "public" | "private";
  enabled_by_default: boolean;
}

const defaultValues: SkillFormValues = {
  name: "",
  description: "",
  category: "",
  tags: [],
  prompt: "",
  tool_refs: [],
  workflow_refs: [],
  visibility: "public",
  enabled_by_default: true,
};

export const SkillEditor: React.FC<SkillEditorProps> = ({ skill, onClose, mode }) => {
  const [form] = Form.useForm<SkillFormValues>();
  const createSkill = useAppStore((state) => state.createSkill);
  const updateSkill = useAppStore((state) => state.updateSkill);
  const loadAvailableTools = useAppStore((state) => state.loadAvailableTools);
  const loadAvailableWorkflows = useAppStore((state) => state.loadAvailableWorkflows);
  const availableTools = useAppStore((state) => state.availableTools);
  const availableWorkflows = useAppStore((state) => state.availableWorkflows);
  const isLoadingSkills = useAppStore((state) => state.isLoadingSkills);

  useEffect(() => {
    loadAvailableTools();
    loadAvailableWorkflows();
  }, [loadAvailableTools, loadAvailableWorkflows]);

  useEffect(() => {
    if (skill) {
      form.setFieldsValue({
        name: skill.name,
        description: skill.description,
        category: skill.category,
        tags: skill.tags,
        prompt: skill.prompt,
        tool_refs: skill.tool_refs,
        workflow_refs: skill.workflow_refs,
        visibility: skill.visibility,
        enabled_by_default: skill.enabled_by_default,
      });
      return;
    }

    form.setFieldsValue(defaultValues);
  }, [form, skill]);

  const handleFinish = async (values: SkillFormValues) => {
    if (mode === "edit" && !skill) {
      message.error("No skill selected");
      return;
    }

    if (mode === "edit" && skill) {
      await updateSkill(skill.id, {
        name: values.name,
        description: values.description,
        category: values.category,
        tags: values.tags,
        prompt: values.prompt,
        tool_refs: values.tool_refs,
        workflow_refs: values.workflow_refs,
        visibility: values.visibility,
        enabled_by_default: values.enabled_by_default,
      });

      if (!useAppStore.getState().skillsError) {
        message.success("Skill updated");
        onClose();
      }
      return;
    }

    await createSkill({
      name: values.name,
      description: values.description,
      category: values.category,
      tags: values.tags,
      prompt: values.prompt,
      tool_refs: values.tool_refs,
      workflow_refs: values.workflow_refs,
      visibility: values.visibility,
      enabled_by_default: values.enabled_by_default,
    });

    if (!useAppStore.getState().skillsError) {
      message.success("Skill created");
      onClose();
    }
  };

  return (
    <Form
      form={form}
      layout="vertical"
      onFinish={handleFinish}
      initialValues={defaultValues}
    >
      <Form.Item
        name="name"
        label="Name"
        rules={[{ required: true, message: "Please enter a skill name" }]}
      >
        <Input placeholder="Skill name" />
      </Form.Item>

      <Form.Item
        name="description"
        label="Description"
        rules={[{ required: true, message: "Please enter a description" }]}
      >
        <Input.TextArea rows={3} placeholder="What does this skill do?" />
      </Form.Item>

      <Form.Item
        name="category"
        label="Category"
        rules={[{ required: true, message: "Please enter a category" }]}
      >
        <Input placeholder="e.g. analysis, development" />
      </Form.Item>

      <Form.Item name="tags" label="Tags">
        <Select
          mode="tags"
          placeholder="Add tags"
          tokenSeparators={[","]}
        />
      </Form.Item>

      <Form.Item
        name="prompt"
        label="Prompt"
        rules={[{ required: true, message: "Please enter a prompt" }]}
      >
        <Input.TextArea rows={8} placeholder="Skill prompt guidance" />
      </Form.Item>

      <Form.Item name="tool_refs" label="Tools">
        <Select
          mode="multiple"
          placeholder="Select tools"
          options={availableTools.map((tool) => ({ value: tool, label: tool }))}
          optionFilterProp="label"
        />
      </Form.Item>

      <Form.Item name="workflow_refs" label="Workflows">
        <Select
          mode="multiple"
          placeholder="Select workflows"
          options={availableWorkflows.map((workflow) => ({
            value: workflow,
            label: workflow,
          }))}
          optionFilterProp="label"
        />
      </Form.Item>

      <Form.Item name="visibility" label="Visibility">
        <Radio.Group>
          <Radio value="public">Public</Radio>
          <Radio value="private">Private</Radio>
        </Radio.Group>
      </Form.Item>

      <Form.Item
        name="enabled_by_default"
        label="Enabled by default"
        valuePropName="checked"
      >
        <Switch />
      </Form.Item>

      <Form.Item>
        <Space style={{ display: "flex", justifyContent: "flex-end" }}>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="primary" htmlType="submit" loading={isLoadingSkills}>
            {mode === "edit" ? "Update Skill" : "Create Skill"}
          </Button>
        </Space>
      </Form.Item>
    </Form>
  );
};

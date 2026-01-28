import { useState, useEffect } from "react";
import {
  Button,
  Card,
  Input,
  List,
  Modal,
  Form,
  Select,
  Switch,
  Tag,
  message,
  Spin,
  Empty,
  Row,
  Col,
} from "antd";
import {
  EditOutlined,
  DeleteOutlined,
  PlusOutlined,
  SearchOutlined,
} from "@ant-design/icons";
import { useAppStore } from "../../store";
import type { SkillDefinition, SkillFilter } from "../../types/skill";
import { SkillCard } from "./SkillCard";
import { SkillEditor } from "./SkillEditor";

const { Option } = Select;

export const SkillManager = () => {
  // State from store
  const skills = useAppStore((state) => state.skills);
  const enabledSkillIds = useAppStore((state) => state.enabledSkillIds);
  const isLoadingSkills = useAppStore((state) => state.isLoadingSkills);
  const skillsError = useAppStore((state) => state.skillsError);
  const selectedSkill = useAppStore((state) => state.selectedSkill);

  // Actions from store
  const loadSkills = useAppStore((state) => state.loadSkills);
  const enableSkill = useAppStore((state) => state.enableSkill);
  const disableSkill = useAppStore((state) => state.disableSkill);
  const deleteSkill = useAppStore((state) => state.deleteSkill);
  const setSelectedSkill = useAppStore((state) => state.setSelectedSkill);
  const clearSkillsError = useAppStore((state) => state.clearSkillsError);

  // Local state
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | undefined>(
    undefined
  );
  const [showEnabledOnly, setShowEnabledOnly] = useState(false);

  // Load skills on mount
  useEffect(() => {
    loadSkills();
  }, [loadSkills]);

  // Show error message
  useEffect(() => {
    if (skillsError) {
      message.error(skillsError);
      clearSkillsError();
    }
  }, [skillsError, clearSkillsError]);

  // Get unique categories
  const categories = Array.from(
    new Set(skills.map((skill) => skill.category))
  ).sort();

  // Filter skills
  const filteredSkills = skills.filter((skill) => {
    // Search filter
    if (
      searchQuery &&
      !skill.name.toLowerCase().includes(searchQuery.toLowerCase()) &&
      !skill.description.toLowerCase().includes(searchQuery.toLowerCase())
    ) {
      return false;
    }

    // Category filter
    if (selectedCategory && skill.category !== selectedCategory) {
      return false;
    }

    // Enabled only filter
    if (showEnabledOnly && !enabledSkillIds.includes(skill.id)) {
      return false;
    }

    return true;
  });

  // Handle enable/disable toggle
  const handleToggleEnable = async (skillId: string, enabled: boolean) => {
    try {
      if (enabled) {
        await enableSkill(skillId);
        message.success("Skill enabled");
      } else {
        await disableSkill(skillId);
        message.success("Skill disabled");
      }
    } catch (error) {
      message.error("Failed to toggle skill");
    }
  };

  // Handle delete
  const handleDelete = async (skillId: string) => {
    try {
      await deleteSkill(skillId);
      message.success("Skill deleted");
    } catch (error) {
      message.error("Failed to delete skill");
    }
  };

  // Handle edit
  const handleEdit = (skill: SkillDefinition) => {
    setSelectedSkill(skill);
    setIsEditorOpen(true);
  };

  // Handle create new
  const handleCreate = () => {
    setSelectedSkill(null);
    setIsEditorOpen(true);
  };

  // Close editor
  const handleCloseEditor = () => {
    setIsEditorOpen(false);
    setSelectedSkill(null);
  };

  return (
    <div style={{ padding: "24px" }}>
      <Card
        title="Skill Manager"
        extra={
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={handleCreate}
          >
            New Skill
          </Button>
        }
      >
        {/* Filters */}
        <Row gutter={[16, 16]} style={{ marginBottom: "24px" }}>
          <Col xs={24} sm={12} md={8}>
            <Input
              placeholder="Search skills..."
              prefix={<SearchOutlined />}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              allowClear
            />
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Select
              placeholder="Filter by category"
              value={selectedCategory}
              onChange={setSelectedCategory}
              style={{ width: "100%" }}
              allowClear
            >
              {categories.map((category) => (
                <Option key={category} value={category}>
                  {category}
                </Option>
              ))}
            </Select>
          </Col>
          <Col xs={24} sm={24} md={6}>
            <Switch
              checked={showEnabledOnly}
              onChange={setShowEnabledOnly}
              checkedChildren="Enabled only"
              unCheckedChildren="Show all"
            />
          </Col>
        </Row>

        {/* Skills Grid */}
        <Spin spinning={isLoadingSkills}>
          {filteredSkills.length === 0 ? (
            <Empty
              description={
                searchQuery || selectedCategory || showEnabledOnly
                  ? "No skills match your filters"
                  : "No skills found. Create your first skill!"
              }
            />
          ) : (
            <List
              grid={{
                gutter: 16,
                xs: 1,
                sm: 2,
                md: 3,
                lg: 3,
                xl: 4,
              }}
              dataSource={filteredSkills}
              renderItem={(skill) => (
                <List.Item>
                  <SkillCard
                    skill={skill}
                    isEnabled={enabledSkillIds.includes(skill.id)}
                    onToggleEnable={(enabled) =>
                      handleToggleEnable(skill.id, enabled)
                    }
                    onEdit={() => handleEdit(skill)}
                    onDelete={() => handleDelete(skill.id)}
                  />
                </List.Item>
              )}
            />
          )}
        </Spin>
      </Card>

      {/* Editor Modal */}
      <Modal
        title={selectedSkill ? "Edit Skill" : "Create Skill"}
        open={isEditorOpen}
        onCancel={handleCloseEditor}
        footer={null}
        width={800}
        destroyOnClose
      >
        <SkillEditor
          skill={selectedSkill}
          onClose={handleCloseEditor}
          mode={selectedSkill ? "edit" : "create"}
        />
      </Modal>
    </div>
  );
};

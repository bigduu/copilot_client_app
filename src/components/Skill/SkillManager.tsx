import { useState, useEffect } from "react";
import {
  Card,
  Input,
  List,
  Select,
  Switch,
  message,
  Spin,
  Empty,
  Row,
  Col,
} from "antd";
import { SearchOutlined } from "@ant-design/icons";
import { useAppStore } from "../../pages/ChatPage/store";
import { SkillCard } from "./SkillCard";

const { Option } = Select;

export const SkillManager = () => {
  // State from store
  const skills = useAppStore((state) => state.skills);
  const isLoadingSkills = useAppStore((state) => state.isLoadingSkills);
  const skillsError = useAppStore((state) => state.skillsError);

  // Actions from store
  const loadSkills = useAppStore((state) => state.loadSkills);
  const clearSkillsError = useAppStore((state) => state.clearSkillsError);

  // Local state
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
    if (showEnabledOnly && !skill.enabled_by_default) {
      return false;
    }

    return true;
  });

  return (
    <div style={{ padding: "24px" }}>
      <Card title="Skill Manager">
        <div style={{ marginBottom: "16px", color: "#8c8c8c" }}>
          Skills are read-only. Edit `~/.bodhi/skills/*.md` and reload to apply changes.
        </div>
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
                  : "No skills found. Add Markdown skills in ~/.bodhi/skills"
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
                  />
                </List.Item>
              )}
            />
          )}
        </Spin>
      </Card>
    </div>
  );
};

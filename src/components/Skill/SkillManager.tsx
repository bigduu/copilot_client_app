import { useState, useEffect, useCallback } from "react";
import {
  Card,
  Input,
  List,
  Select,
  message,
  Spin,
  Empty,
  Row,
  Col,
  Button,
} from "antd";
import { SearchOutlined, ReloadOutlined } from "@ant-design/icons";
import { useAppStore } from "../../pages/ChatPage/store";
import { SkillCard } from "./SkillCard";

const { Option } = Select;

// Refresh interval in milliseconds (30 seconds)
const REFRESH_INTERVAL = 30000;

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
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  // Load skills on mount and periodically (with refresh from disk)
  useEffect(() => {
    loadSkills(undefined, true);

    // Set up periodic refresh
    const intervalId = setInterval(() => {
      loadSkills(undefined, true);
      setLastRefresh(new Date());
    }, REFRESH_INTERVAL);

    return () => clearInterval(intervalId);
  }, [loadSkills]);

  // Refresh when window regains focus
  useEffect(() => {
    const handleFocus = () => {
      loadSkills(undefined, true);
      setLastRefresh(new Date());
    };

    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [loadSkills]);

  // Manual refresh handler
  const handleRefresh = useCallback(async () => {
    await loadSkills(undefined, true);
    setLastRefresh(new Date());
    message.success("Skills refreshed");
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

    return true;
  });

  // Format last refresh time
  const formatLastRefresh = () => {
    const now = new Date();
    const diff = now.getTime() - lastRefresh.getTime();
    const seconds = Math.floor(diff / 1000);

    if (seconds < 5) return "just now";
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    return lastRefresh.toLocaleTimeString();
  };

  return (
    <div style={{ padding: "24px" }}>
      <Card
        title={
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <span>Skill Manager</span>
            <Button
              icon={<ReloadOutlined spin={isLoadingSkills} />}
              onClick={handleRefresh}
              loading={isLoadingSkills}
              size="small"
            >
              Refresh
            </Button>
            <span style={{ fontSize: "12px", color: "#8c8c8c", marginLeft: "auto" }}>
              Last updated: {formatLastRefresh()}
            </span>
          </div>
        }
      >
        <div style={{ marginBottom: "16px", color: "#8c8c8c" }}>
          Skills are read-only. Edit `~/.bodhi/skills/&lt;skill-name&gt;/SKILL.md` and refresh to apply changes. Auto-refresh every 30s.
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
        </Row>

        {/* Skills Grid */}
        <Spin spinning={isLoadingSkills}>
          {filteredSkills.length === 0 ? (
            <Empty
              description={
                searchQuery || selectedCategory
                  ? "No skills match your filters"
                  : "No skills found. Add skill folders in ~/.bodhi/skills"
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

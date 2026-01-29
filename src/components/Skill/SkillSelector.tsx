import React, { useEffect, useMemo } from "react";
import { Select, Space, Tag } from "antd";
import { useAppStore } from "../../pages/ChatPage/store";

interface SkillSelectorProps {
  selectedSkillIds: string[];
  onChange: (skillIds: string[]) => void;
  chatId?: string;
}

export const SkillSelector: React.FC<SkillSelectorProps> = ({
  selectedSkillIds,
  onChange,
}) => {
  const skills = useAppStore((state) => state.skills);
  const enabledSkillIds = useAppStore((state) => state.enabledSkillIds);
  const isLoadingSkills = useAppStore((state) => state.isLoadingSkills);
  const loadSkills = useAppStore((state) => state.loadSkills);

  useEffect(() => {
    if (skills.length === 0) {
      loadSkills();
    }
  }, [skills.length, loadSkills]);

  const options = useMemo(
    () =>
      skills.map((skill) => {
        const isEnabled = enabledSkillIds.includes(skill.id);
        return {
          value: skill.id,
          label: (
            <Space size="small">
              <span>{skill.name}</span>
              <Tag color={isEnabled ? "green" : "default"}>
                {isEnabled ? "Enabled" : "Disabled"}
              </Tag>
            </Space>
          ),
          searchText: [
            skill.name,
            skill.description,
            skill.category,
            ...skill.tags,
          ]
            .join(" ")
            .toLowerCase(),
        };
      }),
    [skills, enabledSkillIds],
  );

  return (
    <Select
      mode="multiple"
      placeholder="Select skills"
      value={selectedSkillIds}
      onChange={onChange}
      options={options}
      loading={isLoadingSkills}
      style={{ width: "100%" }}
      filterOption={(input, option) =>
        (option as { searchText?: string })?.searchText?.includes(
          input.toLowerCase(),
        ) ?? false
      }
      allowClear
    />
  );
};

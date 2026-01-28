import React from "react";
import { Drawer, Tabs } from "antd";

import { TimelinePanel } from "../AgentTools/TimelinePanel";
import { SlashCommandsPanel } from "../AgentTools/SlashCommandsPanel";
import { PreviewPanel } from "../AgentTools/PreviewPanel";
import { ClaudeInstallPanel } from "../ClaudeInstallPanel";

export type AgentToolsDrawerProps = {
  open: boolean;
  activeTab: string;
  onClose: () => void;
  onTabChange: (value: string) => void;
  sessionId: string | null;
  projectId: string;
  projectPath: string | null;
};

export const AgentToolsDrawer: React.FC<AgentToolsDrawerProps> = ({
  open,
  activeTab,
  onClose,
  onTabChange,
  sessionId,
  projectId,
  projectPath,
}) => {
  return (
    <Drawer
      title="Session Tools"
      placement="right"
      width={520}
      onClose={onClose}
      open={open}
    >
      <Tabs
        activeKey={activeTab}
        onChange={onTabChange}
        items={[
          {
            key: "timeline",
            label: "Timeline",
            children: (
              <TimelinePanel
                sessionId={sessionId}
                projectId={projectId}
                projectPath={projectPath}
              />
            ),
          },
          {
            key: "slash",
            label: "Slash Commands",
            children: <SlashCommandsPanel projectPath={projectPath} />,
          },
          {
            key: "preview",
            label: "Preview",
            children: <PreviewPanel />,
          },
          {
            key: "installer",
            label: "Installer",
            children: <ClaudeInstallPanel projectPath={projectPath} />,
          },
        ]}
      />
    </Drawer>
  );
};

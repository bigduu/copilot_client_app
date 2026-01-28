import React from "react";
import { Button, Empty, Flex, List, Space, Spin, Typography } from "antd";
import {
  FolderOutlined,
  HistoryOutlined,
  HomeOutlined,
} from "@ant-design/icons";
import type { PathSuggestion } from "../../services/WorkspaceApiService";

const { Text } = Typography;

interface WorkspacePickerSuggestionsListProps {
  show: boolean;
  isLoading: boolean;
  suggestions: PathSuggestion[];
  onSelect: (path: string) => void;
  token: any;
}

const getSuggestionIcon = (suggestion: PathSuggestion, token: any) => {
  switch (suggestion.suggestion_type) {
    case "home":
      return <HomeOutlined style={{ color: token.colorPrimary }} />;
    case "documents":
    case "desktop":
    case "downloads":
      return <FolderOutlined style={{ color: token.colorSuccess }} />;
    case "recent":
      return <HistoryOutlined style={{ color: token.colorWarning }} />;
    default:
      return <FolderOutlined />;
  }
};

const WorkspacePickerSuggestionsList: React.FC<
  WorkspacePickerSuggestionsListProps
> = ({ show, isLoading, suggestions, onSelect, token }) => {
  if (!show) return null;

  return (
    <Flex vertical gap={token.marginXS} style={{ marginTop: token.marginMD }}>
      <Space>
        <FolderOutlined />
        <Text strong>建议的工作区</Text>
      </Space>

      {isLoading ? (
        <Flex justify="center" style={{ padding: token.paddingSM }}>
          <Spin size="small" />
        </Flex>
      ) : suggestions.length === 0 ? (
        <Empty
          description="暂无建议"
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          style={{ padding: token.paddingSM }}
        />
      ) : (
        <List
          size="small"
          dataSource={suggestions}
          renderItem={(suggestion) => (
            <List.Item style={{ padding: 0 }}>
              <Button
                type="text"
                onClick={() => onSelect(suggestion.path)}
                style={{
                  width: "100%",
                  textAlign: "left",
                  padding: `${token.paddingXS}px ${token.paddingSM}px`,
                }}
              >
                <Space>
                  {getSuggestionIcon(suggestion, token)}
                  <Space direction="vertical" size={0}>
                    <Text strong>{suggestion.name}</Text>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {suggestion.path}
                    </Text>
                  </Space>
                </Space>
              </Button>
            </List.Item>
          )}
        />
      )}
    </Flex>
  );
};

export default WorkspacePickerSuggestionsList;

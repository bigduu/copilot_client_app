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
      <Space style={{ paddingInline: token.paddingSM }}>
        <FolderOutlined />
        <Text strong>Suggested Workspaces</Text>
      </Space>

      {isLoading ? (
        <Flex justify="center" style={{ padding: token.paddingSM }}>
          <Spin size="small" />
        </Flex>
      ) : suggestions.length === 0 ? (
        <Empty
          description="No suggestions available"
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          style={{ padding: token.paddingSM }}
        />
      ) : (
        <List
          size="small"
          dataSource={suggestions}
          style={{ paddingInline: token.paddingSM }}
          renderItem={(suggestion) => (
            <List.Item style={{ padding: 0 }}>
              <Button
                type="text"
                onClick={() => onSelect(suggestion.path)}
                style={{
                  width: "100%",
                  textAlign: "left",
                  padding: `${token.paddingXS}px 0`,
                  height: "auto",
                }}
              >
                <Flex justify="space-between" align="center" style={{ width: "100%" }}>
                  <Space>
                    {getSuggestionIcon(suggestion, token)}
                    <Text strong>{suggestion.name}</Text>
                  </Space>
                  <Text
                    type="secondary"
                    ellipsis={{ tooltip: suggestion.path }}
                    style={{
                      fontSize: 12,
                      maxWidth: "55%",
                      textAlign: "right",
                    }}
                  >
                    {suggestion.path}
                  </Text>
                </Flex>
              </Button>
            </List.Item>
          )}
        />
      )}
    </Flex>
  );
};

export default WorkspacePickerSuggestionsList;

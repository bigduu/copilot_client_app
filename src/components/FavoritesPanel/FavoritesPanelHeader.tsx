import React from "react";
import {
  Button,
  Dropdown,
  Flex,
  Select,
  Space,
  Tooltip,
  Typography,
} from "antd";
import {
  BookOutlined,
  ExportOutlined,
  FileTextOutlined,
  SortAscendingOutlined,
  SortDescendingOutlined,
} from "@ant-design/icons";

const { Title } = Typography;
const { Option } = Select;

interface FavoritesPanelHeaderProps {
  token: any;
  screens: Record<string, boolean>;
  sortField: "createdAt" | "role";
  sortOrder: "descending" | "ascending";
  onSortFieldChange: (value: "createdAt" | "role") => void;
  onSortOrderToggle: () => void;
  onExport: (format: "markdown" | "pdf") => void;
  onSummarize: () => void;
  onCollapse: () => void;
  isExporting: boolean;
  isSummarizing: boolean;
  hasFavorites: boolean;
}

const FavoritesPanelHeader: React.FC<FavoritesPanelHeaderProps> = ({
  token,
  screens,
  sortField,
  sortOrder,
  onSortFieldChange,
  onSortOrderToggle,
  onExport,
  onSummarize,
  onCollapse,
  isExporting,
  isSummarizing,
  hasFavorites,
}) => {
  return (
    <Flex
      justify="space-between"
      align="center"
      style={{ marginBottom: token.marginMD }}
    >
      <Title level={4} style={{ margin: 0 }}>
        Favorites
      </Title>
      <Space size="small">
        <Tooltip title="Summarize">
          <Button
            icon={<FileTextOutlined />}
            onClick={onSummarize}
            size="small"
            type="primary"
            disabled={!hasFavorites}
            loading={isSummarizing}
          />
        </Tooltip>
        <Space.Compact>
          <Select
            value={sortField}
            onChange={(value) => onSortFieldChange(value)}
            size="small"
            style={{ width: screens.xs ? 80 : 100 }}
          >
            <Option value="createdAt">Date</Option>
            <Option value="role">Role</Option>
          </Select>
          <Button
            icon={
              sortOrder === "descending" ? (
                <SortDescendingOutlined />
              ) : (
                <SortAscendingOutlined />
              )
            }
            onClick={onSortOrderToggle}
            size="small"
            type="default"
          />
        </Space.Compact>
        <Dropdown
          menu={{
            items: [
              {
                key: "markdown",
                label: "Export as Markdown",
                onClick: () => onExport("markdown"),
              },
              {
                key: "pdf",
                label: "Export as PDF",
                onClick: () => onExport("pdf"),
              },
            ],
          }}
          placement="bottomRight"
        >
          <Button
            icon={<ExportOutlined />}
            size="small"
            type="text"
            loading={isExporting}
            disabled={!hasFavorites}
          />
        </Dropdown>
        <Button
          icon={<BookOutlined />}
          onClick={onCollapse}
          size="small"
          type="text"
        />
      </Space>
    </Flex>
  );
};

export default FavoritesPanelHeader;

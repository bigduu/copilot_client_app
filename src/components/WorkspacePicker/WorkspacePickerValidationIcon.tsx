import React from "react";
import {
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  LoadingOutlined,
} from "@ant-design/icons";
import type { WorkspaceValidationResult } from "../../utils/workspaceValidator";

interface WorkspacePickerValidationIconProps {
  isValidating: boolean;
  result: WorkspaceValidationResult | null;
  token: any;
}

const WorkspacePickerValidationIcon: React.FC<
  WorkspacePickerValidationIconProps
> = ({ isValidating, result, token }) => {
  if (isValidating) {
    return <LoadingOutlined style={{ color: token.colorPrimary }} />;
  }

  if (result) {
    if (result.is_valid) {
      return <CheckCircleOutlined style={{ color: token.colorSuccess }} />;
    }
    return <ExclamationCircleOutlined style={{ color: token.colorError }} />;
  }

  return null;
};

export default WorkspacePickerValidationIcon;

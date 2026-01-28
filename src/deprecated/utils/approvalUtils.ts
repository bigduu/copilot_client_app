import { ApprovalData } from "../../pages/ChatPage/components/MessageCard/ApprovalCard";

/**
 * Check if a message content is an approval request format
 */
export function isApprovalRequest(content: string): boolean {
  try {
    const parsed = JSON.parse(content.trim());
    return (
      typeof parsed === "object" &&
      parsed !== null &&
      typeof parsed.tool_call === "string" &&
      Array.isArray(parsed.parameters) &&
      (parsed.approval === undefined || typeof parsed.approval === "boolean")
    );
  } catch {
    return false;
  }
}

/**
 * Parse approval request from message content
 */
export function parseApprovalRequest(content: string): ApprovalData | null {
  try {
    const parsed = JSON.parse(content.trim());

    if (!isApprovalRequest(content)) {
      return null;
    }

    // Ensure parameters have the correct structure
    const parameters = parsed.parameters.map((param: any) => {
      if (typeof param === "object" && param.name && param.value) {
        return {
          name: param.name,
          value: param.value,
        };
      }
      // Handle simple string parameters
      if (typeof param === "string") {
        return {
          name: "value",
          value: param,
        };
      }
      return {
        name: "unknown",
        value: String(param),
      };
    });

    return {
      tool_call: parsed.tool_call,
      parameters,
      approval: parsed.approval,
    };
  } catch {
    return null;
  }
}

/**
 * Create approval request JSON string
 */
export function createApprovalRequest(
  toolCall: string,
  parameters: Array<{ name: string; value: string }>,
  approval?: boolean,
): string {
  const data: ApprovalData = {
    tool_call: toolCall,
    parameters,
  };

  if (approval !== undefined) {
    data.approval = approval;
  }

  return JSON.stringify(data, null, 2);
}

/**
 * Create approved request
 */
export function createApprovedRequest(approvalData: ApprovalData): string {
  return createApprovalRequest(
    approvalData.tool_call,
    approvalData.parameters,
    true,
  );
}

/**
 * Create rejected request
 */
export function createRejectedRequest(approvalData: ApprovalData): string {
  return createApprovalRequest(
    approvalData.tool_call,
    approvalData.parameters,
    false,
  );
}

import React from "react";
import { Card, Flex, Typography } from "antd";

const { Text } = Typography;

export const renderTreeNodes = (
  nodes: Array<{ name: string; type: string; children: any[] }>,
  level = 0,
): React.ReactNode => {
  return nodes.map((node, idx) => (
    <div
      key={`${node.name}-${level}-${idx}`}
      style={{ marginLeft: level * 16 }}
    >
      <Flex align="center" gap={6}>
        <Text code>{node.type === "directory" ? "dir" : "file"}</Text>
        <Text style={{ fontFamily: "monospace" }}>{node.name}</Text>
      </Flex>
      {node.children.length ? renderTreeNodes(node.children, level + 1) : null}
    </div>
  ));
};

export const NumberedCodeBlock: React.FC<{
  code: string;
  startLine: number;
  header?: React.ReactNode;
}> = ({ code, startLine, header }) => {
  const lines = code.split("\n");
  return (
    <Card size="small" styles={{ body: { padding: 0 } }}>
      {header ? (
        <div style={{ padding: "8px 12px", borderBottom: "1px solid #303030" }}>
          {header}
        </div>
      ) : null}
      <div style={{ maxHeight: 440, overflow: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <tbody>
            {lines.map((line, idx) => (
              <tr key={`${idx}-${line}`}>
                <td
                  style={{
                    width: 56,
                    textAlign: "right",
                    padding: "0 12px",
                    opacity: 0.6,
                    fontSize: 12,
                    fontFamily: "monospace",
                  }}
                >
                  {startLine + idx}
                </td>
                <td
                  style={{
                    padding: "0 12px",
                    fontSize: 12,
                    fontFamily: "monospace",
                    whiteSpace: "pre",
                  }}
                >
                  {line}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
};

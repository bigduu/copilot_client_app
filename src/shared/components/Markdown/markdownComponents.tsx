import { Card, Typography } from "antd";
import type { Components } from "react-markdown";
import { renderCodeBlock } from "./MarkdownCodeBlock";

const { Text } = Typography;

export const createMarkdownComponents = (
  token: any,
  options?: {
    onFixMermaid?: (chart: string) => Promise<void> | void;
  },
): Components => ({
  p: ({ children }) => (
    <Text
      style={{
        marginBottom: token.marginSM,
        display: "block",
      }}
    >
      {children}
    </Text>
  ),

  ol: ({ children }) => (
    <ol
      style={{
        marginBottom: token.marginSM,
        paddingLeft: 20,
      }}
    >
      {children}
    </ol>
  ),

  ul: ({ children }) => (
    <ul
      style={{
        marginBottom: token.marginSM,
        paddingLeft: 20,
      }}
    >
      {children}
    </ul>
  ),

  li: ({ children }) => (
    <li
      style={{
        marginBottom: token.marginXS,
      }}
    >
      {children}
    </li>
  ),

  code({ className, children, inline, ...props }: any) {
    const match = /language-([^\s]+)/i.exec(className || "");
    const language = match ? match[1] : "";
    const isInline = inline ?? (!match && !className);

    const codeString = children ? String(children).replace(/\n$/, "") : "";

    if (isInline) {
      return (
        <Text code className={className} {...props}>
          {children}
        </Text>
      );
    }

    if (!codeString.trim()) {
      return null;
    }

    return renderCodeBlock(language, codeString, token, options?.onFixMermaid);
  },

  blockquote: ({ children }) => (
    <Card
      size="small"
      styles={{ body: { padding: `${token.paddingXS}px ${token.padding}px` } }}
      style={{
        borderLeft: `3px solid ${token.colorPrimary}`,
        background: token.colorPrimaryBg,
        margin: `${token.marginXS}px 0`,
        color: token.colorTextSecondary,
        fontStyle: "italic",
      }}
    >
      {children}
    </Card>
  ),

  a: ({ children, href }) => (
    <Text
      style={{ color: token.colorLink }}
      onClick={() => href && window.open(href, "_blank", "noopener,noreferrer")}
    >
      {children}
    </Text>
  ),

  table: ({ children }) => (
    <Card
      size="small"
      styles={{ body: { padding: 0 } }}
      style={{ overflow: "auto", margin: `${token.marginSM}px 0` }}
    >
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          border: `1px solid ${token.colorBorder}`,
        }}
      >
        {children}
      </table>
    </Card>
  ),

  thead: ({ children }) => (
    <thead style={{ backgroundColor: token.colorBgContainer }}>
      {children}
    </thead>
  ),

  tbody: ({ children }) => <tbody>{children}</tbody>,

  tr: ({ children }) => (
    <tr style={{ borderBottom: `1px solid ${token.colorBorder}` }}>
      {children}
    </tr>
  ),

  th: ({ children }) => (
    <th
      style={{
        padding: `${token.paddingXS}px ${token.paddingSM}px`,
        textAlign: "left",
        fontWeight: "bold",
        borderRight: `1px solid ${token.colorBorder}`,
      }}
    >
      {children}
    </th>
  ),

  td: ({ children }) => (
    <td
      style={{
        padding: `${token.paddingXS}px ${token.paddingSM}px`,
        borderRight: `1px solid ${token.colorBorder}`,
      }}
    >
      {children}
    </td>
  ),

  input: ({ type, checked, disabled }) => {
    if (type === "checkbox") {
      return (
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          style={{
            marginRight: token.marginXS,
            accentColor: token.colorPrimary,
          }}
          readOnly
        />
      );
    }
    return <input type={type} checked={checked} disabled={disabled} />;
  },
});

export default createMarkdownComponents;

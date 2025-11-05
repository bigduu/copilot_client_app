import React, { useState } from "react";
import { Typography, Button, message } from "antd";
import { CopyOutlined } from "@ant-design/icons";
import { Components } from "react-markdown";
import { PrismLight as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";

// Import only commonly used languages for better performance
import javascript from "react-syntax-highlighter/dist/esm/languages/prism/javascript";
import typescript from "react-syntax-highlighter/dist/esm/languages/prism/typescript";
import python from "react-syntax-highlighter/dist/esm/languages/prism/python";
import json from "react-syntax-highlighter/dist/esm/languages/prism/json";
import bash from "react-syntax-highlighter/dist/esm/languages/prism/bash";
import css from "react-syntax-highlighter/dist/esm/languages/prism/css";
import html from "react-syntax-highlighter/dist/esm/languages/prism/markup";
import sql from "react-syntax-highlighter/dist/esm/languages/prism/sql";
import yaml from "react-syntax-highlighter/dist/esm/languages/prism/yaml";
import markdown from "react-syntax-highlighter/dist/esm/languages/prism/markdown";

import { MermaidChart } from "../MermaidChart";

const { Text } = Typography;

// Register languages with PrismLight for better performance
SyntaxHighlighter.registerLanguage("javascript", javascript);
SyntaxHighlighter.registerLanguage("js", javascript);
SyntaxHighlighter.registerLanguage("typescript", typescript);
SyntaxHighlighter.registerLanguage("ts", typescript);
SyntaxHighlighter.registerLanguage("python", python);
SyntaxHighlighter.registerLanguage("py", python);
SyntaxHighlighter.registerLanguage("json", json);
SyntaxHighlighter.registerLanguage("bash", bash);
SyntaxHighlighter.registerLanguage("shell", bash);
SyntaxHighlighter.registerLanguage("sh", bash);
SyntaxHighlighter.registerLanguage("css", css);
SyntaxHighlighter.registerLanguage("html", html);
SyntaxHighlighter.registerLanguage("xml", html);
SyntaxHighlighter.registerLanguage("sql", sql);
SyntaxHighlighter.registerLanguage("yaml", yaml);
SyntaxHighlighter.registerLanguage("yml", yaml);
SyntaxHighlighter.registerLanguage("markdown", markdown);
SyntaxHighlighter.registerLanguage("md", markdown);

// Create theme-aware syntax highlighting
const getSyntaxTheme = () => {
  // For now, use the original oneDark theme to ensure highlighting works
  // TODO: Integrate with Ant Design theme properly
  return oneDark;
};

// List of registered languages for PrismLight
const registeredLanguages = [
  "javascript",
  "js",
  "typescript",
  "ts",
  "python",
  "py",
  "json",
  "bash",
  "shell",
  "sh",
  "css",
  "html",
  "xml",
  "sql",
  "yaml",
  "yml",
  "markdown",
  "md",
];

// Code block component with copy button
const CodeBlockWithCopy: React.FC<{
  language: string;
  codeString: string;
  token: any;
}> = ({ language, codeString, token }) => {
  const [isHovered, setIsHovered] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(codeString);
      message.success("Code copied to clipboard");
    } catch (error) {
      console.error("Copy failed:", error);
      message.error("Copy failed");
    }
  };

  // Check if language is supported
  const normalizedLanguage = language.toLowerCase();
  const isSupported = registeredLanguages.includes(normalizedLanguage);

  return (
    <div
      style={{
        position: "relative",
        maxWidth: "100%",
        overflow: "auto",
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <SyntaxHighlighter
        style={getSyntaxTheme()}
        language={isSupported ? normalizedLanguage : "text"}
        PreTag="div"
        customStyle={{
          margin: `${token.marginXS}px 0`,
          borderRadius: token.borderRadiusSM,
          fontSize: token.fontSizeSM,
          maxWidth: "100%",
          paddingRight: "50px", // Make space for copy button
        }}
        showLineNumbers={codeString.split("\n").length > 10}
        wrapLines={true}
        wrapLongLines={true}
      >
        {codeString}
      </SyntaxHighlighter>

      {/* Copy button - only visible on hover */}
      {isHovered && (
        <Button
          type="text"
          size="small"
          icon={<CopyOutlined />}
          onClick={handleCopy}
          style={{
            position: "absolute",
            top: token.paddingSM,
            right: token.paddingSM,
            backgroundColor: "rgba(0, 0, 0, 0.6)",
            color: "white",
            border: "none",
            borderRadius: token.borderRadiusSM,
            opacity: 0.8,
            transition: "opacity 0.2s",
            zIndex: 10,
          }}
          onMouseEnter={(e) => {
            const target = e.currentTarget as HTMLElement;
            target.style.opacity = "1";
          }}
          onMouseLeave={(e) => {
            const target = e.currentTarget as HTMLElement;
            target.style.opacity = "0.8";
          }}
        />
      )}
    </div>
  );
};

// Enhanced code block renderer with error handling
const renderCodeBlock = (language: string, codeString: string, token: any) => {
  try {
    // Validate input
    if (!codeString || typeof codeString !== "string") {
      console.warn(
        "Invalid codeString provided to renderCodeBlock:",
        codeString,
      );
      return null;
    }

    // Handle Mermaid diagrams
    if (language === "mermaid") {
      // Additional validation for Mermaid content
      const trimmedChart = codeString.trim();
      if (!trimmedChart) {
        console.warn("Empty Mermaid chart content");
        return null;
      }
      return <MermaidChart chart={trimmedChart} />;
    }

    return (
      <CodeBlockWithCopy
        language={language}
        codeString={codeString}
        token={token}
      />
    );
  } catch (error) {
    console.warn("Syntax highlighting failed:", error);
    // Fallback to plain code block with copy functionality
    return (
      <div
        style={{
          position: "relative",
          margin: `${token.marginXS}px 0`,
        }}
        onMouseEnter={(e) => {
          const copyBtn = e.currentTarget.querySelector(
            ".fallback-copy-btn",
          ) as HTMLElement;
          if (copyBtn) copyBtn.style.display = "block";
        }}
        onMouseLeave={(e) => {
          const copyBtn = e.currentTarget.querySelector(
            ".fallback-copy-btn",
          ) as HTMLElement;
          if (copyBtn) copyBtn.style.display = "none";
        }}
      >
        <pre
          style={{
            backgroundColor: token.colorBgContainer,
            border: `1px solid ${token.colorBorder}`,
            padding: token.padding,
            borderRadius: token.borderRadiusSM,
            overflow: "auto",
            fontSize: token.fontSizeSM,
            paddingRight: "50px",
            margin: 0,
          }}
        >
          <code style={{ color: token.colorText }}>{codeString}</code>
        </pre>
        <Button
          type="text"
          size="small"
          icon={<CopyOutlined />}
          className="fallback-copy-btn"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(codeString);
              message.success("Code copied to clipboard");
            } catch (error) {
              console.error("Copy failed:", error);
              message.error("Copy failed");
            }
          }}
          style={{
            position: "absolute",
            top: token.paddingSM,
            right: token.paddingSM,
            backgroundColor: "rgba(0, 0, 0, 0.6)",
            color: "white",
            border: "none",
            borderRadius: token.borderRadiusSM,
            display: "none",
            zIndex: 10,
          }}
        />
      </div>
    );
  }
};

// Create markdown components factory
export const createMarkdownComponents = (token: any): Components => ({
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

  code({ className, children, ...props }) {
    const match = /language-(\w+)/.exec(className || "");
    const language = match ? match[1] : "";
    const isInline = !match && !className;

    // Safely handle children that might be undefined or null
    const codeString = children ? String(children).replace(/\n$/, "") : "";

    if (isInline) {
      return (
        <Text code className={className} {...props}>
          {children}
        </Text>
      );
    }

    // Don't render empty code blocks
    if (!codeString.trim()) {
      return null;
    }

    return renderCodeBlock(language, codeString, token);
  },

  blockquote: ({ children }) => (
    <div
      style={{
        borderLeft: `3px solid ${token.colorPrimary}`,
        background: token.colorPrimaryBg,
        padding: `${token.paddingXS}px ${token.padding}px`,
        margin: `${token.marginXS}px 0`,
        color: token.colorTextSecondary,
        fontStyle: "italic",
      }}
    >
      {children}
    </div>
  ),

  a: ({ children, href }) => (
    <Text
      style={{ color: token.colorLink }}
      onClick={() => href && window.open(href, "_blank", "noopener,noreferrer")}
    >
      {children}
    </Text>
  ),

  // Enhanced table support for better GFM compatibility
  table: ({ children }) => (
    <div style={{ overflow: "auto", margin: `${token.marginSM}px 0` }}>
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          border: `1px solid ${token.colorBorder}`,
        }}
      >
        {children}
      </table>
    </div>
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

  // Enhanced task list support
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

import React, { useMemo } from "react";
import { theme } from "antd";
import ReactMarkdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";

import { createMarkdownComponents } from "../../../../shared/components/Markdown/markdownComponents";

export const AgentChatMarkdown: React.FC<{ value: string }> = ({ value }) => {
  const { token } = theme.useToken();
  const components = useMemo(
    () => createMarkdownComponents(token, undefined),
    [token],
  );
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkBreaks]}
      rehypePlugins={[rehypeSanitize]}
      components={components}
    >
      {value}
    </ReactMarkdown>
  );
};

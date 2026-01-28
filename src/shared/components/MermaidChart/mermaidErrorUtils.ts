import { cleanupErrorCache, errorCache } from "./mermaidConfig";

export const formatMermaidError = (
  chart: string,
  chartKey: string,
  err: unknown,
) => {
  cleanupErrorCache();

  let errorMessage = "Failed to render Mermaid diagram";
  let detailedError = "";
  let specificSuggestion = "";

  if (err instanceof Error) {
    const fullMessage = err.message || "";
    console.log("🔍 Full error message:", fullMessage);

    if (
      chart.includes("[") &&
      chart.includes("(") &&
      chart.includes(")") &&
      chart.includes("]")
    ) {
      const bracketParenPattern = /\[([^[\]]*\([^)]*\)[^[\]]*)\]/g;
      const matches = chart.match(bracketParenPattern);
      if (matches) {
        errorMessage =
          "Bracket syntax error: parentheses inside square brackets";
        specificSuggestion = `Found: ${matches[0]}. Use either [Text] or (Text), never [Text (with parentheses)]`;
        detailedError = fullMessage;
      }
    }

    if (!specificSuggestion) {
      if (fullMessage.includes("Parse error on line")) {
        const lineMatch = fullMessage.match(/Parse error on line (\d+)/);
        const line = lineMatch ? lineMatch[1] : "unknown";
        errorMessage = `Syntax error on line ${line}`;

        const lines = chart.split("\n");
        const errorLine = lines[parseInt(line) - 1];
        if (
          errorLine &&
          errorLine.includes("[") &&
          errorLine.includes("(") &&
          errorLine.includes(")")
        ) {
          specificSuggestion =
            "Remove parentheses from inside square brackets. Use [Text] or (Text), not [Text (with parentheses)]";
        }

        detailedError = fullMessage;
      } else if (fullMessage.includes("Expecting")) {
        const expectingMatch = fullMessage.match(/Expecting (.+?)(?:\.|$)/);
        const expecting = expectingMatch ? expectingMatch[1] : "valid syntax";
        errorMessage = `Syntax error: expecting ${expecting}`;
        detailedError = fullMessage;
      } else if (fullMessage.includes("Lexical error")) {
        const lexMatch = fullMessage.match(/Lexical error on line (\d+)/);
        const line = lexMatch ? lexMatch[1] : "unknown";
        errorMessage = `Invalid character on line ${line}`;
        detailedError = fullMessage;
      } else if (fullMessage.includes("Unknown diagram type")) {
        const typeMatch = fullMessage.match(
          /Unknown diagram type[:\s]+(.+?)(?:\.|$)/,
        );
        const type = typeMatch ? typeMatch[1] : "unknown";
        errorMessage = `Unknown diagram type: ${type}`;
        detailedError = fullMessage;
      } else if (fullMessage.includes("Invalid Mermaid syntax")) {
        errorMessage = "Invalid Mermaid diagram syntax";
        detailedError = fullMessage;
      } else if (fullMessage.includes("Syntax error")) {
        errorMessage = "Mermaid syntax error - check diagram format";
        detailedError = fullMessage;
      } else if (fullMessage.includes("Parse error")) {
        errorMessage = "Mermaid parse error - invalid diagram structure";
        detailedError = fullMessage;
      } else if (fullMessage.trim()) {
        const cleanMessage = fullMessage
          .replace(/^Error:\s*/i, "")
          .replace(/\s+/g, " ")
          .trim();
        errorMessage = `Mermaid: ${cleanMessage.substring(0, 100)}${
          cleanMessage.length > 100 ? "..." : ""
        }`;
        detailedError = fullMessage;
      }
    }

    if (detailedError) {
      console.error("🔍 Detailed Mermaid error:", detailedError);
    }
    if (specificSuggestion) {
      console.error("💡 Suggestion:", specificSuggestion);
    }
  }

  const errorKey = `${chartKey.substring(0, 50)}-${errorMessage}`;
  const now = Date.now();
  const errorInfo = errorCache.get(errorKey) || {
    count: 0,
    lastSeen: 0,
  };
  errorInfo.count += 1;
  errorInfo.lastSeen = now;
  errorCache.set(errorKey, errorInfo);

  let finalErrorMessage = errorMessage;
  let finalSuggestion = specificSuggestion;

  if (errorInfo.count > 10) {
    finalErrorMessage = `Mermaid error (${errorInfo.count}x) - syntax validation failed`;
    finalSuggestion = "";
  } else if (errorInfo.count > 3) {
    finalErrorMessage = `${errorMessage} (repeated ${errorInfo.count}x)`;
  } else if (errorInfo.count > 1) {
    finalErrorMessage = `${errorMessage} (${errorInfo.count}x)`;
  }

  return finalSuggestion
    ? `${finalErrorMessage}\n\n💡 ${finalSuggestion}`
    : finalErrorMessage;
};

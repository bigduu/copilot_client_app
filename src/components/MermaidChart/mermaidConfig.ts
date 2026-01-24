import mermaid from "mermaid";

mermaid.initialize({
  startOnLoad: false,
  theme: "dark",
  securityLevel: "loose",
  suppressErrorRendering: true,
  fontSize: 16,
  flowchart: {
    useMaxWidth: false,
    htmlLabels: true,
    nodeSpacing: 15,
    rankSpacing: 30,
  },
  sequence: {
    useMaxWidth: false,
    actorMargin: 60,
    boxMargin: 10,
    messageMargin: 40,
  },
  gantt: {
    useMaxWidth: false,
    barHeight: 25,
    fontSize: 14,
  },
  journey: {
    useMaxWidth: false,
  },
  timeline: {
    useMaxWidth: false,
  },
  gitGraph: {
    useMaxWidth: false,
    showBranches: true,
    showCommitLabel: true,
  },
  c4: {
    useMaxWidth: false,
  },
  sankey: {
    useMaxWidth: false,
    width: 1000,
    height: 600,
  },
  xyChart: {
    useMaxWidth: false,
    width: 900,
    height: 600,
  },
  block: {
    useMaxWidth: false,
  },
});

mermaid.parseError = function (err) {
  console.warn("Mermaid parse error (handled gracefully):", err);
};

export const mermaidCache = new Map<
  string,
  { svg: string; height: number; svgWidth: number; svgHeight: number }
>();

export const errorCache = new Map<
  string,
  { count: number; lastSeen: number }
>();

export const normalizeMermaidChart = (chart: string): string => {
  return chart.replace(/\[([\s\S]*?)\]/g, (match, rawLabel) => {
    const label = String(rawLabel);
    const hasNewline = /\r?\n/.test(label);
    const hasParen = /[()]/.test(label);
    if (!hasNewline && !hasParen) {
      return match;
    }

    const trimmed = label.trim();
    const parensAreShape =
      trimmed.startsWith("(") && trimmed.endsWith(")") && trimmed.length >= 2;

    let nextLabel = label;
    if (hasNewline) {
      nextLabel = nextLabel.replace(/\r?\n/g, "<br/>");
    }
    if (hasParen && !parensAreShape) {
      nextLabel = nextLabel.replace(/\(/g, "&#40;").replace(/\)/g, "&#41;");
    }

    return nextLabel === label ? match : `[${nextLabel}]`;
  });
};

export const cleanupErrorCache = () => {
  const now = Date.now();
  const fiveMinutes = 5 * 60 * 1000;

  for (const [key, value] of errorCache.entries()) {
    if (now - value.lastSeen > fiveMinutes) {
      errorCache.delete(key);
    }
  }
};

export default mermaid;

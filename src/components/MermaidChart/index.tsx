import React, { useRef, useState, useEffect } from "react";
import { Button, theme } from "antd";
import mermaid from "mermaid";
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";

const { useToken } = theme;

// Initialize Mermaid with proper error handling
mermaid.initialize({
  startOnLoad: false,
  theme: "dark",
  securityLevel: "loose",
  suppressErrorRendering: true, // Prevent automatic error diagram insertion
  // Global font size for better visibility
  fontSize: 16,
  // Configure responsive behavior - disable useMaxWidth for better scaling
  flowchart: {
    useMaxWidth: false,
    htmlLabels: true,
    nodeSpacing: 15,
    rankSpacing: 30,
  },
  // Configure other diagram types for better scaling
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

// Set up custom error handler to prevent default error rendering
mermaid.parseError = function (err, _hash) {
  console.warn("Mermaid parse error (handled gracefully):", err);
  // Don't throw or display errors - let our component handle them
};

// Cache for rendered charts
const mermaidCache = new Map<
  string,
  {
    svg: string;
    height: number;
    svgWidth: number;
    svgHeight: number;
  }
>();

// Cache for error tracking to prevent duplicate error displays
const errorCache = new Map<string, { count: number; lastSeen: number }>();

const normalizeMermaidChart = (chart: string): string => {
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

// Clean up old error cache entries (older than 5 minutes)
const cleanupErrorCache = () => {
  const now = Date.now();
  const fiveMinutes = 5 * 60 * 1000;

  for (const [key, value] of errorCache.entries()) {
    if (now - value.lastSeen > fiveMinutes) {
      errorCache.delete(key);
    }
  }
};

export interface MermaidChartProps {
  chart: string;
  id?: string;
  className?: string;
  style?: React.CSSProperties;
  onFix?: (chart: string) => Promise<void> | void;
}

export const MermaidChart: React.FC<MermaidChartProps> = React.memo(
  ({ chart, id: _id, className, style, onFix }) => {
    const { token } = useToken();
    const chartKey = chart.trim();
    // Check cache during initialization
    const initialCached = mermaidCache.get(chartKey);
    const [isFixing, setIsFixing] = useState(false);
    const [fixError, setFixError] = useState("");

    const [renderState, setRenderState] = useState<{
      svg: string;
      height: number;
      svgWidth: number;
      svgHeight: number;
      error: string;
      isLoading: boolean;
    }>({
      svg: initialCached?.svg || "",
      height: initialCached?.height || 200,
      svgWidth: initialCached?.svgWidth || 800,
      svgHeight: initialCached?.svgHeight || 200,
      error: "",
      isLoading: !initialCached, // No loading needed if cached
    });

    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
      const cached = mermaidCache.get(chartKey);
      if (cached) {
        setRenderState({
          svg: cached.svg,
          height: cached.height,
          svgWidth: cached.svgWidth,
          svgHeight: cached.svgHeight,
          error: "",
          isLoading: false,
        });
        return;
      }

      setRenderState((prev) => ({
        ...prev,
        svg: "",
        height: 200,
        svgWidth: 800,
        svgHeight: 200,
        error: "",
        isLoading: true,
      }));
    }, [chartKey]);

    useEffect(() => {
      // Use cache directly if available
      if (initialCached) {
        console.log("✅ Using cached Mermaid chart");
        return;
      }

      // If current state is not loading, it means already rendered
      if (!renderState.isLoading) {
        console.log("⏭️ Skipping render - already rendered");
        return;
      }

      // Prevent duplicate renders by checking if we're already rendering this chart
      const renderKey = `${chartKey}-${Date.now()}`;
      console.log(
        "🚀 Starting Mermaid render for:",
        renderKey.substring(0, 50),
      );

      let isMounted = true;

      const renderChart = async () => {
        try {
          const normalizedChart = normalizeMermaidChart(chart);
          console.log(
            "🔍 Attempting to render Mermaid chart:",
            chart.substring(0, 100) + "...",
          );

          // First validate the syntax using mermaid.parse with detailed error reporting
          let parseResult;
          try {
            parseResult = await mermaid.parse(normalizedChart, {
              suppressErrors: false, // Enable detailed error reporting
            });
          } catch (parseError) {
            console.error("❌ Mermaid parse error details:", {
              error: parseError,
              message:
                parseError instanceof Error
                  ? parseError.message
                  : String(parseError),
              stack: parseError instanceof Error ? parseError.stack : undefined,
              chart:
                chart.substring(0, 200) + (chart.length > 200 ? "..." : ""),
            });
            throw parseError;
          }

          if (!parseResult) {
            const error = new Error(
              "Invalid Mermaid syntax - parse returned false",
            );
            console.error("❌ Parse result is false for chart:", chart);
            throw error;
          }

          console.log("✅ Mermaid parse successful, attempting render...");

          // Use unique ID to avoid conflicts
          const uniqueId = `mermaid-${Math.random()
            .toString(36)
            .substring(2, 11)}`;

          let renderedSvg;
          try {
            const renderResult = await mermaid.render(uniqueId, normalizedChart);
            renderedSvg = renderResult.svg;
            console.log("✅ Mermaid render successful");
          } catch (renderError) {
            console.error("❌ Mermaid render error details:", {
              error: renderError,
              message:
                renderError instanceof Error
                  ? renderError.message
                  : String(renderError),
              stack:
                renderError instanceof Error ? renderError.stack : undefined,
              uniqueId,
              chart:
                chart.substring(0, 200) + (chart.length > 200 ? "..." : ""),
            });
            throw renderError;
          }

          if (isMounted) {
            // Create temporary element to measure dimensions
            const tempDiv = document.createElement("div");
            tempDiv.style.position = "absolute";
            tempDiv.style.visibility = "hidden";
            tempDiv.style.width = "800px"; // Fixed width for measurement
            tempDiv.innerHTML = renderedSvg;
            document.body.appendChild(tempDiv);

            const svgElement = tempDiv.querySelector("svg");
            let finalHeight = 200; // Default height
            let svgWidth = 800; // Default width
            let svgHeight = 200; // Default SVG height

            if (svgElement) {
              // Get original SVG dimensions
              const rect = svgElement.getBoundingClientRect();
              svgWidth = rect.width;
              svgHeight = rect.height;
              finalHeight = Math.max(rect.height + 32, 200); // Minimum 200px
            }

            document.body.removeChild(tempDiv);

            // Cache the result
            mermaidCache.set(chartKey, {
              svg: renderedSvg,
              height: finalHeight,
              svgWidth,
              svgHeight,
            });

            setRenderState({
              svg: renderedSvg,
              height: finalHeight,
              svgWidth,
              svgHeight,
              error: "",
              isLoading: false,
            });
          }
        } catch (err) {
          console.error("❌ Mermaid rendering error:", {
            error: err,
            message: err instanceof Error ? err.message : String(err),
            stack: err instanceof Error ? err.stack : undefined,
            chart: chart.substring(0, 300) + (chart.length > 300 ? "..." : ""),
            chartLength: chart.length,
          });

          if (isMounted) {
            // Clean up old error cache entries periodically
            cleanupErrorCache();

            // Extract meaningful error message from Mermaid error with more detail
            let errorMessage = "Failed to render Mermaid diagram";
            let detailedError = "";
            let specificSuggestion = "";

            if (err instanceof Error) {
              const fullMessage = err.message || "";
              console.log("🔍 Full error message:", fullMessage);

              // Check for common bracket mixing errors first
              if (
                chart.includes("[") &&
                chart.includes("(") &&
                chart.includes(")") &&
                chart.includes("]")
              ) {
                // Check for parentheses inside square brackets pattern
                const bracketParenPattern = /\[([^[\]]*\([^)]*\)[^[\]]*)\]/g;
                const matches = chart.match(bracketParenPattern);
                if (matches) {
                  errorMessage =
                    "Bracket syntax error: parentheses inside square brackets";
                  specificSuggestion = `Found: ${matches[0]}. Use either [Text] or (Text), never [Text (with parentheses)]`;
                  detailedError = fullMessage;
                }
              }

              // If no specific bracket error found, check other error patterns
              if (!specificSuggestion) {
                if (fullMessage.includes("Parse error on line")) {
                  const lineMatch = fullMessage.match(
                    /Parse error on line (\d+)/,
                  );
                  const line = lineMatch ? lineMatch[1] : "unknown";
                  errorMessage = `Syntax error on line ${line}`;

                  // Check for common issues on that line
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
                  const expectingMatch = fullMessage.match(
                    /Expecting (.+?)(?:\.|$)/,
                  );
                  const expecting = expectingMatch
                    ? expectingMatch[1]
                    : "valid syntax";
                  errorMessage = `Syntax error: expecting ${expecting}`;
                  detailedError = fullMessage;
                } else if (fullMessage.includes("Lexical error")) {
                  const lexMatch = fullMessage.match(
                    /Lexical error on line (\d+)/,
                  );
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
                  errorMessage =
                    "Mermaid parse error - invalid diagram structure";
                  detailedError = fullMessage;
                } else if (fullMessage.trim()) {
                  // Use a cleaned version of the actual error message
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

              // Log the detailed error for debugging
              if (detailedError) {
                console.error("🔍 Detailed Mermaid error:", detailedError);
              }
              if (specificSuggestion) {
                console.error("💡 Suggestion:", specificSuggestion);
              }
            }

            // Track error frequency to prevent spam
            const errorKey = `${chartKey.substring(0, 50)}-${errorMessage}`;
            const now = Date.now();
            const errorInfo = errorCache.get(errorKey) || {
              count: 0,
              lastSeen: 0,
            };
            errorInfo.count += 1;
            errorInfo.lastSeen = now;
            errorCache.set(errorKey, errorInfo);

            // Rate limit: if too many errors in short time, show a simplified message
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

            // Combine error message with suggestion
            const combinedError = finalSuggestion
              ? `${finalErrorMessage}\n\n💡 ${finalSuggestion}`
              : finalErrorMessage;

            setRenderState((prev) => ({
              ...prev,
              error: combinedError,
              isLoading: false,
            }));
          }
        }
      };

      renderChart();

      return () => {
        isMounted = false;
        console.log("🧹 Cleaning up Mermaid render");
      };
    }, [chartKey, renderState.isLoading]); // Only re-render when chart content changes or loading state changes

    const { svg, height, svgWidth, error, isLoading } = renderState;

    // Calculate optimal initial scale - now that we've disabled useMaxWidth,
    // diagrams should render at their natural size, so we can use more conservative scaling
    const calculateInitialScale = () => {
      // Since we disabled useMaxWidth, diagrams will be larger by default
      // Use more conservative scaling
      if (svgWidth > 1200) {
        return 0.8; // Scale down very wide diagrams
      }

      if (svgWidth > 800) {
        return 1.0; // Normal scale for medium diagrams
      }

      // For smaller diagrams, scale up slightly
      return 1.2;
    };

    const initialScale = calculateInitialScale();

    const handleFix = async () => {
      if (!onFix || isFixing) return;
      setIsFixing(true);
      setFixError("");
      try {
        await onFix(chart);
      } catch (fixErr) {
        const message =
          fixErr instanceof Error ? fixErr.message : String(fixErr);
        setFixError(message || "Failed to fix Mermaid diagram");
      } finally {
        setIsFixing(false);
      }
    };

    if (error) {
      return (
        <div
          className={className}
          style={{
            color: token.colorError,
            padding: `${token.paddingXS}px ${token.paddingSM}px`,
            fontSize: token.fontSizeSM,
            background: token.colorErrorBg,
            borderRadius: token.borderRadiusSM,
            border: `1px solid ${token.colorErrorBorder}`,
            margin: `${token.marginXS}px 0`,
            minHeight: "60px", // Increased to show more error details
            maxHeight: "120px", // Allow more space for detailed errors
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-start",
            justifyContent: "flex-start",
            overflow: "auto", // Allow scrolling for long errors
            position: "relative",
            // Ensure the error doesn't break layout
            maxWidth: "100%",
            boxSizing: "border-box",
            ...style,
          }}
          title={`Mermaid Error: ${error}\n\nCheck browser console for detailed error information.`} // Show full error on hover
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              marginBottom: token.marginXXS,
            }}
          >
            <span
              style={{
                marginRight: token.marginXS,
                fontSize: "14px",
                flexShrink: 0,
                lineHeight: 1,
              }}
            >
              ⚠️
            </span>
            <span
              style={{
                fontWeight: 600,
                color: token.colorError,
              }}
            >
              Mermaid Diagram Error
            </span>
          </div>
          <div
            style={{
              fontSize: token.fontSizeSM,
              lineHeight: 1.4,
              wordBreak: "break-word",
              flex: 1,
              width: "100%",
            }}
          >
            {error.split("\n\n").map((part, index) => (
              <div
                key={index}
                style={{
                  marginBottom:
                    index < error.split("\n\n").length - 1 ? token.marginXS : 0,
                  ...(part.startsWith("💡")
                    ? {
                        backgroundColor: token.colorInfoBg,
                        border: `1px solid ${token.colorInfoBorder}`,
                        borderRadius: token.borderRadiusSM,
                        padding: token.paddingXS,
                        marginTop: token.marginXS,
                        color: token.colorInfo,
                        fontWeight: 500,
                      }
                    : {}),
                }}
              >
                {part}
              </div>
            ))}
          </div>
          {onFix && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: token.marginXS,
                marginTop: token.marginXS,
                width: "100%",
              }}
            >
              <Button
                size="small"
                type="primary"
                onClick={handleFix}
                loading={isFixing}
              >
                Fix Mermaid
              </Button>
              {fixError && (
                <span
                  style={{
                    color: token.colorError,
                    fontSize: token.fontSizeSM,
                    wordBreak: "break-word",
                    flex: 1,
                  }}
                >
                  {fixError}
                </span>
              )}
            </div>
          )}
          <div
            style={{
              fontSize: token.fontSizeSM,
              color: token.colorTextSecondary,
              marginTop: token.marginXS,
              fontStyle: "italic",
            }}
          >
            💡 Check browser console (F12) for detailed error information
          </div>
        </div>
      );
    }

    return (
      <div
        ref={containerRef}
        className={className}
        style={{
          textAlign: "center",
          margin: `${token.marginXS}px 0`,
          padding: token.padding,
          background: token.colorBgContainer,
          borderRadius: token.borderRadiusSM,
          border: `1px solid ${token.colorBorder}`,
          overflow: "hidden", // Hide overflow for zoom/pan
          height: `${Math.max(Math.min(height, 800), 400)}px`, // Better height range: 400-800px
          maxHeight: "80vh", // Prevent extremely tall diagrams
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
          // Performance optimization
          willChange: "auto",
          contain: "layout style paint",
          ...style,
        }}
      >
        {isLoading && (
          <div
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              color: token.colorTextSecondary,
              fontSize: token.fontSizeSM,
              zIndex: 2,
            }}
          >
            Rendering diagram...
          </div>
        )}
        <div
          style={{
            width: "100%",
            height: "100%",
            opacity: isLoading ? 0 : 1,
            position: "relative",
          }}
        >
          <TransformWrapper
            initialScale={initialScale}
            minScale={0.1}
            maxScale={10}
            centerOnInit={true}
            limitToBounds={false}
            wheel={{ step: 0.1 }}
            panning={{ disabled: false }}
            pinch={{ disabled: false }}
            doubleClick={{ disabled: false, mode: "zoomIn", step: 0.5 }}
          >
            {({ zoomIn, zoomOut, resetTransform }) => (
              <>
                {/* Zoom Controls */}
                <div
                  style={{
                    position: "absolute",
                    top: 8,
                    right: 8,
                    zIndex: 10,
                    display: "flex",
                    flexDirection: "column",
                    gap: 4,
                    background: token.colorBgContainer,
                    borderRadius: token.borderRadiusSM,
                    border: `1px solid ${token.colorBorder}`,
                    padding: 4,
                    boxShadow: token.boxShadowSecondary,
                  }}
                >
                  <Button
                    size="small"
                    type="text"
                    onClick={() => zoomIn()}
                    style={{ fontSize: 12, padding: "2px 6px" }}
                  >
                    +
                  </Button>
                  <Button
                    size="small"
                    type="text"
                    onClick={() => zoomOut()}
                    style={{ fontSize: 12, padding: "2px 6px" }}
                  >
                    -
                  </Button>
                  <Button
                    size="small"
                    type="text"
                    onClick={() => resetTransform()}
                    style={{ fontSize: 10, padding: "2px 6px" }}
                  >
                    ⌂
                  </Button>
                </div>

                {/* SVG Content */}
                <TransformComponent
                  wrapperStyle={{
                    width: "100%",
                    height: "100%",
                  }}
                  contentStyle={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: "100%",
                    height: "100%",
                  }}
                >
                  <div
                    style={{
                      display: "inline-block",
                      lineHeight: 0,
                    }}
                    dangerouslySetInnerHTML={{
                      __html: svg.replace(
                        /<svg([^>]*)>/,
                        '<svg$1 style="display: block; max-width: 100%; max-height: 100%;">',
                      ),
                    }}
                  />
                </TransformComponent>
              </>
            )}
          </TransformWrapper>
        </div>
      </div>
    );
  },
);

MermaidChart.displayName = "MermaidChart";

export default MermaidChart;

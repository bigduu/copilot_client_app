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
}

export const MermaidChart: React.FC<MermaidChartProps> = React.memo(
  ({ chart, id: _id, className, style }) => {
    const { token } = useToken();
    // Check cache during initialization
    const cacheKey = chart.trim();
    const initialCached = mermaidCache.get(cacheKey);

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
      // Use cache directly if available
      if (initialCached) {
        return;
      }

      // If current state is not loading, it means already rendered
      if (!renderState.isLoading) {
        return;
      }

      let isMounted = true;

      const renderChart = async () => {
        try {
          // First validate the syntax using mermaid.parse
          const parseResult = await mermaid.parse(chart, {
            suppressErrors: true,
          });
          if (!parseResult) {
            throw new Error("Invalid Mermaid syntax");
          }

          // Use unique ID to avoid conflicts
          const uniqueId = `mermaid-${Math.random()
            .toString(36)
            .substring(2, 11)}`;
          const { svg: renderedSvg } = await mermaid.render(uniqueId, chart);

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
            mermaidCache.set(chart.trim(), {
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
          console.error("Mermaid rendering error:", err);
          if (isMounted) {
            // Clean up old error cache entries periodically
            cleanupErrorCache();

            // Extract meaningful error message from Mermaid error
            let errorMessage = "Failed to render Mermaid diagram";
            if (err instanceof Error) {
              // Check for common Mermaid error patterns
              if (err.message.includes("Invalid Mermaid syntax")) {
                errorMessage = "Invalid Mermaid diagram syntax";
              } else if (err.message.includes("Syntax error")) {
                errorMessage = "Mermaid syntax error - check diagram format";
              } else if (err.message.includes("Parse error")) {
                errorMessage =
                  "Mermaid parse error - invalid diagram structure";
              } else if (err.message.includes("Lexical error")) {
                errorMessage = "Mermaid lexical error - invalid characters";
              } else if (err.message.includes("Unknown diagram type")) {
                errorMessage = "Unknown Mermaid diagram type";
              } else if (err.message.trim()) {
                // Use a cleaned version of the actual error message
                const cleanMessage = err.message
                  .replace(/^Error:\s*/i, "")
                  .replace(/\s+/g, " ")
                  .trim();
                errorMessage = `Mermaid: ${cleanMessage.substring(0, 80)}${
                  cleanMessage.length > 80 ? "..." : ""
                }`;
              }
            }

            // Track error frequency to prevent spam
            const errorKey = `${chart.substring(0, 50)}-${errorMessage}`;
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
            if (errorInfo.count > 10) {
              finalErrorMessage = `Mermaid error (${errorInfo.count}x) - syntax validation failed`;
            } else if (errorInfo.count > 3) {
              finalErrorMessage = `${errorMessage} (repeated ${errorInfo.count}x)`;
            } else if (errorInfo.count > 1) {
              finalErrorMessage = `${errorMessage} (${errorInfo.count}x)`;
            }

            setRenderState((prev) => ({
              ...prev,
              error: finalErrorMessage,
              isLoading: false,
            }));
          }
        }
      };

      renderChart();

      return () => {
        isMounted = false;
      };
    }, [chart, initialCached]);

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
            minHeight: "40px",
            maxHeight: "60px", // Reduced max height to be more compact
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-start",
            overflow: "hidden",
            position: "relative",
            // Ensure the error doesn't break layout
            maxWidth: "100%",
            boxSizing: "border-box",
            ...style,
          }}
          title={error} // Show full error on hover
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
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              flex: 1,
              minWidth: 0, // Allow text to shrink
            }}
          >
            {error}
          </span>
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
                        '<svg$1 style="display: block; max-width: 100%; max-height: 100%;">'
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
  }
);

MermaidChart.displayName = "MermaidChart";

export default MermaidChart;

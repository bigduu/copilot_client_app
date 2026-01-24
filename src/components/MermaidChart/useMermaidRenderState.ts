import { useEffect, useState } from "react";
import mermaid, { mermaidCache, normalizeMermaidChart } from "./mermaidConfig";
import { formatMermaidError } from "./mermaidErrorUtils";

export interface MermaidRenderState {
  svg: string;
  height: number;
  svgWidth: number;
  svgHeight: number;
  error: string;
  isLoading: boolean;
}

export const useMermaidRenderState = (chart: string) => {
  const chartKey = chart.trim();
  const initialCached = mermaidCache.get(chartKey);
  const [renderState, setRenderState] = useState<MermaidRenderState>({
    svg: initialCached?.svg || "",
    height: initialCached?.height || 200,
    svgWidth: initialCached?.svgWidth || 800,
    svgHeight: initialCached?.svgHeight || 200,
    error: "",
    isLoading: !initialCached,
  });

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
    if (mermaidCache.has(chartKey)) {
      console.log("✅ Using cached Mermaid chart");
      return;
    }

    if (!renderState.isLoading) {
      console.log("⏭️ Skipping render - already rendered");
      return;
    }

    let isMounted = true;

    const renderChart = async () => {
      try {
        const normalizedChart = normalizeMermaidChart(chart);
        console.log(
          "🔍 Attempting to render Mermaid chart:",
          chart.substring(0, 100) + "...",
        );

        let parseResult;
        try {
          parseResult = await mermaid.parse(normalizedChart, {
            suppressErrors: false,
          });
        } catch (parseError) {
          console.error("❌ Mermaid parse error details:", {
            error: parseError,
            message:
              parseError instanceof Error
                ? parseError.message
                : String(parseError),
            stack: parseError instanceof Error ? parseError.stack : undefined,
            chart: chart.substring(0, 200) + (chart.length > 200 ? "..." : ""),
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

        const uniqueId = `mermaid-${Math.random().toString(36).substring(2, 11)}`;

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
            stack: renderError instanceof Error ? renderError.stack : undefined,
            uniqueId,
            chart: chart.substring(0, 200) + (chart.length > 200 ? "..." : ""),
          });
          throw renderError;
        }

        if (isMounted) {
          const tempDiv = document.createElement("div");
          tempDiv.style.position = "absolute";
          tempDiv.style.visibility = "hidden";
          tempDiv.style.width = "800px";
          tempDiv.innerHTML = renderedSvg;
          document.body.appendChild(tempDiv);

          const svgElement = tempDiv.querySelector("svg");
          let finalHeight = 200;
          let svgWidth = 800;
          let svgHeight = 200;

          if (svgElement) {
            const rect = svgElement.getBoundingClientRect();
            svgWidth = rect.width;
            svgHeight = rect.height;
            finalHeight = Math.max(rect.height + 32, 200);
          }

          document.body.removeChild(tempDiv);

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
          const combinedError = formatMermaidError(chart, chartKey, err);
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
  }, [chart, chartKey, renderState.isLoading]);

  return { renderState, chartKey };
};

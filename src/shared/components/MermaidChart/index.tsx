import React, { useRef, useState } from "react";
import { theme } from "antd";
import MermaidChartError from "./MermaidChartError";
import MermaidChartViewer from "./MermaidChartViewer";
import { useMermaidRenderState } from "./useMermaidRenderState";

const { useToken } = theme;

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
    const { renderState } = useMermaidRenderState(chart);
    const { svg, height, svgWidth, error, isLoading } = renderState;
    const [isFixing, setIsFixing] = useState(false);
    const [fixError, setFixError] = useState("");
    const containerRef = useRef<HTMLDivElement>(null);

    const calculateInitialScale = () => {
      if (svgWidth > 1200) {
        return 0.8;
      }

      if (svgWidth > 800) {
        return 1.0;
      }

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
        <MermaidChartError
          error={error}
          className={className}
          style={style}
          token={token}
          onFix={onFix ? handleFix : undefined}
          isFixing={isFixing}
          fixError={fixError}
        />
      );
    }

    return (
      <MermaidChartViewer
        svg={svg}
        height={height}
        isLoading={isLoading}
        initialScale={initialScale}
        className={className}
        style={style}
        token={token}
        containerRef={containerRef}
      />
    );
  },
);

MermaidChart.displayName = "MermaidChart";

export default MermaidChart;

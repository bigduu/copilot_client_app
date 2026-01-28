import React from "react";
import { Button } from "antd";
import { TransformComponent, TransformWrapper } from "react-zoom-pan-pinch";

interface MermaidChartViewerProps {
  svg: string;
  height: number;
  isLoading: boolean;
  initialScale: number;
  className?: string;
  style?: React.CSSProperties;
  token: any;
  containerRef: React.RefObject<HTMLDivElement>;
}

const MermaidChartViewer: React.FC<MermaidChartViewerProps> = ({
  svg,
  height,
  isLoading,
  initialScale,
  className,
  style,
  token,
  containerRef,
}) => {
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
        overflow: "hidden",
        height: `${Math.max(Math.min(height, 800), 400)}px`,
        maxHeight: "80vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
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
                      '<svg$1 style=\"display: block; max-width: 100%; max-height: 100%;\">',
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
};

export default MermaidChartViewer;

import React from "react"
import { Segmented } from "antd"

import type { UiMode } from "../../store/uiModeStore"
import { useUiModeStore } from "../../store/uiModeStore"

export const ModeSwitcher: React.FC<{
  size?: "small" | "middle" | "large"
  style?: React.CSSProperties
}> = ({ size = "middle", style }) => {
  const mode = useUiModeStore((s) => s.mode)
  const setMode = useUiModeStore((s) => s.setMode)

  return (
    <Segmented
      size={size}
      value={mode}
      options={[
        { label: "Chat", value: "chat" },
        { label: "Agent", value: "agent" },
      ]}
      onChange={(value) => setMode(value as UiMode)}
      style={style}
    />
  )
}


import { Grid, theme } from "antd";

const { useToken } = theme;
const { useBreakpoint } = Grid;

/**
 * Hook to get responsive layout values for ChatView
 */
export const useResponsiveLayout = () => {
  const { token } = useToken();
  const screens = useBreakpoint();

  const getContainerMaxWidth = () => {
    if (screens.xs) return "100%";
    if (screens.sm) return "100%";
    if (screens.md) return "90%";
    if (screens.lg) return "85%";
    return "1024px";
  };

  const getContainerPadding = () => {
    if (screens.xs) return token.paddingXS;
    if (screens.sm) return token.paddingSM;
    return token.padding;
  };

  const getScrollButtonPosition = () => {
    return screens.xs ? 16 : 32;
  };

  return {
    token,
    screens,
    containerMaxWidth: getContainerMaxWidth(),
    containerPadding: getContainerPadding(),
    scrollButtonPosition: getScrollButtonPosition(),
    rowGap: token.marginMD,
  };
};

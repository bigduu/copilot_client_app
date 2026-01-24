export const getMessageCardMaxWidth = (screens: {
  xs?: boolean;
  sm?: boolean;
}) => {
  if (screens.xs) return "100%";
  if (screens.sm) return "95%";
  return "800px";
};

export const formatJson = (value: any): string => {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};

export const tryParseJson = (value: string): any | null => {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

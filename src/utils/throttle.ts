/**
 * Create a throttled function that only invokes the provided function at most once
 * per every `throttleMs` milliseconds.
 * @param onUpdate The function to throttle.
 * @param throttleMs The number of milliseconds to throttle invocations to.
 * @returns A new throttled function.
 */
export const createThrottledUpdater = (
  onUpdate: (content: string) => void,
  throttleMs: number = 150
): (content: string) => void => {
  let lastUpdateTime = 0;
  let pendingContent = '';
  let timeoutId: number | null = null;

  return (content: string) => {
    pendingContent = content;
    const now = Date.now();
    const timeSinceLastUpdate = now - lastUpdateTime;

    if (timeSinceLastUpdate > throttleMs) {
      lastUpdateTime = now;
      onUpdate(content);
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
    } else if (timeoutId === null) {
      timeoutId = window.setTimeout(() => {
        onUpdate(pendingContent);
        lastUpdateTime = Date.now();
        timeoutId = null;
      }, throttleMs - timeSinceLastUpdate);
    }
  };
};

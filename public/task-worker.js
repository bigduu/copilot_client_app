console.log("[Task Worker] Worker script loaded.");

// This is the proxy for the main thread's invoke function.
// The script executed by the worker will call this.
async function invoke(command, args) {
  return new Promise((resolve, reject) => {
    const messageId = crypto.randomUUID();

    const messageListener = (event) => {
      if (event.data.type === 'invokeResult' && event.data.messageId === messageId) {
        self.removeEventListener('message', messageListener);
        if (event.data.error) {
          reject(new Error(event.data.error));
        } else {
          resolve(event.data.result);
        }
      }
    };

    self.addEventListener('message', messageListener);

    self.postMessage({
      type: 'invoke',
      payload: {
        command,
        args,
      },
      messageId,
    });
  });
}

self.onmessage = (event) => {
  console.log("[Task Worker] Received script to execute:", event.data);
  const { script } = event.data;

  if (script) {
    try {
      // Execute the script in the worker's global scope.
      // The script will have access to the `invoke` function defined above.
      const runnable = new Function('invoke', script);
      runnable(invoke);
      console.log("[Task Worker] Script execution finished.");
    } catch (error) {
      console.error("[Task Worker] Error executing script:", error);
    }
  }
};
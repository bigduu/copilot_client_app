export const buildWorkspaceUrl = (baseUrl: string, endpoint: string) => {
  const cleanEndpoint = endpoint.startsWith("/") ? endpoint.slice(1) : endpoint;
  return `${baseUrl}/${cleanEndpoint}`;
};

export const appendQueryParams = (
  url: string,
  queryParams?: Record<string, string>,
) => {
  const finalUrl = new URL(url);
  if (queryParams) {
    Object.entries(queryParams).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        finalUrl.searchParams.append(key, value);
      }
    });
  }
  return finalUrl.toString();
};

export const delay = (ms: number): Promise<void> => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

export const runBatchRequests = async <T>(
  requests: Array<() => Promise<T>>,
) => {
  const BATCH_SIZE = 5;
  const results: T[] = [];

  for (let i = 0; i < requests.length; i += BATCH_SIZE) {
    const batch = requests.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(batch.map((request) => request()));
    results.push(...batchResults);

    if (i + BATCH_SIZE < requests.length) {
      await delay(50);
    }
  }

  return results;
};

export const uploadWorkspaceFile = async (
  request: (url: string, options: RequestInit) => Promise<any>,
  baseUrl: string,
  endpoint: string,
  headers: Record<string, string>,
  file: File,
  additionalData?: Record<string, any>,
) => {
  const formData = new FormData();
  formData.append("file", file);

  if (additionalData) {
    Object.entries(additionalData).forEach(([key, value]) => {
      formData.append(key, String(value));
    });
  }

  const url = buildWorkspaceUrl(baseUrl, endpoint);

  return request(url, {
    method: "POST",
    body: formData,
    headers: Object.fromEntries(
      Object.entries(headers).filter(
        ([key]) => key.toLowerCase() !== "content-type",
      ),
    ),
  });
};

export async function* streamWorkspaceResponse(
  baseUrl: string,
  endpoint: string,
  headers: Record<string, string>,
  data?: any,
): AsyncGenerator<any, void, unknown> {
  const url = buildWorkspaceUrl(baseUrl, endpoint);

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: data ? JSON.stringify(data) : undefined,
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  if (!response.body) {
    throw new Error("Response body is null");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split("\n").filter((line) => line.trim());

      for (const line of lines) {
        try {
          const parsed = JSON.parse(line);
          yield parsed;
        } catch (error) {
          console.warn("Failed to parse streaming response line:", line);
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

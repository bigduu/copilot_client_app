export function mockFetchResponse(
  data: any,
  options?: { ok?: boolean; status?: number },
) {
  return {
    ok: options?.ok ?? true,
    status: options?.status ?? 200,
    json: async () => data,
    text: async () => JSON.stringify(data),
    headers: new Headers({
      "content-type": "application/json",
    }),
  } as Response;
}

export function mockFetchError(message: string, status: number = 500) {
  return {
    ok: false,
    status,
    statusText: message,
    json: async () => ({ error: message }),
    text: async () => JSON.stringify({ error: message }),
    headers: new Headers({
      "content-type": "application/json",
    }),
  } as Response;
}

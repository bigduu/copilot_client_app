import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockInvoke = vi.fn();
const mockLoadSystemPrompts = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

vi.mock("../MainLayout", () => ({
  MainLayout: () => <div>MainLayout</div>,
}));

vi.mock("../../pages/SetupPage", () => ({
  SetupPage: () => <div>SetupPage</div>,
}));

vi.mock("../../pages/ChatPage/store", () => ({
  useAppStore: (
    selector: (state: {
      loadSystemPrompts: typeof mockLoadSystemPrompts;
    }) => unknown,
  ) => selector({ loadSystemPrompts: mockLoadSystemPrompts }),
  initializeStore: vi.fn(),
}));

import App from "../App";

const mockProxyConfig = (config: {
  http_proxy: string;
  https_proxy: string;
}) => {
  mockInvoke.mockImplementation((command: string) => {
    if (command === "get_setup_status") {
      return Promise.resolve({
        is_complete: Boolean(config.http_proxy || config.https_proxy),
        has_proxy_config: Boolean(config.http_proxy || config.https_proxy),
        has_proxy_env: true,
        message:
          "Detected proxy environment variables: HTTP_PROXY. You may need to configure proxy settings.",
      });
    }

    return Promise.resolve(undefined);
  });
};

describe("App setup flow", () => {
  beforeEach(() => {
    mockInvoke.mockReset();
    mockLoadSystemPrompts.mockReset();
  });

  it("renders SetupPage when setup has not been completed", async () => {
    mockProxyConfig({ http_proxy: "", https_proxy: "" });

    render(<App />);

    expect(await screen.findByText("SetupPage")).toBeTruthy();
    expect(screen.queryByText("MainLayout")).toBeNull();
    expect(mockLoadSystemPrompts).not.toHaveBeenCalled();
  });

  it("renders MainLayout and loads prompts when proxy config exists", async () => {
    mockProxyConfig({
      http_proxy: "http://proxy.example.com:8080",
      https_proxy: "",
    });

    render(<App />);

    expect(await screen.findByText("MainLayout")).toBeTruthy();
    await waitFor(() => {
      expect(mockLoadSystemPrompts).toHaveBeenCalledTimes(1);
    });
  });

  it("renders MainLayout when backend marks setup complete", async () => {
    mockInvoke.mockImplementation((command: string) => {
      if (command === "get_setup_status") {
        return Promise.resolve({
          is_complete: true,
          has_proxy_config: false,
          has_proxy_env: true,
          message: "Setup already completed.",
        });
      }

      return Promise.resolve(undefined);
    });

    render(<App />);

    expect(await screen.findByText("MainLayout")).toBeTruthy();
    await waitFor(() => {
      expect(mockLoadSystemPrompts).toHaveBeenCalledTimes(1);
    });
  });

  it("skips setup when backend reports no setup needed", async () => {
    mockInvoke.mockImplementation((command: string) => {
      if (command === "get_setup_status") {
        return Promise.resolve({
          is_complete: true,
          has_proxy_config: false,
          has_proxy_env: false,
          message:
            "No proxy environment variables detected. You can proceed without proxy.",
        });
      }

      return Promise.resolve(undefined);
    });

    render(<App />);

    expect(await screen.findByText("MainLayout")).toBeTruthy();
    await waitFor(() => {
      expect(mockLoadSystemPrompts).toHaveBeenCalledTimes(1);
    });
  });

  it("renders SetupPage when setup status check fails", async () => {
    mockInvoke.mockRejectedValueOnce(new Error("invoke failed"));

    render(<App />);

    expect(await screen.findByText("SetupPage")).toBeTruthy();
    expect(screen.queryByText("MainLayout")).toBeNull();
  });
});

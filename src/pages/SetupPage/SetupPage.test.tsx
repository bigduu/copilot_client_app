import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SetupPage } from "./SetupPage";

const mockInvoke = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

describe("SetupPage", () => {
  beforeEach(() => {
    mockInvoke.mockReset();
    mockInvoke.mockImplementation((command: string) => {
      if (command === "get_proxy_config") {
        return Promise.resolve({
          http_proxy: "",
          https_proxy: "",
          username: null,
          password: null,
          remember: false,
        });
      }

      if (command === "get_setup_status") {
        return Promise.resolve({
          is_complete: false,
          has_proxy_config: false,
          has_proxy_env: false,
          message:
            "No proxy environment variables detected. You can proceed without proxy or configure one manually if needed.",
        });
      }

      if (command === "mark_setup_complete") {
        return Promise.resolve(undefined);
      }

      return Promise.resolve(undefined);
    });
  });

  it("loads backend setup status and shows the status message", async () => {
    mockInvoke.mockImplementation((command: string) => {
      if (command === "get_proxy_config") {
        return Promise.resolve({
          http_proxy: "",
          https_proxy: "",
          username: null,
          password: null,
          remember: false,
        });
      }

      if (command === "get_setup_status") {
        return Promise.resolve({
          is_complete: false,
          has_proxy_config: false,
          has_proxy_env: true,
          message:
            "Detected proxy environment variables: HTTP_PROXY, HTTPS_PROXY. You may need to configure proxy settings.",
        });
      }

      if (command === "mark_setup_complete") {
        return Promise.resolve(undefined);
      }

      return Promise.resolve(undefined);
    });

    render(<SetupPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Next" }));

    expect(
      await screen.findByText(
        "Detected proxy environment variables: HTTP_PROXY, HTTPS_PROXY. You may need to configure proxy settings.",
      ),
    ).toBeTruthy();
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("get_setup_status");
    });
  });

  it("persists proxy settings and marks setup complete", async () => {
    render(<SetupPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Next" }));

    fireEvent.change(screen.getByLabelText("HTTP Proxy URL:"), {
      target: { value: "http://proxy.example.com:8080" },
    });
    fireEvent.change(await screen.findByLabelText("Username"), {
      target: { value: "alice" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "secret" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Complete Setup" }));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("set_proxy_config", {
        httpProxy: "http://proxy.example.com:8080",
        httpsProxy: "",
        username: "alice",
        password: "secret",
        remember: true,
      });
      expect(mockInvoke).toHaveBeenCalledWith("mark_setup_complete");
    });

    expect(await screen.findByText("Setup Complete!")).toBeTruthy();
  });

  it("allows skipping setup and marks completion in backend", async () => {
    render(<SetupPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Next" }));
    fireEvent.click(screen.getByRole("button", { name: "Skip for now" }));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("mark_setup_complete");
    });
    expect(await screen.findByText("Setup Complete!")).toBeTruthy();
  });

  it("treats completing without a proxy as skipping setup", async () => {
    render(<SetupPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Next" }));
    fireEvent.click(screen.getByRole("button", { name: "Complete Setup" }));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("mark_setup_complete");
      expect(
        mockInvoke.mock.calls.some((call) => call[0] === "set_proxy_config"),
      ).toBe(false);
    });
    expect(await screen.findByText("Setup Complete!")).toBeTruthy();
  });

  it("shows error when marking setup completion fails", async () => {
    mockInvoke.mockImplementation((command: string) => {
      if (command === "get_proxy_config") {
        return Promise.resolve({
          http_proxy: "",
          https_proxy: "",
          username: null,
          password: null,
          remember: false,
        });
      }

      if (command === "get_setup_status") {
        return Promise.resolve({
          is_complete: false,
          has_proxy_config: false,
          has_proxy_env: false,
          message:
            "No proxy environment variables detected. You can proceed without proxy or configure one manually if needed.",
        });
      }

      if (command === "mark_setup_complete") {
        return Promise.reject(new Error("failed"));
      }

      return Promise.resolve(undefined);
    });

    render(<SetupPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Next" }));
    fireEvent.click(screen.getByRole("button", { name: "Skip for now" }));

    expect(
      await screen.findByText("Failed to complete setup. Please try again."),
    ).toBeTruthy();
    expect(screen.queryByText("Setup Complete!")).toBeNull();
  });
});

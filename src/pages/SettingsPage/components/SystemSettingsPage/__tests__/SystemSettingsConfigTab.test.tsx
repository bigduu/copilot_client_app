import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import SystemSettingsConfigTab from "../SystemSettingsConfigTab";

type SystemSettingsConfigTabProps = Parameters<typeof SystemSettingsConfigTab>[0];

vi.mock("../../../../services/common/ServiceFactory", () => ({
  serviceFactory: {
    setProxyAuth: vi.fn(),
  },
}));

vi.mock("../../../../shared/utils/proxyAuth", () => ({
  clearStoredProxyAuth: vi.fn(),
  readStoredProxyAuth: vi.fn(() => null),
  writeStoredProxyAuth: vi.fn(),
}));

const makeProps = (overrides: Partial<SystemSettingsConfigTabProps> = {}) => ({
  bambooConfigJson: "{}",
  bambooConfigError: null,
  isLoadingBambooConfig: false,
  onReload: vi.fn(),
  onSave: vi.fn(),
  onChange: vi.fn(),
  models: ["gpt-5-mini"],
  selectedModel: "gpt-5-mini",
  onModelChange: vi.fn(),
  modelsError: null,
  isLoadingModels: false,
  backendBaseUrl: "http://127.0.0.1:8080/v1",
  onBackendBaseUrlChange: vi.fn(),
  onSaveBackendBaseUrl: vi.fn(),
  onResetBackendBaseUrl: vi.fn(),
  hasBackendOverride: false,
  defaultBackendBaseUrl: "http://127.0.0.1:8080/v1",
  ...overrides,
});

describe("SystemSettingsConfigTab", () => {
  it("unmounts Advanced JSON content after collapsing", () => {
    render(<SystemSettingsConfigTab {...makeProps()} />);

    fireEvent.click(screen.getByText("Advanced JSON"));

    const advancedJsonPlaceholder = "{\"http_proxy\":\"\",\"https_proxy\":\"\",\"proxy_auth_mode\":\"auto\",\"api_key\":null,\"api_base\":null,\"model\":null,\"headless_auth\":false}";
    expect(screen.getByPlaceholderText(advancedJsonPlaceholder)).toBeTruthy();

    fireEvent.click(screen.getByText("Advanced JSON"));

    expect(
      screen.queryByPlaceholderText(advancedJsonPlaceholder),
    ).toBeNull();
  });

  // TODO: Fix these tests - Collapse component state management in tests
  it.skip("keeps Advanced JSON open after config polling updates", async () => {
    const { container, rerender } = render(
      <SystemSettingsConfigTab
        {...makeProps({ bambooConfigJson: JSON.stringify({ api_key: "a" }, null, 2) })}
      />,
    );

    fireEvent.click(screen.getByText("Advanced JSON"));

    await waitFor(() => {
      const collapseItem = container.querySelector(".ant-collapse-item");
      expect(collapseItem?.classList.contains("ant-collapse-item-active")).toBe(true);
    });

    rerender(
      <SystemSettingsConfigTab
        {...makeProps({
          bambooConfigJson: JSON.stringify({ api_key: "b" }, null, 2),
        })}
      />,
    );

    await waitFor(() => {
      const rerenderedItem = container.querySelector(".ant-collapse-item");
      expect(rerenderedItem?.classList.contains("ant-collapse-item-active")).toBe(true);
    });
  });

  it.skip("keeps Advanced JSON collapsed after config polling updates", async () => {
    const { container, rerender } = render(<SystemSettingsConfigTab {...makeProps()} />);

    const header = screen.getByText("Advanced JSON");
    const collapseItem = container.querySelector(".ant-collapse-item");
    expect(collapseItem?.classList.contains("ant-collapse-item-active")).toBe(false);

    fireEvent.click(header);

    await waitFor(() => {
      const item = container.querySelector(".ant-collapse-item");
      expect(item?.classList.contains("ant-collapse-item-active")).toBe(true);
    });

    fireEvent.click(header);

    await waitFor(() => {
      const item = container.querySelector(".ant-collapse-item");
      expect(item?.classList.contains("ant-collapse-item-active")).toBe(false);
    });

    rerender(
      <SystemSettingsConfigTab
        {...makeProps({
          bambooConfigJson: JSON.stringify({ api_key: "updated" }, null, 2),
        })}
      />,
    );

    await waitFor(() => {
      const rerenderedItem = container.querySelector(".ant-collapse-item");
      expect(rerenderedItem?.classList.contains("ant-collapse-item-active")).toBe(false);
    });
  });
});

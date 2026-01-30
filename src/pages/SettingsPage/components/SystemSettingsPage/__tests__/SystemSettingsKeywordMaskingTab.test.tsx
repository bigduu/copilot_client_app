import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { invoke } from "@tauri-apps/api/core";

import SystemSettingsKeywordMaskingTab from "../SystemSettingsKeywordMaskingTab";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

describe("SystemSettingsKeywordMaskingTab", () => {
  it("applies example selection to pattern and match type", async () => {
    const invokeMock = vi.mocked(invoke);
    invokeMock.mockResolvedValue({ entries: [] });

    render(<SystemSettingsKeywordMaskingTab />);

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("get_keyword_masking_config");
    });

    fireEvent.click(screen.getByText("Add Keyword"));

    const exampleSelect = screen.getByTestId("keyword-example-select");
    const selector = exampleSelect.querySelector(".ant-select-selector");
    if (selector) {
      fireEvent.mouseDown(selector);
    }

    fireEvent.click(await screen.findByText("Mask GitHub tokens"));

    const patternInput = screen.getByPlaceholderText(
      "Enter pattern to match",
    ) as HTMLInputElement;
    expect(patternInput.value).toBe("ghp_[A-Za-z0-9]+");
    expect(screen.getByText("Regex Pattern")).toBeTruthy();
  });
});

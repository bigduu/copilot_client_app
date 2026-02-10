import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { McpServerFormModal } from "../McpServerFormModal";

describe("McpServerFormModal", () => {
  it("submits stdio server configuration", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);

    render(
      <McpServerFormModal
        open
        mode="create"
        onCancel={vi.fn()}
        onSubmit={onSubmit}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText("filesystem"), {
      target: { value: "filesystem" },
    });

    fireEvent.change(screen.getByPlaceholderText("Filesystem MCP"), {
      target: { value: "Filesystem" },
    });

    fireEvent.change(screen.getByPlaceholderText("npx"), {
      target: { value: "npx" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "filesystem",
          name: "Filesystem",
          transport: expect.objectContaining({
            type: "stdio",
            command: "npx",
          }),
        }),
      );
    });
  });
});

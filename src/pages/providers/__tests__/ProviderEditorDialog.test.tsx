import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { ProviderEditorDialog } from "../ProviderEditorDialog";
import { providerUpsert } from "../../../services/providers";

vi.mock("sonner", () => ({ toast: vi.fn() }));
vi.mock("../../../services/consoleLog", () => ({ logToConsole: vi.fn() }));

vi.mock("../../../services/providers", async () => {
  const actual = await vi.importActual<typeof import("../../../services/providers")>(
    "../../../services/providers"
  );
  return { ...actual, providerUpsert: vi.fn(), baseUrlPingMs: vi.fn() };
});

describe("pages/providers/ProviderEditorDialog", () => {
  it("validates create form and saves provider", async () => {
    vi.mocked(providerUpsert).mockResolvedValue({
      id: 1,
      cli_key: "claude",
      name: "My Provider",
      base_urls: ["https://example.com/v1"],
      base_url_mode: "order",
      enabled: true,
      cost_multiplier: 1.0,
      claude_models: {},
    } as any);

    const onSaved = vi.fn();
    const onOpenChange = vi.fn();

    render(
      <ProviderEditorDialog
        mode="create"
        open={true}
        cliKey="claude"
        onSaved={onSaved}
        onOpenChange={onOpenChange}
      />
    );

    const dialog = within(screen.getByRole("dialog"));

    fireEvent.click(dialog.getByRole("button", { name: "保存" }));
    expect(vi.mocked(toast)).toHaveBeenCalledWith("名称不能为空");

    fireEvent.change(dialog.getByPlaceholderText("default"), { target: { value: "My Provider" } });
    fireEvent.click(dialog.getByRole("button", { name: "保存" }));
    expect(vi.mocked(toast)).toHaveBeenCalledWith("API Key 不能为空（新增 Provider 必填）");

    fireEvent.change(dialog.getByPlaceholderText("sk-…"), { target: { value: "sk-test" } });
    fireEvent.change(dialog.getByPlaceholderText("1.0"), { target: { value: "0" } });
    fireEvent.click(dialog.getByRole("button", { name: "保存" }));
    expect(vi.mocked(toast)).toHaveBeenCalledWith("价格倍率必须大于 0");

    fireEvent.change(dialog.getByPlaceholderText("1.0"), { target: { value: "1.0" } });
    fireEvent.change(dialog.getByPlaceholderText(/中转 endpoint/), {
      target: { value: "ftp://x" },
    });
    fireEvent.click(dialog.getByRole("button", { name: "保存" }));
    expect(vi.mocked(toast)).toHaveBeenCalledWith(
      expect.stringContaining("Base URL 协议必须是 http/https")
    );

    fireEvent.change(dialog.getByPlaceholderText(/中转 endpoint/), {
      target: { value: "https://example.com/v1" },
    });

    fireEvent.click(dialog.getByText("Claude 模型映射"));
    fireEvent.change(dialog.getByPlaceholderText(/minimax-text-01/), {
      target: { value: "x".repeat(201) },
    });
    fireEvent.click(dialog.getByRole("button", { name: "保存" }));
    expect(vi.mocked(toast)).toHaveBeenCalledWith(expect.stringContaining("主模型 过长"));

    fireEvent.change(dialog.getByPlaceholderText(/minimax-text-01/), { target: { value: "ok" } });
    fireEvent.click(dialog.getByRole("button", { name: "保存" }));

    await waitFor(() =>
      expect(vi.mocked(providerUpsert)).toHaveBeenCalledWith(
        expect.objectContaining({
          cli_key: "claude",
          name: "My Provider",
          base_urls: ["https://example.com/v1"],
          base_url_mode: "order",
          api_key: "sk-test",
          enabled: true,
          cost_multiplier: 1.0,
        })
      )
    );

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith("claude"));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });
});

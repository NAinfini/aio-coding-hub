import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CliManagerGeminiTab } from "../GeminiTab";

describe("components/cli-manager/tabs/GeminiTab", () => {
  it("renders installed state and refresh action", () => {
    const refresh = vi.fn();
    render(
      <CliManagerGeminiTab
        geminiAvailable="available"
        geminiLoading={false}
        geminiInfo={
          {
            found: true,
            version: "1.2.3",
            executable_path: "/bin/gemini",
            resolved_via: "PATH",
            shell: "/bin/zsh",
            error: null,
          } as any
        }
        refreshGeminiInfo={refresh}
      />
    );

    expect(screen.getByText("已安装 1.2.3")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "刷新状态" }));
    expect(refresh).toHaveBeenCalled();
  });

  it("renders unavailable and error states", () => {
    render(
      <CliManagerGeminiTab
        geminiAvailable="unavailable"
        geminiLoading={false}
        geminiInfo={null}
        refreshGeminiInfo={vi.fn()}
      />
    );
    expect(screen.getByText("仅在 Tauri Desktop 环境可用")).toBeInTheDocument();

    render(
      <CliManagerGeminiTab
        geminiAvailable="available"
        geminiLoading={false}
        geminiInfo={
          {
            found: false,
            version: null,
            executable_path: null,
            resolved_via: "PATH",
            shell: null,
            error: "boom",
          } as any
        }
        refreshGeminiInfo={vi.fn()}
      />
    );
    expect(screen.getByText("检测失败：")).toBeInTheDocument();
    expect(screen.getByText("boom")).toBeInTheDocument();
  });
});

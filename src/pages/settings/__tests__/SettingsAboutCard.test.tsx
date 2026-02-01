import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SettingsAboutCard } from "../SettingsAboutCard";

describe("pages/settings/SettingsAboutCard", () => {
  it("renders placeholder when about is null", () => {
    render(<SettingsAboutCard about={null} />);
    expect(screen.getByText("关于应用")).toBeInTheDocument();
    expect(screen.getByText("仅在 Tauri Desktop 环境可用。")).toBeInTheDocument();
  });

  it("renders about information when available", () => {
    render(
      <SettingsAboutCard
        about={{
          os: "mac",
          arch: "arm64",
          profile: "dev",
          app_version: "0.0.0",
          bundle_type: null,
          run_mode: "desktop",
        }}
      />
    );

    expect(screen.getByText("版本")).toBeInTheDocument();
    expect(screen.getByText("0.0.0")).toBeInTheDocument();
    expect(screen.getByText("平台")).toBeInTheDocument();
    expect(screen.getByText("mac/arm64")).toBeInTheDocument();
    expect(screen.getByText("Bundle")).toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.getByText("运行模式")).toBeInTheDocument();
    expect(screen.getByText("desktop")).toBeInTheDocument();
  });
});

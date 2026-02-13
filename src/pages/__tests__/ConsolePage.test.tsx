import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";
import { toast } from "sonner";
import { createTestQueryClient } from "../../test/utils/reactQuery";
import { ConsolePage } from "../ConsolePage";
import {
  clearConsoleLogs,
  formatConsoleLogDetails,
  getConsoleDebugEnabled,
  setConsoleDebugEnabled,
  useConsoleLogs,
} from "../../services/consoleLog";

vi.mock("sonner", () => ({ toast: vi.fn() }));
vi.mock("../../services/consoleLog", async () => {
  const actual = await vi.importActual<typeof import("../../services/consoleLog")>(
    "../../services/consoleLog"
  );
  return {
    ...actual,
    useConsoleLogs: vi.fn(),
    clearConsoleLogs: vi.fn(),
    formatConsoleLogDetails: vi.fn(),
    getConsoleDebugEnabled: vi.fn(),
    setConsoleDebugEnabled: vi.fn(),
  };
});

// Mock useVirtualizer so all items render in jsdom (no layout engine)
vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: ({ count }: { count: number }) => {
    const items = Array.from({ length: count }, (_, i) => ({
      index: i,
      key: String(i),
      start: i * 48,
      size: 48,
      end: (i + 1) * 48,
    }));
    return {
      getVirtualItems: () => items,
      getTotalSize: () => count * 48,
      measureElement: () => {},
      scrollToIndex: () => {},
    };
  },
}));

function renderWithProviders(element: ReactElement) {
  const client = createTestQueryClient();
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>{element}</MemoryRouter>
    </QueryClientProvider>
  );
}

describe("pages/ConsolePage", () => {
  it("supports filtering, toggles, clear, and expands details", async () => {
    vi.mocked(getConsoleDebugEnabled).mockReturnValue(false);

    const logs: any[] = [];
    for (let i = 0; i < 201; i += 1) {
      logs.push({ id: i + 1, tsText: "00:00:00", level: "info", title: `L${i + 1}` });
    }
    logs.push({ id: 1000, tsText: "00:00:01", level: "debug", title: "DEBUG-1" });
    logs.push({
      id: 2000,
      tsText: "00:00:02",
      level: "error",
      title: "DETAIL-LOG",
      details: { kind: "x" },
    });

    vi.mocked(useConsoleLogs).mockReturnValue(logs as any);
    vi.mocked(formatConsoleLogDetails).mockReturnValue("FORMATTED");

    renderWithProviders(<ConsolePage />);

    expect(screen.getByRole("heading", { level: 1, name: "控制台" })).toBeInTheDocument();
    expect(screen.getByText("已隐藏 1 条日志")).toBeInTheDocument();

    // With virtualization, all visible logs are rendered (no "show all" button needed).
    // The badge should show the total visible count (202 = 203 total - 1 debug).
    expect(screen.getByText("202")).toBeInTheDocument();

    // Toggle debug switch (second switch)
    const switches = screen.getAllByRole("switch");
    fireEvent.click(switches[1]);
    expect(setConsoleDebugEnabled).toHaveBeenCalledWith(true);
    expect(toast).toHaveBeenCalledWith("已开启调试日志");

    // Clear logs
    fireEvent.click(screen.getByRole("button", { name: "清空日志" }));
    expect(clearConsoleLogs).toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith("已清空控制台日志");

    // Expand details row
    const details = screen.getByText("DETAIL-LOG").closest("details") as HTMLDetailsElement | null;
    expect(details).not.toBeNull();
    (details as HTMLDetailsElement).open = true;
    fireEvent(details as HTMLDetailsElement, new Event("toggle"));

    await waitFor(() => expect(formatConsoleLogDetails).toHaveBeenCalled());
    expect(screen.getByText("FORMATTED")).toBeInTheDocument();
  });
});

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  useCliManagerClaudeHooksQuery,
  useCliManagerClaudeHooksSetMutation,
} from "../../../../query/cliManager";
import { CliManagerHooksTab } from "../HooksTab";

vi.mock("../../../../query/cliManager", async () => {
  const actual = await vi.importActual<typeof import("../../../../query/cliManager")>(
    "../../../../query/cliManager"
  );
  return {
    ...actual,
    useCliManagerClaudeHooksQuery: vi.fn(),
    useCliManagerClaudeHooksSetMutation: vi.fn(),
  };
});

function mockMutation() {
  vi.mocked(useCliManagerClaudeHooksSetMutation).mockReturnValue({
    isPending: false,
    mutateAsync: vi.fn(),
  } as any);
}

describe("CliManagerHooksTab", () => {
  it("shows an error state and disables adding when hooks cannot be read", () => {
    const refetch = vi.fn();
    mockMutation();
    vi.mocked(useCliManagerClaudeHooksQuery).mockReturnValue({
      data: undefined,
      error: new Error("settings.json 解析失败"),
      isError: true,
      isLoading: false,
      refetch,
    } as any);

    render(<CliManagerHooksTab />);

    expect(screen.getByText("读取 Hooks 失败")).toBeInTheDocument();
    expect(screen.getByText(/settings\.json 解析失败/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /添加/ })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "重试" }));
    expect(refetch).toHaveBeenCalled();
  });
});

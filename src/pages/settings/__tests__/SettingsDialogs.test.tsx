import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SettingsDialogs } from "../SettingsDialogs";

vi.mock("../../../components/settings/ModelPriceAliasesDialog", () => ({
  ModelPriceAliasesDialog: () => <div>aliases-dialog</div>,
}));

describe("pages/settings/SettingsDialogs", () => {
  it("prevents closing dialogs while in progress", () => {
    const setClearOpen = vi.fn();
    const setClearing = vi.fn();
    const setResetOpen = vi.fn();
    const setResetting = vi.fn();

    render(
      <SettingsDialogs
        modelPriceAliasesDialogOpen={false}
        setModelPriceAliasesDialogOpen={vi.fn()}
        clearRequestLogsDialogOpen={true}
        setClearRequestLogsDialogOpen={setClearOpen}
        clearingRequestLogs={true}
        setClearingRequestLogs={setClearing}
        clearRequestLogs={vi.fn().mockResolvedValue(undefined)}
        resetAllDialogOpen={true}
        setResetAllDialogOpen={setResetOpen}
        resettingAll={true}
        setResettingAll={setResetting}
        resetAllData={vi.fn().mockResolvedValue(undefined)}
      />
    );

    fireEvent.keyDown(window, { key: "Escape" });
    expect(setClearOpen).not.toHaveBeenCalled();
    expect(setResetOpen).not.toHaveBeenCalled();

    const cancelButtons = screen.getAllByRole("button", { name: "取消" });
    expect(cancelButtons.length).toBeGreaterThan(0);
    for (const btn of cancelButtons) expect(btn).toBeDisabled();

    const pendingButtons = screen.getAllByRole("button", { name: "清理中…" });
    expect(pendingButtons).toHaveLength(2);
    for (const btn of pendingButtons) expect(btn).toBeDisabled();
  });

  it("closes dialogs and resets pending flags when dismissed", () => {
    const setClearOpen = vi.fn();
    const setClearing = vi.fn();
    const setResetOpen = vi.fn();
    const setResetting = vi.fn();

    render(
      <SettingsDialogs
        modelPriceAliasesDialogOpen={false}
        setModelPriceAliasesDialogOpen={vi.fn()}
        clearRequestLogsDialogOpen={true}
        setClearRequestLogsDialogOpen={setClearOpen}
        clearingRequestLogs={false}
        setClearingRequestLogs={setClearing}
        clearRequestLogs={vi.fn().mockResolvedValue(undefined)}
        resetAllDialogOpen={true}
        setResetAllDialogOpen={setResetOpen}
        resettingAll={false}
        setResettingAll={setResetting}
        resetAllData={vi.fn().mockResolvedValue(undefined)}
      />
    );

    fireEvent.keyDown(window, { key: "Escape" });

    expect(setClearOpen).toHaveBeenCalledWith(false);
    expect(setClearing).toHaveBeenCalledWith(false);
    expect(setResetOpen).toHaveBeenCalledWith(false);
    expect(setResetting).toHaveBeenCalledWith(false);
  });
});

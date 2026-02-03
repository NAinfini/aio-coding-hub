import { describe, expect, it, vi } from "vitest";
import { setTauriRuntime } from "../../test/utils/tauriRuntime";
import { tauriInvoke } from "../../test/mocks/tauri";
import { setEnvConflictsState } from "../../test/msw/state";
import { envConflictsCheck } from "../envConflicts";

describe("services/envConflicts", () => {
  it("fetches env conflicts via invoke->msw bridge", async () => {
    setTauriRuntime();
    setEnvConflictsState([
      { var_name: "OPENAI_API_KEY", source_type: "system", source_path: "Process Environment" },
    ]);

    await expect(envConflictsCheck("codex")).resolves.toEqual([
      { var_name: "OPENAI_API_KEY", source_type: "system", source_path: "Process Environment" },
    ]);

    expect(vi.mocked(tauriInvoke)).toHaveBeenCalledWith("env_conflicts_check", { cliKey: "codex" });
  });
});

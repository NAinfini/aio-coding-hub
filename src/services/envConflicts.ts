import { invokeTauriOrNull } from "./tauriInvoke";
import type { CliKey } from "./providers";

export type EnvConflict = {
  var_name: string;
  source_type: "system" | "file";
  source_path: string;
};

export async function envConflictsCheck(cliKey: CliKey): Promise<EnvConflict[] | null> {
  return invokeTauriOrNull<EnvConflict[]>("env_conflicts_check", { cliKey });
}

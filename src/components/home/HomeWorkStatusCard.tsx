// Usage:
// - Render in `HomeOverviewPanel` left column to show CLI proxy toggle and active sort mode selector.

import { CLIS } from "../../constants/clis";
import type { CliKey } from "../../services/providers";
import type { SortModeSummary } from "../../services/sortModes";
import { Button } from "../../ui/Button";
import { Card } from "../../ui/Card";
import { Switch } from "../../ui/Switch";

export type HomeWorkStatusCardProps = {
  sortModes: SortModeSummary[];
  sortModesLoading: boolean;
  sortModesAvailable: boolean | null;
  activeModeByCli: Record<CliKey, number | null>;
  activeModeToggling: Record<CliKey, boolean>;
  onSetCliActiveMode: (cliKey: CliKey, modeId: number | null) => void;

  cliProxyEnabled: Record<CliKey, boolean>;
  cliProxyToggling: Record<CliKey, boolean>;
  onSetCliProxyEnabled: (cliKey: CliKey, enabled: boolean) => void;
};

export function HomeWorkStatusCard({
  sortModes,
  sortModesLoading,
  sortModesAvailable,
  activeModeByCli,
  activeModeToggling,
  onSetCliActiveMode,
  cliProxyEnabled,
  cliProxyToggling,
  onSetCliProxyEnabled,
}: HomeWorkStatusCardProps) {
  return (
    <Card padding="sm" className="flex flex-col">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-semibold">工作状态</div>
      </div>

      {sortModesLoading ? (
        <div className="mt-2 text-sm text-slate-600 dark:text-slate-400">加载中…</div>
      ) : sortModesAvailable === false ? (
        <div className="mt-2 text-sm text-slate-600 dark:text-slate-400">
          仅在 Tauri Desktop 环境可用
        </div>
      ) : (
        <div className="mt-3 space-y-2.5">
          {CLIS.map((cli) => {
            const cliKey = cli.key as CliKey;
            const activeModeId = activeModeByCli[cliKey] ?? null;
            const options = [
              { id: null as number | null, label: "Default" },
              ...sortModes.map((m) => ({ id: m.id, label: m.name })),
            ];

            return (
              <div
                key={cli.key}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 shadow-sm transition-all duration-200 hover:bg-slate-50 hover:border-indigo-200 hover:shadow-md dark:border-slate-700 dark:bg-slate-800 dark:shadow-none dark:hover:bg-slate-700 dark:hover:border-indigo-700"
              >
                <div className="grid grid-cols-[6.5rem_1fr] items-center gap-x-3 gap-y-2.5 sm:grid-cols-[8rem_1fr]">
                  <div className="text-xs font-medium text-slate-700 dark:text-slate-300">
                    {cli.name}
                  </div>
                  <div className="flex justify-end">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-500 dark:text-slate-400">代理</span>
                      <Switch
                        checked={cliProxyEnabled[cliKey]}
                        disabled={cliProxyToggling[cliKey]}
                        onCheckedChange={(next) => onSetCliProxyEnabled(cliKey, next)}
                        size="sm"
                      />
                      <span className="text-xs text-slate-600 dark:text-slate-400 font-medium min-w-[1rem]">
                        {cliProxyEnabled[cliKey] ? "开" : "关"}
                      </span>
                    </div>
                  </div>

                  <div className="col-span-2 flex items-center justify-between">
                    <div className="text-xs text-slate-500 dark:text-slate-400">当前模板</div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {options.map((opt, idx) => {
                        const active = activeModeId === opt.id;
                        const disabled = activeModeToggling[cliKey] || sortModesLoading;
                        const key = opt.id == null ? "default" : String(opt.id);
                        return (
                          <div key={key} className="flex items-center gap-1.5">
                            {idx > 0 ? (
                              <span className="text-slate-200 dark:text-slate-600">|</span>
                            ) : null}
                            <Button
                              onClick={() => onSetCliActiveMode(cliKey, opt.id)}
                              variant={active ? "primary" : "secondary"}
                              size="sm"
                              disabled={disabled}
                            >
                              {opt.label}
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

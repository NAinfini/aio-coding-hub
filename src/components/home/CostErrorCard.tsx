// Usage:
// - Extracted from HomeCostPanel. Renders the error card with retry button.

import { Card } from "../../ui/Card";
import { cn } from "../../utils/cn";

export function CostErrorCard({
  errorText,
  fetching,
  onRetry,
}: {
  errorText: string;
  fetching: boolean;
  onRetry: () => void;
}) {
  return (
    <Card
      padding="md"
      className="border-rose-200 dark:border-rose-700 bg-rose-50 dark:bg-rose-900/30"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="text-sm font-semibold text-rose-900 dark:text-rose-400">加载失败</div>
          <div className="mt-1 text-sm text-rose-800 dark:text-rose-300">
            花费数据刷新失败，请重试。
          </div>
        </div>
        <button
          type="button"
          onClick={onRetry}
          disabled={fetching}
          className={cn(
            "rounded-lg px-4 py-2 text-sm font-medium transition-all",
            "border border-rose-200 dark:border-rose-700 bg-white dark:bg-slate-800 text-rose-800 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-900/30",
            fetching && "opacity-50 cursor-not-allowed"
          )}
        >
          重试
        </button>
      </div>
      <div className="mt-3 rounded-lg border border-rose-200 dark:border-rose-700 bg-white/60 dark:bg-slate-800/60 p-3 font-mono text-xs text-slate-800 dark:text-slate-300">
        {errorText}
      </div>
    </Card>
  );
}

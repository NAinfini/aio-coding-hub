// Usage: 表格行内缓存细分展示组件。

import { formatInteger, formatPercent } from "../../utils/formatters";
import { computeCacheHitRate } from "../../utils/cacheRateMetrics";

export function CacheBreakdown({
  inputTokens,
  cacheCreationInputTokens,
  cacheReadInputTokens,
}: {
  inputTokens: number;
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
}) {
  const hitRate = computeCacheHitRate(inputTokens, cacheCreationInputTokens, cacheReadInputTokens);

  return (
    <div className="space-y-0.5 text-[10px] leading-4">
      <div className="text-slate-500 dark:text-slate-400">
        创建{" "}
        <span className="text-slate-700 dark:text-slate-300">
          {formatInteger(cacheCreationInputTokens)}
        </span>
      </div>
      <div className="text-slate-500 dark:text-slate-400">
        读取{" "}
        <span className="text-slate-700 dark:text-slate-300">
          {formatInteger(cacheReadInputTokens)}
        </span>
      </div>
      <div className="text-slate-500 dark:text-slate-400">
        命中率{" "}
        <span className="text-slate-700 dark:text-slate-300">{formatPercent(hitRate, 2)}</span>
      </div>
    </div>
  );
}

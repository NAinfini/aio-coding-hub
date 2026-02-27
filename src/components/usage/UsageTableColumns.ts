// Usage: 用量表格列定义 — UsageLeaderboardTable 与 UsageTableSkeleton 共享。

export const TABLE_COLUMNS = [
  { key: "rank", label: "#", width: "w-5" },
  { key: "name", label: "名称", width: "w-32" },
  { key: "requests", label: "请求数", width: "w-14" },
  { key: "successRate", label: "成功率", width: "w-12" },
  { key: "tokens", label: "总 Token", width: "w-16" },
  { key: "cache", label: "缓存 / 命中率", width: "w-20" },
  { key: "costUsd", label: "花费金额", width: "w-14" },
  { key: "costPercent", label: "费用占比", width: "w-24" },
  { key: "costPer1k", label: "$/1K Token", width: "w-16" },
  { key: "avgDuration", label: "平均耗时", width: "w-14" },
  { key: "avgTtfb", label: "平均首字", width: "w-14" },
  { key: "avgSpeed", label: "平均速率", width: "w-16" },
] as const;

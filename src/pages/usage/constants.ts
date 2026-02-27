import type { UsageScope } from "../../services/usage";
import type { TabListItem } from "../../ui/TabList";
import type { UsageTableTab } from "./types";

type ScopeItem = { key: UsageScope; label: string };

export const SCOPE_ITEMS: ScopeItem[] = [
  { key: "provider", label: "供应商" },
  { key: "cli", label: "CLI" },
  { key: "model", label: "模型" },
];

export const USAGE_TABLE_TAB_ITEMS = [
  { key: "usage", label: "用量" },
  { key: "cacheTrend", label: "缓存走势图" },
] satisfies Array<TabListItem<UsageTableTab>>;

export const LEADERBOARD_LIMIT = 50;

// Usage:
// - Extracted from HomeCostPanel. Renders the error card with retry button.

import { ErrorState } from "../../ui/ErrorState";
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
    <ErrorState
      title="加载失败"
      message={errorText || "花费数据刷新失败，请重试。"}
      onRetry={fetching ? undefined : onRetry}
      className={cn(fetching && "opacity-70")}
    />
  );
}

import { cn } from "../utils/cn";
import { Button } from "./Button";

export type ErrorStateProps = {
  title?: string;
  message?: string;
  onRetry?: () => void;
  className?: string;
};

export function ErrorState({ title = "加载失败", message, onRetry, className }: ErrorStateProps) {
  return (
    <div
      className={cn(
        "rounded-xl border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950 p-4",
        className
      )}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="text-sm font-semibold text-rose-900 dark:text-rose-400">{title}</div>
          {message ? (
            <div className="mt-1 text-sm text-rose-800 dark:text-rose-300">{message}</div>
          ) : null}
        </div>
        {onRetry ? (
          <Button onClick={onRetry} variant="secondary" size="sm" className="shrink-0">
            重试
          </Button>
        ) : null}
      </div>
    </div>
  );
}

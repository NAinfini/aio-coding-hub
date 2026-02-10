import type { ReactNode } from "react";
import { cn } from "../utils/cn";

export type EmptyStateVariant = "default" | "dashed";

export type EmptyStateProps = {
  title: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
  variant?: EmptyStateVariant;
  className?: string;
};

const VARIANT_CLASS: Record<EmptyStateVariant, string> = {
  default: "",
  dashed:
    "rounded-xl border border-dashed border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-6",
};

export function EmptyState({
  title,
  description,
  icon,
  action,
  variant = "default",
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center",
        VARIANT_CLASS[variant],
        variant === "default" && "py-4",
        className
      )}
    >
      {icon ? <div className="mb-3 text-slate-400 dark:text-slate-500">{icon}</div> : null}
      <div className="text-sm text-slate-500 dark:text-slate-400">{title}</div>
      {description ? (
        <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">{description}</div>
      ) : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}

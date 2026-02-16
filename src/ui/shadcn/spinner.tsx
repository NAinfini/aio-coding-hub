import { cn } from "@/ui/shadcn/utils";

export type SpinnerSize = "sm" | "md" | "lg";

export type SpinnerProps = {
  size?: SpinnerSize;
  className?: string;
};

const SIZE_CLASS: Record<SpinnerSize, string> = {
  sm: "h-4 w-4 border-2",
  md: "h-6 w-6 border-2",
  lg: "h-8 w-8 border-[3px]",
};

export function Spinner({ size = "md", className }: SpinnerProps) {
  return (
    <div
      role="status"
      aria-label="Loading"
      className={cn(
        "animate-spin rounded-full border-slate-300 border-t-slate-600 dark:border-slate-600 dark:border-t-slate-300",
        SIZE_CLASS[size],
        className
      )}
    />
  );
}

import { forwardRef } from "react";
import { cn } from "@/ui/shadcn/utils";

export type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement> & {
  mono?: boolean;
};

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { className, mono, ...props },
  ref
) {
  return (
    <select
      ref={ref}
      className={cn(
        "h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-sm outline-none transition dark:bg-slate-800 dark:border-slate-600 dark:text-slate-100 dark:shadow-none",
        "focus:border-accent focus:ring-2 focus:ring-accent/20 dark:focus:border-accent dark:focus:ring-accent/20",
        "disabled:cursor-not-allowed disabled:opacity-50",
        mono ? "font-mono" : null,
        className
      )}
      {...props}
    />
  );
});

import { forwardRef } from "react";
import { cn } from "@/ui/shadcn/utils";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  mono?: boolean;
};

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, mono, ...props },
  ref
) {
  return (
    <input
      ref={ref}
      className={cn(
        "h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-sm outline-none transition dark:bg-slate-800 dark:border-slate-600 dark:text-slate-100 dark:shadow-none",
        "placeholder:text-slate-400 dark:placeholder:text-slate-500",
        "focus:border-accent focus:ring-2 focus:ring-accent/20 dark:focus:border-accent dark:focus:ring-accent/20",
        "disabled:cursor-not-allowed disabled:opacity-50",
        mono ? "font-mono" : null,
        className
      )}
      {...props}
    />
  );
});

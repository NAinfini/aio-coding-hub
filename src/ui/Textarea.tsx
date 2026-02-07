import { forwardRef } from "react";
import { cn } from "../utils/cn";

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  mono?: boolean;
};

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { className, mono, ...props },
  ref
) {
  return (
    <textarea
      ref={ref}
      className={cn(
        "w-full resize-y rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition dark:bg-slate-800 dark:border-slate-600 dark:text-slate-100 dark:shadow-none",
        "placeholder:text-slate-400 dark:placeholder:text-slate-500",
        "focus:border-[#0052FF] focus:ring-2 focus:ring-[#0052FF]/20 dark:focus:border-blue-400 dark:focus:ring-blue-400/20",
        "disabled:cursor-not-allowed disabled:opacity-50",
        mono ? "font-mono" : null,
        className
      )}
      {...props}
    />
  );
});

import type { HTMLAttributes } from "react";
import { cn } from "@/ui/shadcn/utils";

export type CardPadding = "none" | "sm" | "md";

export type CardProps = HTMLAttributes<HTMLDivElement> & {
  padding?: CardPadding;
};

const PADDING_CLASS: Record<CardPadding, string> = {
  none: "",
  sm: "p-3 sm:p-4",
  md: "p-4 sm:p-5 md:p-6",
};

export function Card({ padding = "md", className, ...props }: CardProps) {
  return (
    <div
      className={cn(
        "overflow-hidden border border-slate-200 bg-white shadow-card dark:bg-slate-800/80 dark:border-slate-700 dark:shadow-slate-900/30",
        "rounded-xl sm:rounded-2xl",
        PADDING_CLASS[padding],
        className
      )}
      {...props}
    />
  );
}

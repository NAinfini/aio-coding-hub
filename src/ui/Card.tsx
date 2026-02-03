import type { HTMLAttributes } from "react";
import { cn } from "../utils/cn";

export type CardPadding = "none" | "sm" | "md";

export type CardProps = HTMLAttributes<HTMLDivElement> & {
  padding?: CardPadding;
};

// Responsive padding classes for each padding variant
const PADDING_CLASS: Record<CardPadding, string> = {
  none: "",
  sm: "p-3 sm:p-4",
  md: "p-4 sm:p-5 md:p-6",
};

export function Card({ padding = "md", className, ...props }: CardProps) {
  return (
    <div
      className={cn(
        "overflow-hidden border border-slate-200 bg-white shadow-card",
        // Responsive: smaller rounded corners on mobile
        "rounded-xl sm:rounded-2xl",
        PADDING_CLASS[padding],
        className
      )}
      {...props}
    />
  );
}

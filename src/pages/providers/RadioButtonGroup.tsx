// Usage: Generic radio-button group used in ProviderEditorDialog for mode selection.

import { cn } from "../../utils/cn";

type RadioButtonGroupProps<T extends string> = {
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
  ariaLabel: string;
  items: Array<{ value: T; label: string }>;
};

export function RadioButtonGroup<T extends string>({
  value,
  onChange,
  disabled,
  ariaLabel,
  items,
}: RadioButtonGroupProps<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn(
        "inline-flex w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-600 dark:bg-slate-800",
        disabled ? "opacity-60" : null
      )}
    >
      {items.map((item, index) => {
        const active = value === item.value;
        return (
          <button
            key={item.value}
            type="button"
            onClick={() => onChange(item.value)}
            role="radio"
            aria-checked={active}
            disabled={disabled}
            className={cn(
              "flex-1 px-3 py-2 text-sm font-medium transition",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-900",
              index < items.length - 1 ? "border-r border-slate-200 dark:border-slate-600" : null,
              active ? "bg-gradient-to-br from-accent to-accent-secondary text-white" : null,
              !active
                ? "bg-white text-slate-700 hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                : null,
              disabled ? "cursor-not-allowed" : null
            )}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

import { cn } from "../utils/cn";

export interface RadioGroupProps {
  name: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{
    value: string;
    label: string;
  }>;
  disabled?: boolean;
}

export function RadioGroup({ name, value, onChange, options, disabled }: RadioGroupProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {options.map((option) => (
        <label
          key={option.value}
          className={cn(
            "flex items-center gap-2 px-3 py-1.5 rounded-md border border-slate-200 cursor-pointer transition-colors dark:border-slate-600",
            value === option.value
              ? "bg-slate-100 border-slate-400 text-slate-900 dark:bg-slate-700 dark:border-slate-500 dark:text-slate-100"
              : "bg-white hover:bg-slate-50 text-slate-600 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-300",
            disabled && "opacity-50 cursor-not-allowed"
          )}
        >
          <input
            type="radio"
            name={name}
            value={option.value}
            checked={value === option.value}
            onChange={(e) => onChange(e.currentTarget.value)}
            disabled={disabled}
            className="cursor-pointer"
          />
          <span className="text-sm font-medium">{option.label}</span>
        </label>
      ))}
    </div>
  );
}

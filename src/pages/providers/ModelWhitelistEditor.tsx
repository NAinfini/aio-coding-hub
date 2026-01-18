// Usage: Provider editor sub-component for editing supported model patterns (with wildcard support).

import { useMemo, useState } from "react";
import { Button } from "../../ui/Button";
import { Input } from "../../ui/Input";
import { cn } from "../../utils/cn";

export type ModelWhitelistEditorProps = {
  value: Record<string, boolean>;
  onChange: (next: Record<string, boolean>) => void;
  disabled?: boolean;
};

function isWildcard(text: string) {
  return text.includes("*");
}

export function ModelWhitelistEditor({ value, onChange, disabled }: ModelWhitelistEditorProps) {
  const modelList = useMemo(() => {
    const models = Object.keys(value).filter((key) => Boolean(value[key]));
    models.sort((a, b) => a.localeCompare(b));
    return models;
  }, [value]);

  const [newModel, setNewModel] = useState("");

  function addModel() {
    const trimmed = newModel.trim();
    if (!trimmed) return;
    if (value[trimmed]) {
      setNewModel("");
      return;
    }

    onChange({ ...value, [trimmed]: true });
    setNewModel("");
  }

  function removeModel(model: string) {
    if (!value[model]) return;
    const next = { ...value };
    delete next[model];
    onChange(next);
  }

  return (
    <div className="space-y-2">
      {modelList.length > 0 ? (
        <div className="flex flex-wrap gap-2 rounded-lg border border-slate-200 bg-white p-2">
          {modelList.map((model) => (
            <span
              key={model}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-mono",
                "border-slate-200 bg-slate-50 text-slate-700",
                isWildcard(model) ? "text-[#0052FF]" : null
              )}
              title={model}
            >
              <span className="max-w-[260px] truncate">{model}</span>
              <button
                type="button"
                onClick={() => removeModel(model)}
                disabled={disabled}
                className={cn(
                  "rounded p-0.5 text-slate-500 transition hover:bg-rose-50 hover:text-rose-600",
                  disabled
                    ? "cursor-not-allowed opacity-50 hover:bg-transparent hover:text-slate-500"
                    : null
                )}
                aria-label={`移除模型 ${model}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-slate-200 bg-white px-3 py-2 text-xs text-slate-500">
          未配置白名单（默认视为支持所有模型）
        </div>
      )}

      <div className="flex items-center gap-2">
        <Input
          value={newModel}
          onChange={(e) => setNewModel(e.currentTarget.value)}
          placeholder="例如：claude-sonnet-4 或 claude-*"
          className="h-8 flex-1 font-mono text-sm"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addModel();
            }
          }}
          disabled={disabled}
        />
        <Button onClick={addModel} variant="secondary" size="sm" disabled={disabled}>
          添加
        </Button>
      </div>

      <div className="rounded-lg bg-slate-50 p-2 text-[11px] text-slate-600">
        <div className="font-semibold text-slate-700">示例</div>
        <ul className="mt-1 list-disc space-y-0.5 pl-4 font-mono">
          <li>
            <span>claude-sonnet-4</span>
          </li>
          <li>
            <span>claude-*</span>
          </li>
          <li>
            <span>anthropic/claude-*</span>
          </li>
        </ul>
      </div>
    </div>
  );
}

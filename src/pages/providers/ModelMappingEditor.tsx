// Usage: Provider editor sub-component for editing model mapping rules (with wildcard support).

import { useMemo, useRef, useState } from "react";
import { Button } from "../../ui/Button";
import { Input } from "../../ui/Input";
import { cn } from "../../utils/cn";

export type ModelMappingEditorProps = {
  value: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
  disabled?: boolean;
};

function isWildcard(text: string) {
  return text.includes("*");
}

export function ModelMappingEditor({ value, onChange, disabled }: ModelMappingEditorProps) {
  const mappingList = useMemo(() => {
    const entries = Object.entries(value)
      .map(([k, v]) => [k.trim(), v.trim()] as const)
      .filter(([k, v]) => Boolean(k) && Boolean(v));
    entries.sort(([a], [b]) => a.localeCompare(b));
    return entries;
  }, [value]);

  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");
  const valueRef = useRef<HTMLInputElement | null>(null);

  function addMapping() {
    const key = newKey.trim();
    const valueText = newValue.trim();
    if (!key || !valueText) return;

    onChange({ ...value, [key]: valueText });
    setNewKey("");
    setNewValue("");
  }

  function removeMapping(key: string) {
    if (!(key in value)) return;
    const next = { ...value };
    delete next[key];
    onChange(next);
  }

  return (
    <div className="space-y-2">
      {mappingList.length > 0 ? (
        <div className="space-y-2 rounded-lg border border-slate-200 bg-white p-2">
          {mappingList.map(([k, v]) => (
            <div
              key={k}
              className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 bg-slate-50 px-2 py-1.5"
            >
              <div className="flex min-w-0 items-center gap-2 font-mono text-xs text-slate-700">
                <span className={cn("truncate", isWildcard(k) ? "text-[#0052FF]" : null)}>{k}</span>
                <span className="shrink-0 text-slate-400">→</span>
                <span className={cn("truncate", isWildcard(v) ? "text-[#0052FF]" : null)}>{v}</span>
              </div>
              <Button
                onClick={() => removeMapping(k)}
                variant="danger"
                size="sm"
                disabled={disabled}
                className="h-7 px-2 py-0 text-[11px]"
              >
                删除
              </Button>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-slate-200 bg-white px-3 py-2 text-xs text-slate-500">
          未配置映射规则
        </div>
      )}

      <div className="flex items-center gap-2">
        <Input
          value={newKey}
          onChange={(e) => setNewKey(e.currentTarget.value)}
          placeholder="外部模型（key）例如：claude-*"
          className="h-8 flex-1 font-mono text-sm"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              valueRef.current?.focus();
            }
          }}
          disabled={disabled}
        />
        <span className="text-xs text-slate-400">→</span>
        <Input
          ref={valueRef}
          value={newValue}
          onChange={(e) => setNewValue(e.currentTarget.value)}
          placeholder="内部模型（value）例如：anthropic/claude-*"
          className="h-8 flex-1 font-mono text-sm"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addMapping();
            }
          }}
          disabled={disabled}
        />
        <Button onClick={addMapping} variant="secondary" size="sm" disabled={disabled}>
          添加
        </Button>
      </div>

      <div className="rounded-lg bg-slate-50 p-2 text-[11px] text-slate-600">
        <div className="font-semibold text-slate-700">示例</div>
        <ul className="mt-1 list-disc space-y-0.5 pl-4 font-mono">
          <li>
            <span>claude-sonnet-4</span> → <span>anthropic/claude-sonnet-4</span>
          </li>
          <li>
            <span>claude-*</span> → <span>anthropic/claude-*</span>
          </li>
          <li>
            <span>gpt-*</span> → <span>openai/gpt-*</span>
          </li>
        </ul>
      </div>
    </div>
  );
}

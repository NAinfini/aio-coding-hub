// Usage: Used by ProvidersView to create/edit a Provider with toast-based validation.

import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import {
  ChevronDown,
  Clock,
  DollarSign,
  CalendarDays,
  CalendarRange,
  Gauge,
  RotateCcw,
} from "lucide-react";
import { toast } from "sonner";
import { cliLongLabel } from "../../constants/clis";
import { logToConsole } from "../../services/consoleLog";
import {
  providerUpsert,
  type ClaudeModels,
  type CliKey,
  type ProviderSummary,
} from "../../services/providers";
import {
  createProviderEditorDialogSchema,
  type ProviderEditorDialogFormInput,
  type ProviderEditorDialogFormOutput,
} from "../../schemas/providerEditorDialog";
import { Button } from "../../ui/Button";
import { Dialog } from "../../ui/Dialog";
import { FormField } from "../../ui/FormField";
import { Input } from "../../ui/Input";
import { Switch } from "../../ui/Switch";
import { cn } from "../../utils/cn";
import { normalizeBaseUrlRows } from "./baseUrl";
import { BaseUrlEditor } from "./BaseUrlEditor";
import type { BaseUrlRow, ProviderBaseUrlMode } from "./types";
import { validateProviderClaudeModels } from "./validators";
import { useForm } from "react-hook-form";

type BaseUrlModeRadioGroupProps = {
  value: ProviderBaseUrlMode;
  onChange: (mode: ProviderBaseUrlMode) => void;
  disabled?: boolean;
};

function BaseUrlModeRadioGroup({ value, onChange, disabled }: BaseUrlModeRadioGroupProps) {
  const items = [
    { value: "order" as const, label: "顺序" },
    { value: "ping" as const, label: "Ping" },
  ];

  return (
    <div
      role="radiogroup"
      aria-label="Base URL 模式"
      className={cn(
        "inline-flex w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm",
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
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0052FF]/30 focus-visible:ring-offset-2 focus-visible:ring-offset-[#FAFAFA]",
              index < items.length - 1 ? "border-r border-slate-200" : null,
              active ? "bg-gradient-to-br from-[#0052FF] to-[#4D7CFF] text-white" : null,
              !active ? "bg-white text-slate-700 hover:bg-slate-50" : null,
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

type DailyResetMode = "fixed" | "rolling";

type DailyResetModeRadioGroupProps = {
  value: DailyResetMode;
  onChange: (mode: DailyResetMode) => void;
  disabled?: boolean;
};

function DailyResetModeRadioGroup({ value, onChange, disabled }: DailyResetModeRadioGroupProps) {
  const items = [
    { value: "fixed" as const, label: "固定时间" },
    { value: "rolling" as const, label: "滚动窗口 (24h)" },
  ];

  return (
    <div
      role="radiogroup"
      aria-label="每日重置模式"
      className={cn(
        "inline-flex w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm",
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
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0052FF]/30 focus-visible:ring-offset-2 focus-visible:ring-offset-[#FAFAFA]",
              index < items.length - 1 ? "border-r border-slate-200" : null,
              active ? "bg-gradient-to-br from-[#0052FF] to-[#4D7CFF] text-white" : null,
              !active ? "bg-white text-slate-700 hover:bg-slate-50" : null,
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

type ProviderEditorDialogBaseProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (cliKey: CliKey) => void;
};

export type ProviderEditorDialogProps =
  | (ProviderEditorDialogBaseProps & {
      mode: "create";
      cliKey: CliKey;
    })
  | (ProviderEditorDialogBaseProps & {
      mode: "edit";
      provider: ProviderSummary;
    });

function cliNameFromKey(cliKey: CliKey) {
  return cliLongLabel(cliKey);
}

// Limit card component for visual distinction
type LimitCardProps = {
  icon: React.ReactNode;
  iconBgClass: string;
  label: string;
  hint?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  disabled?: boolean;
};

function LimitCard({
  icon,
  iconBgClass,
  label,
  hint,
  value,
  onChange,
  placeholder,
  disabled,
}: LimitCardProps) {
  return (
    <div className="group relative rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-all hover:border-slate-300 hover:shadow-md">
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
            iconBgClass
          )}
        >
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <label className="text-sm font-medium text-slate-700">{label}</label>
          {hint ? <p className="mt-0.5 text-xs text-slate-400">{hint}</p> : null}
          <div className="relative mt-2">
            <Input
              type="number"
              min="0"
              step="0.01"
              value={value}
              onChange={(e) => onChange(e.currentTarget.value)}
              placeholder={placeholder}
              disabled={disabled}
              className="pr-12"
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-slate-400">
              USD
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ProviderEditorDialog(props: ProviderEditorDialogProps) {
  const { open, onOpenChange, onSaved } = props;

  const mode = props.mode;
  const cliKey = mode === "create" ? props.cliKey : props.provider.cli_key;
  const editingProviderId = mode === "edit" ? props.provider.id : null;

  const baseUrlRowSeqRef = useRef(1);
  const newBaseUrlRow = (url = ""): BaseUrlRow => {
    const id = String(baseUrlRowSeqRef.current++);
    return { id, url, ping: { status: "idle" } };
  };

  const [baseUrlMode, setBaseUrlMode] = useState<ProviderBaseUrlMode>("order");
  const [baseUrlRows, setBaseUrlRows] = useState<BaseUrlRow[]>(() => [newBaseUrlRow()]);
  const [pingingAll, setPingingAll] = useState(false);
  const [claudeModels, setClaudeModels] = useState<ClaudeModels>({});
  const [saving, setSaving] = useState(false);

  const schema = useMemo(() => createProviderEditorDialogSchema({ mode }), [mode]);
  const form = useForm<ProviderEditorDialogFormInput>({
    defaultValues: {
      name: "",
      api_key: "",
      cost_multiplier: "1.0",
      limit_5h_usd: "",
      limit_daily_usd: "",
      limit_weekly_usd: "",
      limit_monthly_usd: "",
      limit_total_usd: "",
      daily_reset_mode: "fixed",
      daily_reset_time: "00:00:00",
      enabled: true,
    },
  });

  const { register, reset, setValue, watch } = form;
  const enabled = watch("enabled");
  const dailyResetMode = watch("daily_reset_mode");
  const limit5hUsd = watch("limit_5h_usd");
  const limitDailyUsd = watch("limit_daily_usd");
  const limitWeeklyUsd = watch("limit_weekly_usd");
  const limitMonthlyUsd = watch("limit_monthly_usd");
  const limitTotalUsd = watch("limit_total_usd");

  const title =
    mode === "create"
      ? `${cliNameFromKey(cliKey)} · 添加供应商`
      : `${cliNameFromKey(props.provider.cli_key)} · 编辑供应商`;
  const description = mode === "create" ? "已锁定创建 CLI；如需切换请先关闭弹窗。" : undefined;

  useEffect(() => {
    if (!open) return;

    baseUrlRowSeqRef.current = 1;

    if (mode === "create") {
      setBaseUrlMode("order");
      setBaseUrlRows([newBaseUrlRow()]);
      setPingingAll(false);
      setClaudeModels({});
      reset({
        name: "",
        api_key: "",
        cost_multiplier: "1.0",
        limit_5h_usd: "",
        limit_daily_usd: "",
        limit_weekly_usd: "",
        limit_monthly_usd: "",
        limit_total_usd: "",
        daily_reset_mode: "fixed",
        daily_reset_time: "00:00:00",
        enabled: true,
      });
      return;
    }

    setBaseUrlMode(props.provider.base_url_mode);
    setBaseUrlRows(props.provider.base_urls.map((url) => newBaseUrlRow(url)));
    setPingingAll(false);
    setClaudeModels(props.provider.claude_models ?? {});
    reset({
      name: props.provider.name,
      api_key: "",
      cost_multiplier: String(props.provider.cost_multiplier ?? 1.0),
      limit_5h_usd: props.provider.limit_5h_usd != null ? String(props.provider.limit_5h_usd) : "",
      limit_daily_usd:
        props.provider.limit_daily_usd != null ? String(props.provider.limit_daily_usd) : "",
      limit_weekly_usd:
        props.provider.limit_weekly_usd != null ? String(props.provider.limit_weekly_usd) : "",
      limit_monthly_usd:
        props.provider.limit_monthly_usd != null ? String(props.provider.limit_monthly_usd) : "",
      limit_total_usd:
        props.provider.limit_total_usd != null ? String(props.provider.limit_total_usd) : "",
      daily_reset_mode: props.provider.daily_reset_mode ?? "fixed",
      daily_reset_time: props.provider.daily_reset_time ?? "00:00:00",
      enabled: props.provider.enabled,
    });
  }, [cliKey, editingProviderId, mode, open, reset]);

  const setBaseUrlRowsFromUser: Dispatch<SetStateAction<BaseUrlRow[]>> = (action) => {
    setBaseUrlRows(action);
  };

  function toastFirstSchemaIssue(issues: Array<{ path: Array<PropertyKey>; message: string }>) {
    const orderedFields: Array<keyof ProviderEditorDialogFormInput> = [
      "name",
      ...(mode === "create" ? (["api_key"] as const) : []),
      "cost_multiplier",
      "limit_5h_usd",
      "limit_daily_usd",
      "limit_weekly_usd",
      "limit_monthly_usd",
      "limit_total_usd",
      "daily_reset_time",
    ];

    const messageByField = new Map<string, string>();
    for (const issue of issues) {
      const firstSegment = issue.path[0];
      if (typeof firstSegment !== "string") continue;
      if (!messageByField.has(firstSegment)) {
        messageByField.set(firstSegment, issue.message);
      }
    }

    for (const field of orderedFields) {
      const maybeMessage = messageByField.get(field);
      if (maybeMessage) {
        toast(maybeMessage);
        return;
      }
    }

    const fallback = issues.find((issue) => Boolean(issue.message));
    if (fallback) {
      toast(fallback.message);
    }
  }

  async function save() {
    if (saving) return;

    const parsed = schema.safeParse(form.getValues());
    if (!parsed.success) {
      toastFirstSchemaIssue(parsed.error.issues);
      return;
    }

    const values: ProviderEditorDialogFormOutput = parsed.data;

    const normalized = normalizeBaseUrlRows(baseUrlRows);
    if (!normalized.ok) {
      toast(normalized.message);
      return;
    }

    if (cliKey === "claude") {
      const modelError = validateProviderClaudeModels(claudeModels);
      if (modelError) {
        toast(modelError);
        return;
      }
    }

    setSaving(true);
    try {
      const saved = await providerUpsert({
        ...(mode === "edit" ? { provider_id: props.provider.id } : {}),
        cli_key: cliKey,
        name: values.name,
        base_urls: normalized.baseUrls,
        base_url_mode: baseUrlMode,
        api_key: values.api_key,
        enabled: values.enabled,
        cost_multiplier: values.cost_multiplier,
        limit_5h_usd: values.limit_5h_usd,
        limit_daily_usd: values.limit_daily_usd,
        daily_reset_mode: values.daily_reset_mode,
        daily_reset_time: values.daily_reset_time,
        limit_weekly_usd: values.limit_weekly_usd,
        limit_monthly_usd: values.limit_monthly_usd,
        limit_total_usd: values.limit_total_usd,
        ...(cliKey === "claude" ? { claude_models: claudeModels } : {}),
      });

      if (!saved) {
        toast("仅在 Tauri Desktop 环境可用");
        return;
      }

      setValue("api_key", "", { shouldDirty: false, shouldValidate: false });
      logToConsole("info", mode === "create" ? "保存 Provider" : "更新 Provider", {
        cli: saved.cli_key,
        provider_id: saved.id,
        name: saved.name,
        base_urls: saved.base_urls,
        base_url_mode: saved.base_url_mode,
        enabled: saved.enabled,
        cost_multiplier: saved.cost_multiplier,
        claude_models: saved.claude_models,
        limit_5h_usd: saved.limit_5h_usd,
        limit_daily_usd: saved.limit_daily_usd,
        daily_reset_mode: saved.daily_reset_mode,
        daily_reset_time: saved.daily_reset_time,
        limit_weekly_usd: saved.limit_weekly_usd,
        limit_monthly_usd: saved.limit_monthly_usd,
        limit_total_usd: saved.limit_total_usd,
      });
      toast(mode === "create" ? "Provider 已保存" : "Provider 已更新");

      onSaved(saved.cli_key);
      onOpenChange(false);
    } catch (err) {
      logToConsole("error", mode === "create" ? "保存 Provider 失败" : "更新 Provider 失败", {
        error: String(err),
        cli: cliKey,
        provider_id: mode === "edit" ? props.provider.id : undefined,
      });
      toast(`${mode === "create" ? "保存" : "更新"}失败：${String(err)}`);
    } finally {
      setSaving(false);
    }
  }

  const claudeModelCount =
    cliKey === "claude"
      ? Object.values(claudeModels).filter((value) => {
          if (typeof value !== "string") return false;
          return Boolean(value.trim());
        }).length
      : 0;

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && saving) return;
        onOpenChange(nextOpen);
      }}
      title={title}
      description={description}
      className="max-w-4xl"
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label="名称">
            <Input placeholder="default" {...register("name")} />
          </FormField>

          <FormField label="Base URL 模式">
            <BaseUrlModeRadioGroup
              value={baseUrlMode}
              onChange={setBaseUrlMode}
              disabled={saving}
            />
          </FormField>
        </div>

        <FormField label="Base URLs">
          <BaseUrlEditor
            rows={baseUrlRows}
            setRows={setBaseUrlRowsFromUser}
            pingingAll={pingingAll}
            setPingingAll={setPingingAll}
            newRow={newBaseUrlRow}
            placeholder="中转 endpoint（例如：https://example.com/v1）"
            disabled={saving}
          />
        </FormField>

        <div className="grid gap-3 sm:grid-cols-2">
          <FormField
            label="API Key / Token"
            hint={mode === "edit" ? "留空保持不变" : "保存后不回显"}
          >
            <div className="flex items-center gap-2">
              <Input
                type="password"
                placeholder="sk-…"
                autoComplete="off"
                {...register("api_key")}
              />
            </div>
          </FormField>

          <FormField label="价格倍率">
            <Input
              type="number"
              min="0.0001"
              step="0.01"
              placeholder="1.0"
              {...register("cost_multiplier")}
            />
          </FormField>
        </div>

        <details className="group rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50/80 to-white shadow-sm open:ring-2 open:ring-[#0052FF]/10 transition-all">
          <summary className="flex cursor-pointer items-center justify-between px-5 py-4 select-none">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 shadow-sm">
                <DollarSign className="h-4 w-4 text-white" />
              </div>
              <div>
                <span className="text-sm font-semibold text-slate-700 group-open:text-[#0052FF]">
                  限流配置
                </span>
                <p className="text-xs text-slate-400">配置不同时间窗口的消费限制以控制成本</p>
              </div>
            </div>
            <ChevronDown className="h-4 w-4 text-slate-400 transition-transform group-open:rotate-180" />
          </summary>

          <div className="space-y-6 border-t border-slate-100 px-5 py-5">
            {/* Time-based limits section */}
            <div>
              <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
                时间维度限制
              </h4>
              <div className="grid gap-4 sm:grid-cols-2">
                <LimitCard
                  icon={<Clock className="h-5 w-5 text-blue-600" />}
                  iconBgClass="bg-blue-50"
                  label="5 小时消费上限"
                  hint="留空表示不限制"
                  value={limit5hUsd}
                  onChange={(value) => setValue("limit_5h_usd", value, { shouldDirty: true })}
                  placeholder="例如: 10"
                  disabled={saving}
                />
                <LimitCard
                  icon={<DollarSign className="h-5 w-5 text-emerald-600" />}
                  iconBgClass="bg-emerald-50"
                  label="每日消费上限"
                  hint="留空表示不限制"
                  value={limitDailyUsd}
                  onChange={(value) => setValue("limit_daily_usd", value, { shouldDirty: true })}
                  placeholder="例如: 100"
                  disabled={saving}
                />
                <LimitCard
                  icon={<CalendarDays className="h-5 w-5 text-violet-600" />}
                  iconBgClass="bg-violet-50"
                  label="周消费上限"
                  hint="自然周：周一 00:00:00"
                  value={limitWeeklyUsd}
                  onChange={(value) => setValue("limit_weekly_usd", value, { shouldDirty: true })}
                  placeholder="例如: 500"
                  disabled={saving}
                />
                <LimitCard
                  icon={<CalendarRange className="h-5 w-5 text-orange-600" />}
                  iconBgClass="bg-orange-50"
                  label="月消费上限"
                  hint="自然月：每月 1 号 00:00:00"
                  value={limitMonthlyUsd}
                  onChange={(value) => setValue("limit_monthly_usd", value, { shouldDirty: true })}
                  placeholder="例如: 2000"
                  disabled={saving}
                />
              </div>
            </div>

            {/* Daily reset settings section */}
            <div>
              <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
                每日重置设置
              </h4>
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-sky-50">
                    <RotateCcw className="h-5 w-5 text-sky-600" />
                  </div>
                  <div className="min-w-0 flex-1 space-y-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <label className="text-sm font-medium text-slate-700">每日重置模式</label>
                        <p className="mb-2 text-xs text-slate-400">rolling 为过去 24 小时窗口</p>
                        <DailyResetModeRadioGroup
                          value={dailyResetMode}
                          onChange={(value) =>
                            setValue("daily_reset_mode", value, { shouldDirty: true })
                          }
                          disabled={saving}
                        />
                      </div>
                      <div>
                        <label className="text-sm font-medium text-slate-700">每日重置时间</label>
                        <p className="mb-2 text-xs text-slate-400">
                          {dailyResetMode === "fixed"
                            ? "默认 00:00:00（本机时区）"
                            : "rolling 模式下忽略"}
                        </p>
                        <Input
                          type="time"
                          step="1"
                          disabled={saving || dailyResetMode !== "fixed"}
                          {...register("daily_reset_time")}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Other limits section */}
            <div>
              <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
                其他限制
              </h4>
              <div className="grid gap-4 sm:grid-cols-2">
                <LimitCard
                  icon={<Gauge className="h-5 w-5 text-rose-600" />}
                  iconBgClass="bg-rose-50"
                  label="总消费上限"
                  hint="达到后需手动调整/清除"
                  value={limitTotalUsd}
                  onChange={(value) => setValue("limit_total_usd", value, { shouldDirty: true })}
                  placeholder="例如: 1000"
                  disabled={saving}
                />
              </div>
            </div>
          </div>
        </details>

        {cliKey === "claude" ? (
          <details className="group rounded-xl border border-slate-200 bg-white shadow-sm open:ring-2 open:ring-[#0052FF]/10 transition-all">
            <summary className="flex cursor-pointer items-center justify-between px-4 py-3 select-none">
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-slate-700 group-open:text-[#0052FF]">
                  Claude 模型映射
                </span>
                <span className="text-xs font-mono text-slate-500">
                  已配置 {claudeModelCount}/5
                </span>
              </div>
              <ChevronDown className="h-4 w-4 text-slate-400 transition-transform group-open:rotate-180" />
            </summary>

            <div className="space-y-4 border-t border-slate-100 px-4 py-3">
              <FormField
                label="主模型"
                hint="默认兜底模型；未命中 haiku/sonnet/opus 且未启用 Thinking 时使用"
              >
                <Input
                  value={claudeModels.main_model ?? ""}
                  onChange={(e) => {
                    const value = e.currentTarget.value;
                    setClaudeModels((prev) => ({ ...prev, main_model: value }));
                  }}
                  placeholder="例如: glm-4-plus / minimax-text-01 / kimi-k2"
                  disabled={saving}
                />
              </FormField>

              <FormField
                label="推理模型 (Thinking)"
                hint="当请求中 thinking.type=enabled 时优先使用"
              >
                <Input
                  value={claudeModels.reasoning_model ?? ""}
                  onChange={(e) => {
                    const value = e.currentTarget.value;
                    setClaudeModels((prev) => ({
                      ...prev,
                      reasoning_model: value,
                    }));
                  }}
                  placeholder="例如: kimi-k2-thinking / glm-4-plus-thinking"
                  disabled={saving}
                />
              </FormField>

              <FormField label="Haiku 默认模型" hint="当请求模型名包含 haiku 时使用（子串匹配）">
                <Input
                  value={claudeModels.haiku_model ?? ""}
                  onChange={(e) => {
                    const value = e.currentTarget.value;
                    setClaudeModels((prev) => ({ ...prev, haiku_model: value }));
                  }}
                  placeholder="例如: glm-4-plus-haiku"
                  disabled={saving}
                />
              </FormField>

              <FormField label="Sonnet 默认模型" hint="当请求模型名包含 sonnet 时使用（子串匹配）">
                <Input
                  value={claudeModels.sonnet_model ?? ""}
                  onChange={(e) => {
                    const value = e.currentTarget.value;
                    setClaudeModels((prev) => ({ ...prev, sonnet_model: value }));
                  }}
                  placeholder="例如: glm-4-plus-sonnet"
                  disabled={saving}
                />
              </FormField>

              <FormField label="Opus 默认模型" hint="当请求模型名包含 opus 时使用（子串匹配）">
                <Input
                  value={claudeModels.opus_model ?? ""}
                  onChange={(e) => {
                    const value = e.currentTarget.value;
                    setClaudeModels((prev) => ({ ...prev, opus_model: value }));
                  }}
                  placeholder="例如: glm-4-plus-opus"
                  disabled={saving}
                />
              </FormField>
            </div>
          </details>
        ) : null}

        <div className="flex items-center justify-between border-t border-slate-100 pt-3">
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-700">启用</span>
            <Switch
              checked={enabled}
              onCheckedChange={(checked) => setValue("enabled", checked, { shouldDirty: true })}
              disabled={saving}
            />
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={() => onOpenChange(false)} variant="secondary" disabled={saving}>
              取消
            </Button>
            <Button onClick={save} variant="primary" disabled={saving}>
              {saving ? "保存中…" : "保存"}
            </Button>
          </div>
        </div>
      </div>
    </Dialog>
  );
}

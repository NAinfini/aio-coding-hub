// Usage: Rendered by ProvidersPage when `view === "providers"`.

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  type DragEndEvent,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { CLIS } from "../../constants/clis";
import { ClaudeModelValidationDialog } from "../../components/ClaudeModelValidationDialog";
import { logToConsole } from "../../services/consoleLog";
import type { GatewayProviderCircuitStatus } from "../../services/gateway";
import type { CliKey, ProviderSummary } from "../../services/providers";
import { gatewayKeys, providersKeys } from "../../query/keys";
import {
  useGatewayCircuitResetCliMutation,
  useGatewayCircuitResetProviderMutation,
  useGatewayCircuitStatusQuery,
} from "../../query/gateway";
import {
  useProviderDeleteMutation,
  useProviderSetEnabledMutation,
  useProvidersListQuery,
  useProvidersReorderMutation,
} from "../../query/providers";
import { Button } from "../../ui/Button";
import { Card } from "../../ui/Card";
import { Dialog } from "../../ui/Dialog";
import { Switch } from "../../ui/Switch";
import { cn } from "../../utils/cn";
import { formatCountdownSeconds, formatUnixSeconds, formatUsdRaw } from "../../utils/formatters";
import { providerBaseUrlSummary } from "./baseUrl";
import { ProviderEditorDialog } from "./ProviderEditorDialog";
import { FlaskConical } from "lucide-react";

type SortableProviderCardProps = {
  provider: ProviderSummary;
  circuit: GatewayProviderCircuitStatus | null;
  circuitResetting: boolean;
  onToggleEnabled: (provider: ProviderSummary) => void;
  onResetCircuit: (provider: ProviderSummary) => void;
  onValidateModel?: (provider: ProviderSummary) => void;
  onEdit: (provider: ProviderSummary) => void;
  onDelete: (provider: ProviderSummary) => void;
};

function SortableProviderCard({
  provider,
  circuit,
  circuitResetting,
  onToggleEnabled,
  onResetCircuit,
  onValidateModel,
  onEdit,
  onDelete,
}: SortableProviderCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: provider.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const claudeModelsCount = Object.values(provider.claude_models ?? {}).filter((value) => {
    if (typeof value !== "string") return false;
    return Boolean(value.trim());
  }).length;
  const hasClaudeModels = claudeModelsCount > 0;

  const limitChips = [
    provider.limit_5h_usd != null ? `5h ≤ ${formatUsdRaw(provider.limit_5h_usd)}` : null,
    provider.limit_daily_usd != null
      ? `日 ≤ ${formatUsdRaw(provider.limit_daily_usd)}（${
          provider.daily_reset_mode === "fixed" ? `固定 ${provider.daily_reset_time}` : "滚动 24h"
        }）`
      : null,
    provider.limit_weekly_usd != null ? `周 ≤ ${formatUsdRaw(provider.limit_weekly_usd)}` : null,
    provider.limit_monthly_usd != null ? `月 ≤ ${formatUsdRaw(provider.limit_monthly_usd)}` : null,
    provider.limit_total_usd != null
      ? `总 ≤ ${formatUsdRaw(provider.limit_total_usd)}（无重置）`
      : null,
  ].filter((v): v is string => Boolean(v));
  const hasLimits = limitChips.length > 0;

  const isOpen = circuit?.state === "OPEN";
  const cooldownUntil = circuit?.cooldown_until ?? null;
  const isUnavailable = isOpen || (cooldownUntil != null && Number.isFinite(cooldownUntil));
  const [nowUnix, setNowUnix] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    if (!isUnavailable) return;
    setNowUnix(Math.floor(Date.now() / 1000));
    const timer = window.setInterval(() => {
      setNowUnix(Math.floor(Date.now() / 1000));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [isUnavailable]);

  const unavailableUntil = isUnavailable
    ? (() => {
        const openUntil = isOpen ? (circuit?.open_until ?? null) : null;
        if (openUntil == null) return cooldownUntil;
        if (cooldownUntil == null) return openUntil;
        return Math.max(openUntil, cooldownUntil);
      })()
    : null;
  const unavailableRemaining =
    unavailableUntil != null ? Math.max(0, unavailableUntil - nowUnix) : null;
  const unavailableCountdown =
    unavailableRemaining != null ? formatCountdownSeconds(unavailableRemaining) : null;

  return (
    <div ref={setNodeRef} style={style} className="relative">
      <Card
        padding="sm"
        className={cn(
          "flex cursor-grab flex-col gap-2 transition-shadow duration-200 active:cursor-grabbing sm:flex-row sm:items-center sm:justify-between",
          isDragging && "z-10 scale-[1.02] shadow-lg ring-2 ring-[#0052FF]/30"
        )}
        {...attributes}
        {...listeners}
      >
        <div className="flex min-w-0 items-center gap-3">
          <div className="inline-flex h-8 w-8 shrink-0 select-none items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-500">
            ⠿
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-2">
              <div className="truncate text-sm font-semibold">{provider.name}</div>
              {isUnavailable ? (
                <span
                  className="shrink-0 rounded-full bg-rose-50 px-2 py-0.5 font-mono text-[10px] text-rose-700 dark:bg-rose-900/30 dark:text-rose-400"
                  title={
                    unavailableUntil != null
                      ? `熔断至 ${formatUnixSeconds(unavailableUntil)}`
                      : "熔断"
                  }
                >
                  熔断{unavailableCountdown ? ` ${unavailableCountdown}` : ""}
                </span>
              ) : null}
            </div>
            <div className="mt-1 flex items-center gap-2">
              <span className="shrink-0 rounded-full bg-slate-50 px-2 py-0.5 font-mono text-[10px] text-slate-700 dark:bg-slate-700 dark:text-slate-300">
                {provider.base_url_mode === "ping" ? "Ping" : "顺序"}
              </span>
              <span className="shrink-0 rounded-full bg-slate-50 px-2 py-0.5 font-mono text-[10px] text-slate-700 dark:bg-slate-700 dark:text-slate-300">
                倍率 {provider.cost_multiplier}x
              </span>
              {provider.cli_key === "claude" && hasClaudeModels ? (
                <span
                  className="shrink-0 rounded-full bg-sky-50 px-2 py-0.5 font-mono text-[10px] text-sky-700 dark:bg-sky-900/30 dark:text-sky-400"
                  title={`已配置 Claude 模型映射（${claudeModelsCount}/5）`}
                >
                  Claude Models
                </span>
              ) : null}
              {hasLimits ? (
                <span
                  className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 font-mono text-[10px] text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                  title={limitChips.join("\n")}
                >
                  限额
                </span>
              ) : null}
            </div>
            <div
              className="mt-1 truncate font-mono text-xs text-slate-500 dark:text-slate-400 cursor-default"
              title={provider.base_urls.join("\n")}
            >
              {providerBaseUrlSummary(provider)}
            </div>
          </div>
        </div>

        <div
          className="flex flex-wrap items-center gap-3"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-600 dark:text-slate-400">启用</span>
            <Switch checked={provider.enabled} onCheckedChange={() => onToggleEnabled(provider)} />
          </div>

          {isUnavailable ? (
            <Button
              onClick={() => onResetCircuit(provider)}
              variant="secondary"
              disabled={circuitResetting}
            >
              {circuitResetting ? "处理中…" : "解除熔断"}
            </Button>
          ) : null}

          {onValidateModel ? (
            <Button
              onClick={() => onValidateModel(provider)}
              variant="secondary"
              size="icon"
              title="模型验证"
            >
              <FlaskConical className="h-4 w-4" />
            </Button>
          ) : null}

          <Button onClick={() => onEdit(provider)} variant="secondary" size="icon" title="编辑">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
              />
            </svg>
          </Button>

          <Button
            onClick={() => onDelete(provider)}
            variant="secondary"
            size="icon"
            className="hover:!bg-rose-50 hover:!text-rose-600"
            title="删除"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
              />
            </svg>
          </Button>
        </div>
      </Card>
    </div>
  );
}

export type ProvidersViewProps = {
  activeCli: CliKey;
  setActiveCli: (cliKey: CliKey) => void;
};

export function ProvidersView({ activeCli, setActiveCli }: ProvidersViewProps) {
  const queryClient = useQueryClient();

  const activeCliRef = useRef(activeCli);
  useEffect(() => {
    activeCliRef.current = activeCli;
  }, [activeCli]);

  const providersQuery = useProvidersListQuery(activeCli);
  const providers = useMemo<ProviderSummary[]>(
    () => providersQuery.data ?? [],
    [providersQuery.data]
  );
  const providersLoading = providersQuery.isFetching;

  const providersRef = useRef(providers);
  useEffect(() => {
    providersRef.current = providers;
  }, [providers]);

  const circuitQuery = useGatewayCircuitStatusQuery(activeCli);
  const circuitRows = useMemo<GatewayProviderCircuitStatus[]>(
    () => circuitQuery.data ?? [],
    [circuitQuery.data]
  );
  const circuitLoading = circuitQuery.isFetching;
  const circuitByProviderId = useMemo(() => {
    const next: Record<number, GatewayProviderCircuitStatus> = {};
    for (const row of circuitRows) {
      next[row.provider_id] = row;
    }
    return next;
  }, [circuitRows]);

  const [circuitResetting, setCircuitResetting] = useState<Record<number, boolean>>({});
  const [circuitResettingAll, setCircuitResettingAll] = useState(false);
  const circuitAutoRefreshTimerRef = useRef<number | null>(null);

  const hasUnavailableCircuit = useMemo(
    () =>
      Object.values(circuitByProviderId).some(
        (row) =>
          row.state === "OPEN" ||
          (row.cooldown_until != null && Number.isFinite(row.cooldown_until))
      ),
    [circuitByProviderId]
  );

  const resetCircuitProviderMutation = useGatewayCircuitResetProviderMutation();
  const resetCircuitCliMutation = useGatewayCircuitResetCliMutation();
  const providerSetEnabledMutation = useProviderSetEnabledMutation();
  const providerDeleteMutation = useProviderDeleteMutation();
  const providersReorderMutation = useProvidersReorderMutation();

  const [createOpen, setCreateOpen] = useState(false);
  const [createCliKeyLocked, setCreateCliKeyLocked] = useState<CliKey | null>(null);

  const [editTarget, setEditTarget] = useState<ProviderSummary | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ProviderSummary | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [validateDialogOpen, setValidateDialogOpen] = useState(false);
  const [validateProvider, setValidateProvider] = useState<ProviderSummary | null>(null);

  useEffect(() => {
    if (activeCli !== "claude" && validateDialogOpen) {
      setValidateDialogOpen(false);
      setValidateProvider(null);
    }
  }, [activeCli, validateDialogOpen]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  );

  useEffect(() => {
    setCircuitResetting({});
    setCircuitResettingAll(false);
  }, [activeCli]);

  useEffect(() => {
    if (circuitAutoRefreshTimerRef.current != null) {
      window.clearTimeout(circuitAutoRefreshTimerRef.current);
      circuitAutoRefreshTimerRef.current = null;
    }

    if (!hasUnavailableCircuit) return;

    const nowUnix = Math.floor(Date.now() / 1000);
    let nextAvailableUntil: number | null = null;
    for (const row of Object.values(circuitByProviderId)) {
      const cooldownUntil = row.cooldown_until ?? null;
      const isUnavailable =
        row.state === "OPEN" || (cooldownUntil != null && Number.isFinite(cooldownUntil));
      if (!isUnavailable) continue;

      const openUntil = row.state === "OPEN" ? (row.open_until ?? null) : null;
      const until =
        openUntil == null
          ? cooldownUntil
          : cooldownUntil == null
            ? openUntil
            : Math.max(openUntil, cooldownUntil);

      if (until == null) {
        nextAvailableUntil = nowUnix;
        break;
      }
      if (nextAvailableUntil == null || until < nextAvailableUntil) nextAvailableUntil = until;
    }
    if (nextAvailableUntil == null) return;

    const delayMs = Math.max(200, (nextAvailableUntil - nowUnix) * 1000 + 250);
    circuitAutoRefreshTimerRef.current = window.setTimeout(() => {
      circuitAutoRefreshTimerRef.current = null;
      void circuitQuery.refetch();
    }, delayMs);

    return () => {
      if (circuitAutoRefreshTimerRef.current != null) {
        window.clearTimeout(circuitAutoRefreshTimerRef.current);
        circuitAutoRefreshTimerRef.current = null;
      }
    };
  }, [circuitByProviderId, circuitQuery, hasUnavailableCircuit]);

  async function toggleProviderEnabled(provider: ProviderSummary) {
    try {
      const next = await providerSetEnabledMutation.mutateAsync({
        providerId: provider.id,
        enabled: !provider.enabled,
      });
      if (!next) {
        toast("仅在 Tauri Desktop 环境可用");
        return;
      }

      logToConsole("info", "更新 Provider 状态", { id: next.id, enabled: next.enabled });
      toast(next.enabled ? "已启用 Provider" : "已禁用 Provider");
    } catch (err) {
      logToConsole("error", "更新 Provider 状态失败", { error: String(err), id: provider.id });
      toast(`更新失败：${String(err)}`);
    }
  }

  async function resetCircuit(provider: ProviderSummary) {
    if (circuitResetting[provider.id]) return;
    setCircuitResetting((cur) => ({ ...cur, [provider.id]: true }));

    try {
      const ok = await resetCircuitProviderMutation.mutateAsync({
        cliKey: provider.cli_key,
        providerId: provider.id,
      });
      if (!ok) {
        toast("仅在 Tauri Desktop 环境可用");
        return;
      }

      toast("已解除熔断");
      void circuitQuery.refetch();
    } catch (err) {
      logToConsole("error", "解除熔断失败", { provider_id: provider.id, error: String(err) });
      toast(`解除熔断失败：${String(err)}`);
    } finally {
      setCircuitResetting((cur) => ({ ...cur, [provider.id]: false }));
    }
  }

  async function resetCircuitAll(cliKey: CliKey) {
    if (circuitResettingAll) return;
    setCircuitResettingAll(true);

    try {
      const count = await resetCircuitCliMutation.mutateAsync({ cliKey });
      if (count == null) {
        toast("仅在 Tauri Desktop 环境可用");
        return;
      }

      toast(count > 0 ? `已解除 ${count} 个 Provider 的熔断` : "无 Provider 需要处理");
      void circuitQuery.refetch();
    } catch (err) {
      logToConsole("error", "解除熔断（全部）失败", { cli: cliKey, error: String(err) });
      toast(`解除熔断失败：${String(err)}`);
    } finally {
      setCircuitResettingAll(false);
    }
  }

  function requestValidateProviderModel(provider: ProviderSummary) {
    if (activeCliRef.current !== "claude") return;
    setValidateProvider(provider);
    setValidateDialogOpen(true);
  }

  async function confirmRemoveProvider() {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    try {
      const ok = await providerDeleteMutation.mutateAsync({
        cliKey: deleteTarget.cli_key,
        providerId: deleteTarget.id,
      });
      if (!ok) {
        toast("仅在 Tauri Desktop 环境可用");
        return;
      }

      logToConsole("info", "删除 Provider", {
        id: deleteTarget.id,
        name: deleteTarget.name,
      });
      toast("Provider 已删除");
      setDeleteTarget(null);
    } catch (err) {
      logToConsole("error", "删除 Provider 失败", {
        error: String(err),
        id: deleteTarget.id,
      });
      toast(`删除失败：${String(err)}`);
    } finally {
      setDeleting(false);
    }
  }

  async function persistProvidersOrder(
    cliKey: CliKey,
    nextProviders: ProviderSummary[],
    prevProviders: ProviderSummary[]
  ) {
    try {
      const saved = await providersReorderMutation.mutateAsync({
        cliKey,
        orderedProviderIds: nextProviders.map((p) => p.id),
      });
      if (!saved) {
        toast("仅在 Tauri Desktop 环境可用");
        if (activeCliRef.current === cliKey) {
          queryClient.setQueryData(providersKeys.list(cliKey), prevProviders);
        }
        return;
      }

      if (activeCliRef.current !== cliKey) {
        return;
      }

      logToConsole("info", "更新 Provider 顺序", {
        cli: cliKey,
        order: saved.map((p) => p.id),
      });
      toast("顺序已更新");
    } catch (err) {
      if (activeCliRef.current === cliKey) {
        queryClient.setQueryData(providersKeys.list(cliKey), prevProviders);
      }
      logToConsole("error", "更新 Provider 顺序失败", {
        cli: cliKey,
        error: String(err),
      });
      toast(`顺序更新失败：${String(err)}`);
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const cliKey = activeCliRef.current;
    const prevProviders = providersRef.current;
    const oldIndex = prevProviders.findIndex((p) => p.id === active.id);
    const newIndex = prevProviders.findIndex((p) => p.id === over.id);

    if (oldIndex === -1 || newIndex === -1) return;

    const nextProviders = arrayMove(prevProviders, oldIndex, newIndex);
    queryClient.setQueryData(providersKeys.list(cliKey), nextProviders);
    void persistProvidersOrder(cliKey, nextProviders, prevProviders);
  }

  return (
    <>
      <div className="flex flex-col gap-3 lg:min-h-0 lg:flex-1">
        <div className="flex items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {CLIS.map((cli) => (
              <Button
                key={cli.key}
                onClick={() => setActiveCli(cli.key)}
                variant={activeCli === cli.key ? "primary" : "secondary"}
                size="sm"
              >
                {cli.name}
              </Button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between gap-2">
          <div className="text-[11px] text-slate-500 dark:text-slate-400">
            路由顺序：按拖拽顺序（上→下）
          </div>
          <div className="flex items-center gap-2">
            {hasUnavailableCircuit ? (
              <Button
                onClick={() => void resetCircuitAll(activeCli)}
                variant="secondary"
                size="sm"
                disabled={circuitResettingAll || circuitLoading || providers.length === 0}
              >
                {circuitResettingAll
                  ? "处理中…"
                  : circuitLoading
                    ? "熔断加载中…"
                    : "解除熔断（全部）"}
              </Button>
            ) : null}

            <Button
              onClick={() => {
                setCreateCliKeyLocked(activeCli);
                setCreateOpen(true);
              }}
              variant="secondary"
              size="sm"
            >
              添加
            </Button>
          </div>
        </div>

        <div className="lg:min-h-0 lg:flex-1 lg:overflow-auto lg:pr-1">
          {providersLoading ? (
            <div className="text-sm text-slate-600 dark:text-slate-400">加载中…</div>
          ) : providers.length === 0 ? (
            <div className="text-sm text-slate-600 dark:text-slate-400">
              暂无 Provider。请点击「添加」新增。
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={providers.map((p) => p.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-3">
                  {providers.map((provider) => (
                    <SortableProviderCard
                      key={provider.id}
                      provider={provider}
                      circuit={circuitByProviderId[provider.id] ?? null}
                      circuitResetting={Boolean(circuitResetting[provider.id]) || circuitLoading}
                      onToggleEnabled={toggleProviderEnabled}
                      onResetCircuit={resetCircuit}
                      onValidateModel={
                        activeCli === "claude" ? requestValidateProviderModel : undefined
                      }
                      onEdit={setEditTarget}
                      onDelete={setDeleteTarget}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </div>
      </div>

      <ClaudeModelValidationDialog
        open={validateDialogOpen}
        onOpenChange={(open) => {
          setValidateDialogOpen(open);
          if (!open) setValidateProvider(null);
        }}
        provider={validateProvider}
      />

      {createCliKeyLocked ? (
        <ProviderEditorDialog
          mode="create"
          open={createOpen}
          onOpenChange={(nextOpen) => {
            setCreateOpen(nextOpen);
            if (!nextOpen) setCreateCliKeyLocked(null);
          }}
          cliKey={createCliKeyLocked}
          onSaved={(cliKey) => {
            queryClient.invalidateQueries({ queryKey: providersKeys.list(cliKey) });
            queryClient.invalidateQueries({ queryKey: gatewayKeys.circuitStatus(cliKey) });
          }}
        />
      ) : null}

      {editTarget ? (
        <ProviderEditorDialog
          mode="edit"
          open={true}
          onOpenChange={(nextOpen) => {
            if (!nextOpen) setEditTarget(null);
          }}
          provider={editTarget}
          onSaved={(cliKey) => {
            queryClient.invalidateQueries({ queryKey: providersKeys.list(cliKey) });
            queryClient.invalidateQueries({ queryKey: gatewayKeys.circuitStatus(cliKey) });
          }}
        />
      ) : null}

      <Dialog
        open={!!deleteTarget}
        onOpenChange={(nextOpen) => {
          if (!nextOpen && deleting) return;
          if (!nextOpen) setDeleteTarget(null);
        }}
        title="确认删除 Provider"
        description={deleteTarget ? `将删除：${deleteTarget.name}` : undefined}
        className="max-w-lg"
      >
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button onClick={() => setDeleteTarget(null)} variant="secondary" disabled={deleting}>
            取消
          </Button>
          <Button onClick={confirmRemoveProvider} variant="primary" disabled={deleting}>
            {deleting ? "删除中…" : "确认删除"}
          </Button>
        </div>
      </Dialog>
    </>
  );
}

// Usage: Rendered by ProvidersPage when `view === "sortModes"`.

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
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
import { CLIS, cliFromKeyOrDefault } from "../../constants/clis";
import { logToConsole } from "../../services/consoleLog";
import type { CliKey, ProviderSummary } from "../../services/providers";
import {
  sortModeActiveList,
  sortModeCreate,
  sortModeDelete,
  sortModeProvidersList,
  sortModeProvidersSetOrder,
  sortModeProviderSetEnabled,
  sortModeRename,
  sortModesList,
  type SortModeProviderRow,
  type SortModeSummary,
} from "../../services/sortModes";
import { Button } from "../../ui/Button";
import { Card } from "../../ui/Card";
import { Dialog } from "../../ui/Dialog";
import { FormField } from "../../ui/FormField";
import { Input } from "../../ui/Input";
import { Switch } from "../../ui/Switch";
import { cn } from "../../utils/cn";
import { providerBaseUrlSummary } from "./baseUrl";

type SortableModeProviderRowProps = {
  providerId: number;
  provider: ProviderSummary | null;
  modeEnabled: boolean;
  disabled: boolean;
  onToggleEnabled: (providerId: number, enabled: boolean) => void;
  onRemove: (providerId: number) => void;
};

function SortableModeProviderRow({
  providerId,
  provider,
  modeEnabled,
  disabled,
  onToggleEnabled,
  onRemove,
}: SortableModeProviderRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: providerId,
    disabled,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <Card
        padding="sm"
        className={cn(
          "flex cursor-grab flex-col gap-2 transition-shadow duration-200 active:cursor-grabbing sm:flex-row sm:items-center sm:justify-between",
          isDragging && "z-10 scale-[1.02] opacity-90 shadow-lg ring-2 ring-[#0052FF]/30",
          disabled && "opacity-70",
          !modeEnabled && "bg-slate-50"
        )}
        {...attributes}
        {...listeners}
      >
        <div className="flex min-w-0 items-start gap-3 sm:items-center">
          <div className="mt-0.5 inline-flex h-8 w-8 select-none items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-400 sm:mt-0">
            ⠿
          </div>
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2">
              <div className="truncate text-sm font-semibold">
                {provider?.name?.trim() ? provider.name : `未知 Provider #${providerId}`}
              </div>
              {!modeEnabled ? (
                <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 font-mono text-[10px] text-slate-600">
                  模板关闭
                </span>
              ) : null}
            </div>
            <div className="truncate text-xs text-slate-500">
              {providerBaseUrlSummary(provider)}
            </div>
          </div>
        </div>

        <div
          className="flex flex-wrap items-center gap-2"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-600">启用</span>
            <Switch
              checked={modeEnabled}
              onCheckedChange={(checked) => onToggleEnabled(providerId, checked)}
              disabled={disabled}
              size="sm"
            />
          </div>
          <Button
            onClick={() => onRemove(providerId)}
            variant="secondary"
            size="sm"
            className="hover:!bg-rose-50 hover:!text-rose-600"
            disabled={disabled}
          >
            移除
          </Button>
        </div>
      </Card>
    </div>
  );
}

export type SortModesViewProps = {
  activeCli: CliKey;
  setActiveCli: (cliKey: CliKey) => void;
  providers: ProviderSummary[];
  providersLoading: boolean;
};

export function SortModesView({
  activeCli,
  setActiveCli,
  providers,
  providersLoading,
}: SortModesViewProps) {
  const activeCliRef = useRef(activeCli);
  useEffect(() => {
    activeCliRef.current = activeCli;
  }, [activeCli]);

  const currentCli = useMemo(() => cliFromKeyOrDefault(activeCli), [activeCli]);

  const [sortModes, setSortModes] = useState<SortModeSummary[]>([]);
  const [sortModesLoading, setSortModesLoading] = useState(false);
  const [sortModesAvailable, setSortModesAvailable] = useState<boolean | null>(null);
  const [activeModeId, setActiveModeId] = useState<number | null>(null);
  const [activeModeIdTouched, setActiveModeIdTouched] = useState(false);
  const activeModeIdRef = useRef(activeModeId);

  const [activeModeByCli, setActiveModeByCli] = useState<Record<CliKey, number | null>>({
    claude: null,
    codex: null,
    gemini: null,
  });

  const [modeProviders, setModeProviders] = useState<SortModeProviderRow[]>([]);
  const modeProvidersRef = useRef(modeProviders);
  const [modeProvidersLoading, setModeProvidersLoading] = useState(false);
  const [modeProvidersAvailable, setModeProvidersAvailable] = useState<boolean | null>(null);
  const [modeProvidersSaving, setModeProvidersSaving] = useState(false);

  const [createModeDialogOpen, setCreateModeDialogOpen] = useState(false);
  const [createModeName, setCreateModeName] = useState("");
  const [createModeSaving, setCreateModeSaving] = useState(false);

  const [renameModeDialogOpen, setRenameModeDialogOpen] = useState(false);
  const [renameModeName, setRenameModeName] = useState("");
  const [renameModeSaving, setRenameModeSaving] = useState(false);

  const [deleteModeTarget, setDeleteModeTarget] = useState<SortModeSummary | null>(null);
  const [deleteModeDeleting, setDeleteModeDeleting] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  );

  useEffect(() => {
    activeModeIdRef.current = activeModeId;
  }, [activeModeId]);

  useEffect(() => {
    modeProvidersRef.current = modeProviders;
  }, [modeProviders]);

  const selectedMode = useMemo(
    () => (activeModeId == null ? null : (sortModes.find((m) => m.id === activeModeId) ?? null)),
    [activeModeId, sortModes]
  );

  const activeModeForCurrentCli = activeModeByCli[activeCli] ?? null;

  const providersById = useMemo(() => {
    const map: Record<number, ProviderSummary> = {};
    for (const p of providers) {
      map[p.id] = p;
    }
    return map;
  }, [providers]);

  const modeProviderIdSet = useMemo(() => {
    const set = new Set<number>();
    for (const row of modeProviders) {
      set.add(row.provider_id);
    }
    return set;
  }, [modeProviders]);

  async function refreshSortModes() {
    setSortModesLoading(true);
    try {
      const [modes, active] = await Promise.all([sortModesList(), sortModeActiveList()]);
      if (!modes || !active) {
        setSortModesAvailable(false);
        setSortModes([]);
        setActiveModeByCli({ claude: null, codex: null, gemini: null });
        return;
      }
      setSortModesAvailable(true);
      setSortModes(modes);

      const nextActive: Record<CliKey, number | null> = {
        claude: null,
        codex: null,
        gemini: null,
      };
      for (const row of active) {
        nextActive[row.cli_key] = row.mode_id ?? null;
      }
      setActiveModeByCli(nextActive);
    } catch (err) {
      setSortModesAvailable(true);
      setSortModes([]);
      setActiveModeByCli({ claude: null, codex: null, gemini: null });
      logToConsole("error", "读取排序模板失败", { error: String(err) });
      toast(`读取排序模板失败：${String(err)}`);
    } finally {
      setSortModesLoading(false);
    }
  }

  useEffect(() => {
    void refreshSortModes();
  }, []);

  function selectEditingMode(modeId: number | null) {
    setActiveModeIdTouched(true);
    setActiveModeId(modeId);
  }

  useEffect(() => {
    if (activeModeId == null) return;
    if (sortModes.some((m) => m.id === activeModeId)) return;
    setActiveModeId(null);
  }, [activeModeId, sortModes]);

  useEffect(() => {
    if (activeModeIdTouched) return;
    if (activeModeId != null) return;
    if (sortModesAvailable !== true) return;
    if (activeModeForCurrentCli == null) return;
    if (!sortModes.some((m) => m.id === activeModeForCurrentCli)) return;
    setActiveModeId(activeModeForCurrentCli);
  }, [activeModeForCurrentCli, activeModeId, activeModeIdTouched, sortModes, sortModesAvailable]);

  useEffect(() => {
    if (activeModeId == null) {
      setModeProvidersAvailable(true);
      setModeProviders([]);
      modeProvidersRef.current = [];
      setModeProvidersLoading(false);
      return;
    }

    let cancelled = false;
    setModeProvidersLoading(true);
    sortModeProvidersList({ mode_id: activeModeId, cli_key: activeCli })
      .then((rows) => {
        if (cancelled) return;
        if (!rows) {
          setModeProvidersAvailable(false);
          setModeProviders([]);
          modeProvidersRef.current = [];
          return;
        }
        setModeProvidersAvailable(true);
        setModeProviders(rows);
        modeProvidersRef.current = rows;
      })
      .catch((err) => {
        if (cancelled) return;
        setModeProvidersAvailable(true);
        setModeProviders([]);
        modeProvidersRef.current = [];
        logToConsole("error", "读取排序模板 Provider 列表失败", {
          error: String(err),
          mode_id: activeModeId,
          cli: activeCli,
        });
        toast(`读取排序模板 Provider 列表失败：${String(err)}`);
      })
      .finally(() => {
        if (cancelled) return;
        setModeProvidersLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeCli, activeModeId]);

  useEffect(() => {
    if (!createModeDialogOpen) return;
    setCreateModeName("");
  }, [createModeDialogOpen]);

  useEffect(() => {
    if (!renameModeDialogOpen) return;
    setRenameModeName(selectedMode?.name ?? "");
  }, [renameModeDialogOpen, selectedMode]);

  async function createSortMode() {
    if (createModeSaving) return;
    const name = createModeName.trim();
    if (!name) {
      toast("模式名称不能为空");
      return;
    }

    setCreateModeSaving(true);
    try {
      const saved = await sortModeCreate({ name });
      if (!saved) {
        toast("仅在 Tauri Desktop 环境可用");
        return;
      }
      setSortModes((prev) => [...prev, saved]);
      selectEditingMode(saved.id);
      setCreateModeDialogOpen(false);
      toast("排序模板已创建");
    } catch (err) {
      logToConsole("error", "创建排序模板失败", { error: String(err) });
      toast(`创建失败：${String(err)}`);
    } finally {
      setCreateModeSaving(false);
    }
  }

  async function renameSortMode() {
    if (renameModeSaving) return;
    if (!selectedMode) return;
    const name = renameModeName.trim();
    if (!name) {
      toast("模式名称不能为空");
      return;
    }

    setRenameModeSaving(true);
    try {
      const saved = await sortModeRename({ mode_id: selectedMode.id, name });
      if (!saved) {
        toast("仅在 Tauri Desktop 环境可用");
        return;
      }
      setSortModes((prev) => prev.map((m) => (m.id === saved.id ? saved : m)));
      setRenameModeDialogOpen(false);
      toast("排序模板已更新");
    } catch (err) {
      logToConsole("error", "重命名排序模板失败", { error: String(err), mode_id: selectedMode.id });
      toast(`重命名失败：${String(err)}`);
    } finally {
      setRenameModeSaving(false);
    }
  }

  async function deleteSortMode() {
    if (!deleteModeTarget || deleteModeDeleting) return;
    setDeleteModeDeleting(true);
    try {
      const ok = await sortModeDelete({ mode_id: deleteModeTarget.id });
      if (!ok) {
        toast("仅在 Tauri Desktop 环境可用");
        return;
      }
      setSortModes((prev) => prev.filter((m) => m.id !== deleteModeTarget.id));
      setActiveModeByCli((prev) => {
        const next: Record<CliKey, number | null> = { ...prev };
        let changed = false;
        for (const cli of CLIS) {
          const key = cli.key;
          if (next[key] === deleteModeTarget.id) {
            next[key] = null;
            changed = true;
          }
        }
        return changed ? next : prev;
      });
      if (activeModeIdRef.current === deleteModeTarget.id) {
        setActiveModeId(null);
      }
      setDeleteModeTarget(null);
      toast("排序模板已删除");
    } catch (err) {
      logToConsole("error", "删除排序模板失败", {
        error: String(err),
        mode_id: deleteModeTarget.id,
      });
      toast(`删除失败：${String(err)}`);
    } finally {
      setDeleteModeDeleting(false);
    }
  }

  async function persistModeProvidersOrder(
    modeId: number,
    cliKey: CliKey,
    nextRows: SortModeProviderRow[],
    prevRows: SortModeProviderRow[]
  ) {
    if (modeProvidersSaving) return;
    setModeProvidersSaving(true);
    try {
      const saved = await sortModeProvidersSetOrder({
        mode_id: modeId,
        cli_key: cliKey,
        ordered_provider_ids: nextRows.map((row) => row.provider_id),
      });

      if (!saved) {
        toast("仅在 Tauri Desktop 环境可用");
        if (activeModeIdRef.current === modeId && activeCliRef.current === cliKey) {
          setModeProviders(prevRows);
          modeProvidersRef.current = prevRows;
        }
        return;
      }

      if (activeModeIdRef.current === modeId && activeCliRef.current === cliKey) {
        setModeProviders(saved);
        modeProvidersRef.current = saved;
        toast("模式顺序已更新");
      }
    } catch (err) {
      if (activeModeIdRef.current === modeId && activeCliRef.current === cliKey) {
        setModeProviders(prevRows);
        modeProvidersRef.current = prevRows;
      }
      logToConsole("error", "更新排序模板顺序失败", {
        error: String(err),
        mode_id: modeId,
        cli: cliKey,
      });
      toast(`模式顺序更新失败：${String(err)}`);
    } finally {
      setModeProvidersSaving(false);
    }
  }

  function addProviderToMode(providerId: number) {
    if (activeModeIdRef.current == null) return;
    const modeId = activeModeIdRef.current;
    const cliKey = activeCliRef.current;
    const prev = modeProvidersRef.current;
    if (prev.some((row) => row.provider_id === providerId)) return;
    const next: SortModeProviderRow[] = [...prev, { provider_id: providerId, enabled: true }];
    setModeProviders(next);
    modeProvidersRef.current = next;
    void persistModeProvidersOrder(modeId, cliKey, next, prev);
  }

  function removeProviderFromMode(providerId: number) {
    if (activeModeIdRef.current == null) return;
    const modeId = activeModeIdRef.current;
    const cliKey = activeCliRef.current;
    const prev = modeProvidersRef.current;
    if (!prev.some((row) => row.provider_id === providerId)) return;
    const next = prev.filter((row) => row.provider_id !== providerId);
    setModeProviders(next);
    modeProvidersRef.current = next;
    void persistModeProvidersOrder(modeId, cliKey, next, prev);
  }

  async function setModeProviderEnabled(providerId: number, enabled: boolean) {
    if (modeProvidersSaving) return;

    const modeId = activeModeIdRef.current;
    if (modeId == null) return;

    const cliKey = activeCliRef.current;
    const prevRows = modeProvidersRef.current;
    const existing = prevRows.find((row) => row.provider_id === providerId) ?? null;
    if (!existing) return;
    if (existing.enabled === enabled) return;

    const nextRows = prevRows.map((row) =>
      row.provider_id === providerId ? { ...row, enabled } : row
    );
    setModeProviders(nextRows);
    modeProvidersRef.current = nextRows;

    setModeProvidersSaving(true);
    try {
      const saved = await sortModeProviderSetEnabled({
        mode_id: modeId,
        cli_key: cliKey,
        provider_id: providerId,
        enabled,
      });

      if (!saved) {
        toast("仅在 Tauri Desktop 环境可用");
        if (activeModeIdRef.current === modeId && activeCliRef.current === cliKey) {
          setModeProviders(prevRows);
          modeProvidersRef.current = prevRows;
        }
        return;
      }

      if (activeModeIdRef.current === modeId && activeCliRef.current === cliKey) {
        const finalRows = nextRows.map((row) => (row.provider_id === providerId ? saved : row));
        setModeProviders(finalRows);
        modeProvidersRef.current = finalRows;
        toast(saved.enabled ? "模板已启用 Provider" : "模板已禁用 Provider");
      }
    } catch (err) {
      if (activeModeIdRef.current === modeId && activeCliRef.current === cliKey) {
        setModeProviders(prevRows);
        modeProvidersRef.current = prevRows;
      }
      logToConsole("error", "更新排序模板 Provider 启用状态失败", {
        error: String(err),
        mode_id: modeId,
        cli: cliKey,
        provider_id: providerId,
        enabled,
      });
      toast(`模板启用状态更新失败：${String(err)}`);
    } finally {
      setModeProvidersSaving(false);
    }
  }

  function handleModeDragEnd(event: DragEndEvent) {
    const modeId = activeModeIdRef.current;
    if (modeId == null) return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const prevRows = modeProvidersRef.current;
    const oldIndex = prevRows.findIndex((row) => row.provider_id === active.id);
    const newIndex = prevRows.findIndex((row) => row.provider_id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const nextRows = arrayMove(prevRows, oldIndex, newIndex);
    setModeProviders(nextRows);
    modeProvidersRef.current = nextRows;
    void persistModeProvidersOrder(modeId, activeCliRef.current, nextRows, prevRows);
  }

  return (
    <>
      <div className="flex flex-col gap-4 lg:min-h-0 lg:flex-1">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              onClick={() => selectEditingMode(null)}
              variant={activeModeId == null ? "primary" : "secondary"}
              size="sm"
            >
              Default
            </Button>
            {sortModes.map((mode) => (
              <Button
                key={mode.id}
                onClick={() => selectEditingMode(mode.id)}
                variant={activeModeId === mode.id ? "primary" : "secondary"}
                size="sm"
              >
                {mode.name}
              </Button>
            ))}
            <span className="text-xs text-slate-500">
              {sortModesLoading
                ? "加载中…"
                : sortModesAvailable === false
                  ? "仅在 Tauri Desktop 环境可用"
                  : `共 ${sortModes.length + 1} 个`}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              onClick={() => void refreshSortModes()}
              variant="secondary"
              size="sm"
              disabled={sortModesLoading}
            >
              刷新
            </Button>
            <Button onClick={() => setCreateModeDialogOpen(true)} variant="primary" size="sm">
              新建排序模板
            </Button>
            {selectedMode ? (
              <>
                <Button onClick={() => setRenameModeDialogOpen(true)} variant="secondary" size="sm">
                  重命名
                </Button>
                <Button
                  onClick={() => setDeleteModeTarget(selectedMode)}
                  variant="secondary"
                  size="sm"
                  className="hover:!bg-rose-50 hover:!text-rose-600"
                >
                  删除
                </Button>
              </>
            ) : null}
          </div>
        </div>

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
          <span className="text-xs text-slate-500">选择要配置的 CLI</span>
        </div>

        <div className="grid gap-4 lg:min-h-0 lg:flex-1 lg:grid-cols-2">
          <Card padding="sm" className="flex flex-col lg:min-h-0">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-sm font-semibold">默认顺序 · {currentCli.name}</div>
                <div className="mt-1 text-xs text-slate-500">
                  默认顺序来自「供应商」视图拖拽（基础顺序）；Default
                  路由仍受「供应商」启用开关影响。
                </div>
              </div>
            </div>

            <div className="mt-3 lg:min-h-0 lg:flex-1 lg:overflow-auto lg:pr-1">
              {providersLoading ? (
                <div className="text-sm text-slate-600">加载中…</div>
              ) : providers.length === 0 ? (
                <div className="text-sm text-slate-600">
                  暂无 Provider。请先在「供应商」视图添加。
                </div>
              ) : (
                <div className="space-y-2">
                  {providers.map((p) => {
                    const modeSelected = activeModeId != null;
                    const modeUnavailable = modeProvidersAvailable === false;
                    const modeDisabled =
                      !modeSelected ||
                      modeUnavailable ||
                      modeProvidersLoading ||
                      modeProvidersSaving;
                    const inMode = modeSelected && !modeUnavailable && modeProviderIdSet.has(p.id);
                    const buttonText = inMode
                      ? "已加入"
                      : modeProvidersLoading
                        ? "加载中…"
                        : "加入";
                    const buttonTitle = !modeSelected
                      ? "请选择一个自定义排序模板后再加入"
                      : modeUnavailable
                        ? "仅在 Tauri Desktop 环境可用"
                        : modeProvidersLoading
                          ? "右侧列表加载中…"
                          : undefined;
                    return (
                      <Card
                        key={p.id}
                        padding="sm"
                        className="flex items-center justify-between gap-3 shadow-none"
                      >
                        <div className="min-w-0">
                          <div className="flex min-w-0 items-center gap-2">
                            <div className="truncate text-sm font-semibold">{p.name}</div>
                            {!p.enabled ? (
                              <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 font-mono text-[10px] text-slate-600">
                                Default 关闭
                              </span>
                            ) : null}
                          </div>
                          <div className="truncate text-xs text-slate-500">
                            {providerBaseUrlSummary(p)}
                          </div>
                        </div>
                        <Button
                          onClick={() => addProviderToMode(p.id)}
                          variant="secondary"
                          size="sm"
                          disabled={modeDisabled || inMode}
                          title={buttonTitle}
                        >
                          {buttonText}
                        </Button>
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>
          </Card>

          <Card padding="sm" className="flex flex-col lg:min-h-0">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-sm font-semibold">
                  编辑模板：{selectedMode ? selectedMode.name : "未选择"} · {currentCli.name}
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  {activeModeId == null
                    ? "请选择一个自定义排序模板进行编辑；Default 的顺序请在「供应商」视图调整。"
                    : "严格子集：激活后仅使用该列表中「已启用」的 Provider 参与路由（不受「供应商」启用开关影响）。"}
                </div>
              </div>
            </div>

            <div className="mt-3 lg:min-h-0 lg:flex-1 lg:overflow-auto lg:pr-1">
              {activeModeId == null ? (
                <div className="text-sm text-slate-600">请选择一个自定义排序模板进行编辑。</div>
              ) : modeProvidersLoading ? (
                <div className="text-sm text-slate-600">加载中…</div>
              ) : modeProvidersAvailable === false ? (
                <div className="text-sm text-slate-600">仅在 Tauri Desktop 环境可用</div>
              ) : modeProviders.length === 0 ? (
                <div className="space-y-2">
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                    当前排序模板在 {currentCli.name} 下未配置 Provider；若激活将导致无可用
                    Provider。
                  </div>
                  <div className="text-sm text-slate-600">
                    请从左侧「默认顺序」列表点击「加入」。
                  </div>
                </div>
              ) : (
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleModeDragEnd}
                >
                  <SortableContext
                    items={modeProviders.map((row) => row.provider_id)}
                    strategy={verticalListSortingStrategy}
                  >
                    <div className="space-y-2">
                      {modeProviders.map((row) => (
                        <SortableModeProviderRow
                          key={row.provider_id}
                          providerId={row.provider_id}
                          provider={providersById[row.provider_id] ?? null}
                          modeEnabled={row.enabled}
                          disabled={modeProvidersSaving}
                          onToggleEnabled={setModeProviderEnabled}
                          onRemove={removeProviderFromMode}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
              )}
            </div>
          </Card>
        </div>
      </div>

      <Dialog
        open={createModeDialogOpen}
        onOpenChange={(open) => setCreateModeDialogOpen(open)}
        title="新建排序模板"
        description="Default 为系统内置模板；自定义排序模板用于保存可切换的 Provider 路由顺序副本（不改默认顺序）。"
        className="max-w-lg"
      >
        <div className="space-y-4">
          <FormField label="名称" hint="例如：工作 / 生活">
            <Input
              value={createModeName}
              onChange={(e) => setCreateModeName(e.currentTarget.value)}
              placeholder="工作"
            />
          </FormField>

          <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
            <Button
              onClick={() => setCreateModeDialogOpen(false)}
              variant="secondary"
              disabled={createModeSaving}
            >
              取消
            </Button>
            <Button onClick={createSortMode} variant="primary" disabled={createModeSaving}>
              {createModeSaving ? "创建中…" : "创建"}
            </Button>
          </div>
        </div>
      </Dialog>

      <Dialog
        open={renameModeDialogOpen}
        onOpenChange={(open) => setRenameModeDialogOpen(open)}
        title={selectedMode ? `重命名排序模板：${selectedMode.name}` : "重命名排序模板"}
        description="仅支持重命名自定义排序模板；Default 为系统内置模板。"
        className="max-w-lg"
      >
        <div className="space-y-4">
          <FormField label="名称">
            <Input
              value={renameModeName}
              onChange={(e) => setRenameModeName(e.currentTarget.value)}
            />
          </FormField>

          <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
            <Button
              onClick={() => setRenameModeDialogOpen(false)}
              variant="secondary"
              disabled={renameModeSaving}
            >
              取消
            </Button>
            <Button
              onClick={renameSortMode}
              variant="primary"
              disabled={renameModeSaving || !selectedMode}
            >
              {renameModeSaving ? "保存中…" : "保存"}
            </Button>
          </div>
        </div>
      </Dialog>

      <Dialog
        open={!!deleteModeTarget}
        onOpenChange={(open) => {
          if (!open && deleteModeDeleting) return;
          if (!open) setDeleteModeTarget(null);
        }}
        title="确认删除排序模板"
        description={deleteModeTarget ? `将删除：${deleteModeTarget.name}` : undefined}
        className="max-w-lg"
      >
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button
            onClick={() => setDeleteModeTarget(null)}
            variant="secondary"
            disabled={deleteModeDeleting}
          >
            取消
          </Button>
          <Button onClick={deleteSortMode} variant="primary" disabled={deleteModeDeleting}>
            {deleteModeDeleting ? "删除中…" : "确认删除"}
          </Button>
        </div>
      </Dialog>
    </>
  );
}

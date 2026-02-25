import { useEffect, useMemo, useState } from "react";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  type DragEndEvent,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { toast } from "sonner";
import { logToConsole } from "../../services/consoleLog";
import type { CliKey } from "../../services/providers";
import { oauthAccountGet, type OAuthAccountSummary } from "../../services/oauthAccounts";
import { Button } from "../../ui/Button";
import { Dialog } from "../../ui/Dialog";
import { FormField } from "../../ui/FormField";
import { Input } from "../../ui/Input";
import { Spinner } from "../../ui/Spinner";
import {
  useOAuthAccountDeleteMutation,
  useOAuthAccountForceRefreshMutation,
  useOAuthAccountManualAddMutation,
  useOAuthAccountUpsertMutation,
  useOAuthAccountsEventBridge,
  useOAuthAccountsListQuery,
  useOAuthStartLoginMutation,
} from "../../query/oauthAccounts";
import { SortableOAuthAccountCard } from "./SortableOAuthAccountCard";

export type OAuthAccountsPanelProps = {
  cliKey: CliKey;
  active?: boolean;
  onPickAccount?: (account: OAuthAccountSummary) => void;
  onAdded?: (account: OAuthAccountSummary) => void;
  pickLabel?: string;
  showAddSection?: boolean;
  showAccountsList?: boolean;
};

type OAuthTokenFieldConfig = {
  manualHint: string;
  accessTokenPlaceholder: string;
  refreshTokenPlaceholder: string;
  idTokenPlaceholder?: string;
  tokenUriPlaceholder?: string;
  expiresAtLabel: string;
  expiresAtPlaceholder: string;
  lastRefreshLabel?: string;
  lastRefreshPlaceholder?: string;
  editDescription: string;
  editAccessTokenPlaceholder: string;
  editRefreshTokenPlaceholder: string;
  editIdTokenPlaceholder?: string;
  editTokenUriPlaceholder?: string;
  editExpiresAtPlaceholder: string;
  editLastRefreshPlaceholder?: string;
  showIdToken: boolean;
  showTokenUri: boolean;
  showLastRefresh: boolean;
};

function oauthTokenFieldConfig(cliKey: CliKey): OAuthTokenFieldConfig {
  if (cliKey === "codex") {
    return {
      manualHint:
        "按 ~/.codex/auth.json 录入：tokens.access_token、tokens.id_token、tokens.refresh_token、last_refresh。",
      accessTokenPlaceholder: "tokens.access_token",
      refreshTokenPlaceholder: "tokens.refresh_token（可选）",
      idTokenPlaceholder: "tokens.id_token（可选）",
      tokenUriPlaceholder: "token_uri（可选）",
      expiresAtLabel: "过期时间戳（可选）",
      expiresAtPlaceholder: "过期时间戳（可选）",
      lastRefreshLabel: "last_refresh（可选）",
      lastRefreshPlaceholder: "last_refresh（ISO/时间戳，可选）",
      editDescription: "编辑 Codex OAuth 令牌字段；留空表示不修改该项。",
      editAccessTokenPlaceholder: "tokens.access_token（留空不修改）",
      editRefreshTokenPlaceholder: "tokens.refresh_token（留空不修改）",
      editIdTokenPlaceholder: "tokens.id_token（留空不修改）",
      editTokenUriPlaceholder: "token_uri（留空不修改）",
      editExpiresAtPlaceholder: "过期时间戳（留空不修改）",
      editLastRefreshPlaceholder: "编辑 last_refresh（ISO/时间戳，可选）",
      showIdToken: true,
      showTokenUri: true,
      showLastRefresh: true,
    };
  }

  if (cliKey === "gemini") {
    return {
      manualHint: "按 ~/.gemini/oauth_creds.json 录入：access_token、refresh_token、expiry_date。",
      accessTokenPlaceholder: "access_token",
      refreshTokenPlaceholder: "refresh_token（可选）",
      expiresAtLabel: "expiry_date（可选）",
      expiresAtPlaceholder: "expiry_date（毫秒/秒/ISO，可选）",
      editDescription: "编辑 Gemini OAuth 令牌字段；留空表示不修改该项。",
      editAccessTokenPlaceholder: "access_token（留空不修改）",
      editRefreshTokenPlaceholder: "refresh_token（留空不修改）",
      editExpiresAtPlaceholder: "编辑 expiry_date（毫秒/秒/ISO，可选）",
      showIdToken: false,
      showTokenUri: false,
      showLastRefresh: false,
    };
  }

  return {
    manualHint: "按 Claude OAuth token 录入：access_token、refresh_token、expired、last_refresh。",
    accessTokenPlaceholder: "access_token",
    refreshTokenPlaceholder: "refresh_token（可选）",
    expiresAtLabel: "expired（可选）",
    expiresAtPlaceholder: "expired（ISO/时间戳，可选）",
    lastRefreshLabel: "last_refresh（可选）",
    lastRefreshPlaceholder: "last_refresh（ISO/时间戳，可选）",
    editDescription: "编辑 Claude OAuth 令牌字段；留空表示不修改该项。",
    editAccessTokenPlaceholder: "access_token（留空不修改）",
    editRefreshTokenPlaceholder: "refresh_token（留空不修改）",
    editExpiresAtPlaceholder: "编辑 expired（ISO/时间戳，可选）",
    editLastRefreshPlaceholder: "编辑 last_refresh（ISO/时间戳，可选）",
    showIdToken: false,
    showTokenUri: false,
    showLastRefresh: true,
  };
}

function loadOrderedIds(storageKey: string): number[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((value) => Number.isInteger(value) && value > 0);
  } catch {
    return [];
  }
}

function saveOrderedIds(storageKey: string, ids: number[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(ids));
  } catch {
    // localStorage write failures should not block UI actions
  }
}

function sameIds(a: number[], b: number[]) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function parseOptionalUnixSecondsInput(raw: string): number | null {
  const value = raw.trim();
  if (!value) return null;

  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    if (numeric <= 0) return Number.NaN;
    // Gemini oauth_creds.json stores expiry_date in milliseconds.
    return numeric >= 1_000_000_000_000 ? Math.floor(numeric / 1000) : Math.floor(numeric);
  }

  const millis = Date.parse(value);
  if (!Number.isFinite(millis) || millis <= 0) {
    return Number.NaN;
  }
  return Math.floor(millis / 1000);
}

export function OAuthAccountsPanel({
  cliKey,
  active = true,
  onPickAccount,
  onAdded,
  pickLabel = "用于当前 Provider",
  showAddSection = true,
  showAccountsList = true,
}: OAuthAccountsPanelProps) {
  const query = useOAuthAccountsListQuery(cliKey, { enabled: active && showAccountsList });
  const startLoginMutation = useOAuthStartLoginMutation();
  const manualAddMutation = useOAuthAccountManualAddMutation();
  const upsertMutation = useOAuthAccountUpsertMutation();
  const refreshMutation = useOAuthAccountForceRefreshMutation();
  const deleteMutation = useOAuthAccountDeleteMutation();
  const loginProgressByCli = useOAuthAccountsEventBridge({ enabled: active });
  const loginStep = loginProgressByCli[cliKey] ?? null;
  const orderStorageKey = `oauth-accounts-order:${cliKey}`;
  const tokenFields = useMemo(() => oauthTokenFieldConfig(cliKey), [cliKey]);
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  );

  const [oauthLabel, setOauthLabel] = useState("");
  const [manualLabel, setManualLabel] = useState("");
  const [manualAccessToken, setManualAccessToken] = useState("");
  const [manualIdToken, setManualIdToken] = useState("");
  const [manualRefreshToken, setManualRefreshToken] = useState("");
  const [manualTokenUri, setManualTokenUri] = useState("");
  const [manualExpiresAt, setManualExpiresAt] = useState("");
  const [manualLastRefresh, setManualLastRefresh] = useState("");
  const [orderedIds, setOrderedIds] = useState<number[]>([]);
  const [editTarget, setEditTarget] = useState<OAuthAccountSummary | null>(null);
  const [editAccessToken, setEditAccessToken] = useState("");
  const [editRefreshToken, setEditRefreshToken] = useState("");
  const [editIdToken, setEditIdToken] = useState("");
  const [editTokenUri, setEditTokenUri] = useState("");
  const [editExpiresAt, setEditExpiresAt] = useState("");
  const [editLastRefresh, setEditLastRefresh] = useState("");
  const [editLoading, setEditLoading] = useState(false);

  useEffect(() => {
    setOrderedIds(loadOrderedIds(orderStorageKey));
  }, [orderStorageKey]);

  useEffect(() => {
    const existingIds = new Set((query.data ?? []).map((row) => row.id));
    setOrderedIds((prev) => {
      if (prev.length === 0) return prev;
      const next = prev.filter((id, index) => existingIds.has(id) && prev.indexOf(id) === index);
      if (sameIds(prev, next)) return prev;
      saveOrderedIds(orderStorageKey, next);
      return next;
    });
  }, [orderStorageKey, query.data]);

  const rows = useMemo<OAuthAccountSummary[]>(() => {
    const data = query.data ?? [];
    if (orderedIds.length === 0) return data;

    const byId = new Map<number, OAuthAccountSummary>();
    for (const row of data) {
      byId.set(row.id, row);
    }

    const ordered: OAuthAccountSummary[] = [];
    for (const id of orderedIds) {
      const row = byId.get(id);
      if (!row) continue;
      ordered.push(row);
      byId.delete(id);
    }
    for (const row of data) {
      if (!byId.has(row.id)) continue;
      ordered.push(row);
      byId.delete(row.id);
    }
    return ordered;
  }, [orderedIds, query.data]);

  function persistOrderedIds(ids: number[]) {
    setOrderedIds(ids);
    saveOrderedIds(orderStorageKey, ids);
  }

  async function onStartLogin() {
    const label = oauthLabel.trim();
    if (!label) {
      toast("请输入账号标签");
      return;
    }
    try {
      const account = await startLoginMutation.mutateAsync({ cliKey, label });
      if (!account) {
        toast("仅在 Tauri Desktop 环境可用");
        return;
      }
      setOauthLabel("");
      onAdded?.(account);
      toast(`OAuth 账号已添加：${account.label}`);
    } catch (err) {
      logToConsole("error", "OAuth 登录失败", { cliKey, error: String(err) });
      toast(`OAuth 登录失败：${String(err)}`);
    }
  }

  async function onManualAdd() {
    const label = manualLabel.trim();
    const accessToken = manualAccessToken.trim();
    if (!label) {
      toast("手动添加需要账号标签");
      return;
    }
    if (!accessToken) {
      toast("手动添加需要 Access Token");
      return;
    }
    const expiresAt = parseOptionalUnixSecondsInput(manualExpiresAt);
    if (Number.isNaN(expiresAt)) {
      toast("过期时间戳必须为正整数");
      return;
    }
    const lastRefreshedAt = tokenFields.showLastRefresh
      ? parseOptionalUnixSecondsInput(manualLastRefresh)
      : null;
    if (tokenFields.showLastRefresh && Number.isNaN(lastRefreshedAt)) {
      toast("last_refresh 必须是 Unix 秒级时间戳或 ISO 时间");
      return;
    }
    try {
      const account = await manualAddMutation.mutateAsync({
        cliKey,
        label,
        accessToken,
        refreshToken: manualRefreshToken.trim() || null,
        idToken: tokenFields.showIdToken ? manualIdToken.trim() || null : null,
        tokenUri: tokenFields.showTokenUri ? manualTokenUri.trim() || null : null,
        expiresAt,
        lastRefreshedAt,
      });
      if (!account) {
        toast("仅在 Tauri Desktop 环境可用");
        return;
      }
      setManualLabel("");
      setManualAccessToken("");
      setManualIdToken("");
      setManualRefreshToken("");
      setManualTokenUri("");
      setManualExpiresAt("");
      setManualLastRefresh("");
      onAdded?.(account);
      toast(`手动账号已添加：${account.label}`);
    } catch (err) {
      logToConsole("error", "手动添加 OAuth 账号失败", { cliKey, error: String(err) });
      toast(`手动添加失败：${String(err)}`);
    }
  }

  async function onForceRefresh(account: OAuthAccountSummary) {
    try {
      const updated = await refreshMutation.mutateAsync({ id: account.id });
      if (!updated) {
        toast("仅在 Tauri Desktop 环境可用");
        return;
      }
      toast("已刷新令牌");
    } catch (err) {
      logToConsole("error", "刷新 OAuth 令牌失败", { id: account.id, error: String(err) });
      toast(`刷新失败：${String(err)}`);
    }
  }

  async function onBrowserLogin(account: OAuthAccountSummary) {
    try {
      const updated = await startLoginMutation.mutateAsync({
        accountId: account.id,
        cliKey,
        label: account.label,
        providerType: account.provider_type,
      });
      if (!updated) {
        toast("仅在 Tauri Desktop 环境可用");
        return;
      }
      toast(`已通过浏览器更新令牌：${updated.label}`);
    } catch (err) {
      logToConsole("error", "浏览器登录 OAuth 失败", { id: account.id, error: String(err) });
      toast(`浏览器登录失败：${String(err)}`);
    }
  }

  async function onDelete(account: OAuthAccountSummary) {
    try {
      const ok = await deleteMutation.mutateAsync({ cliKey, id: account.id });
      if (!ok) {
        toast("仅在 Tauri Desktop 环境可用");
        return;
      }
      toast(`已删除账号：${account.label}`);
    } catch (err) {
      logToConsole("error", "删除 OAuth 账号失败", { id: account.id, error: String(err) });
      toast(`删除失败：${String(err)}`);
    }
  }

  function openEditDialog(account: OAuthAccountSummary) {
    setEditTarget(account);
    setEditAccessToken("");
    setEditRefreshToken("");
    setEditIdToken("");
    setEditTokenUri("");
    setEditExpiresAt("");
    setEditLastRefresh("");
  }

  useEffect(() => {
    const editId = editTarget?.id ?? null;
    if (editId == null) {
      setEditLoading(false);
      return;
    }

    let cancelled = false;
    setEditLoading(true);
    void oauthAccountGet(editId)
      .then((detail) => {
        if (cancelled || !detail) return;
        setEditAccessToken(detail.access_token ?? "");
        setEditRefreshToken(detail.refresh_token ?? "");
        setEditIdToken(detail.id_token ?? "");
        setEditTokenUri(detail.token_uri ?? "");
        setEditExpiresAt(detail.expires_at != null ? String(detail.expires_at) : "");
        setEditLastRefresh(
          detail.last_refreshed_at != null ? String(detail.last_refreshed_at) : ""
        );
      })
      .catch((err) => {
        if (cancelled) return;
        toast(`读取 OAuth 详情失败：${String(err)}`);
      })
      .finally(() => {
        if (cancelled) return;
        setEditLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [editTarget?.id]);

  async function onSaveEdit() {
    if (!editTarget) return;
    const expiresAt = parseOptionalUnixSecondsInput(editExpiresAt);
    if (Number.isNaN(expiresAt)) {
      toast("过期时间戳必须为正整数");
      return;
    }
    const lastRefreshedAt = tokenFields.showLastRefresh
      ? parseOptionalUnixSecondsInput(editLastRefresh)
      : null;
    if (tokenFields.showLastRefresh && Number.isNaN(lastRefreshedAt)) {
      toast("last_refresh 必须是 Unix 秒级时间戳或 ISO 时间");
      return;
    }
    try {
      const updated = await upsertMutation.mutateAsync({
        accountId: editTarget.id,
        cliKey: editTarget.cli_key,
        providerType: editTarget.provider_type,
        label: editTarget.label,
        accessToken: editAccessToken.trim() || null,
        refreshToken: editRefreshToken.trim() || null,
        idToken: tokenFields.showIdToken ? editIdToken.trim() || null : null,
        tokenUri: tokenFields.showTokenUri ? editTokenUri.trim() || null : null,
        expiresAt,
        lastRefreshedAt,
        refreshLeadSeconds: editTarget.refresh_lead_s,
        status: editTarget.status,
      });
      if (!updated) {
        toast("仅在 Tauri Desktop 环境可用");
        return;
      }
      setEditTarget(null);
      toast(`账号已更新：${updated.label}`);
    } catch (err) {
      logToConsole("error", "更新 OAuth 账号失败", { id: editTarget.id, error: String(err) });
      toast(`更新失败：${String(err)}`);
    }
  }

  function onDragEnd(event: DragEndEvent) {
    const { active: dragActive, over } = event;
    if (!over || dragActive.id === over.id) return;

    const oldIndex = rows.findIndex((row) => row.id === dragActive.id);
    const newIndex = rows.findIndex((row) => row.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const nextRows = arrayMove(rows, oldIndex, newIndex);
    persistOrderedIds(nextRows.map((row) => row.id));
  }

  return (
    <div className="space-y-4">
      {showAddSection ? (
        <div className="grid gap-3 lg:grid-cols-2">
          <FormField label="浏览器登录添加" hint="填写标签后点击登录，按浏览器流程完成授权。">
            <div className="flex flex-wrap items-center gap-2">
              <Input
                value={oauthLabel}
                onChange={(e) => setOauthLabel(e.currentTarget.value)}
                placeholder="例如：Work Gmail"
                disabled={startLoginMutation.isPending}
              />
              <Button
                size="sm"
                variant="secondary"
                onClick={onStartLogin}
                disabled={startLoginMutation.isPending}
              >
                {startLoginMutation.isPending ? "登录中…" : "OAuth 登录添加"}
              </Button>
            </div>
            {loginStep ? (
              <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                登录进度：
                {loginStep === "waiting_callback"
                  ? "等待浏览器回调"
                  : loginStep === "exchanging"
                    ? "交换令牌中"
                    : loginStep === "done"
                      ? "完成"
                      : "失败"}
              </div>
            ) : null}
          </FormField>

          <FormField label="手动添加" hint={tokenFields.manualHint}>
            <div className="grid gap-2 sm:grid-cols-2">
              <Input
                value={manualLabel}
                onChange={(e) => setManualLabel(e.currentTarget.value)}
                placeholder="账号标签"
              />
              <Input
                value={manualAccessToken}
                onChange={(e) => setManualAccessToken(e.currentTarget.value)}
                placeholder={tokenFields.accessTokenPlaceholder}
              />
              <Input
                value={manualRefreshToken}
                onChange={(e) => setManualRefreshToken(e.currentTarget.value)}
                placeholder={tokenFields.refreshTokenPlaceholder}
              />
              {tokenFields.showIdToken ? (
                <Input
                  value={manualIdToken}
                  onChange={(e) => setManualIdToken(e.currentTarget.value)}
                  placeholder={tokenFields.idTokenPlaceholder}
                />
              ) : null}
              <Input
                value={manualExpiresAt}
                onChange={(e) => setManualExpiresAt(e.currentTarget.value)}
                placeholder={tokenFields.expiresAtPlaceholder}
              />
              {tokenFields.showTokenUri ? (
                <Input
                  value={manualTokenUri}
                  onChange={(e) => setManualTokenUri(e.currentTarget.value)}
                  placeholder={tokenFields.tokenUriPlaceholder}
                  className="sm:col-span-2"
                />
              ) : null}
              {tokenFields.showLastRefresh ? (
                <Input
                  value={manualLastRefresh}
                  onChange={(e) => setManualLastRefresh(e.currentTarget.value)}
                  placeholder={tokenFields.lastRefreshPlaceholder}
                  className="sm:col-span-2"
                />
              ) : null}
            </div>
            <div className="mt-2">
              <Button size="sm" variant="secondary" onClick={onManualAdd}>
                手动添加
              </Button>
            </div>
          </FormField>
        </div>
      ) : null}

      {showAccountsList ? (
        <div className="space-y-2">
          <div className="text-sm font-medium text-slate-700 dark:text-slate-300">账号列表</div>
          <div className="max-h-[380px] overflow-auto">
            {query.isFetching && rows.length === 0 ? (
              <div className="flex items-center gap-2 px-4 py-4 text-sm text-slate-600 dark:text-slate-400">
                <Spinner size="sm" />
                加载中…
              </div>
            ) : rows.length === 0 ? (
              <div className="px-4 py-4 text-sm text-slate-600 dark:text-slate-400">
                暂无 OAuth 账号。
              </div>
            ) : (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={onDragEnd}
              >
                <SortableContext
                  items={rows.map((row) => row.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="space-y-3 p-3">
                    {rows.map((row) => (
                      <SortableOAuthAccountCard
                        key={row.id}
                        account={row}
                        onPickAccount={onPickAccount}
                        pickLabel={pickLabel}
                        onBrowserLogin={(account) => void onBrowserLogin(account)}
                        onForceRefresh={(account) => void onForceRefresh(account)}
                        onEdit={openEditDialog}
                        onDelete={(account) => void onDelete(account)}
                        browserLoginPending={startLoginMutation.isPending}
                        refreshPending={refreshMutation.isPending}
                        editPending={upsertMutation.isPending}
                        deletePending={deleteMutation.isPending}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            )}
          </div>
        </div>
      ) : null}

      <Dialog
        open={editTarget != null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen && upsertMutation.isPending) return;
          if (!nextOpen) setEditTarget(null);
        }}
        title={editTarget ? `编辑 OAuth 账号 · ${editTarget.label}` : "编辑 OAuth 账号"}
        description={tokenFields.editDescription}
        className="max-w-lg"
      >
        <div className="space-y-3">
          <FormField label="Access Token（可选）">
            <Input
              value={editAccessToken}
              onChange={(e) => setEditAccessToken(e.currentTarget.value)}
              placeholder={tokenFields.editAccessTokenPlaceholder}
              disabled={upsertMutation.isPending || editLoading}
            />
          </FormField>
          <FormField label="Refresh Token（可选）">
            <Input
              value={editRefreshToken}
              onChange={(e) => setEditRefreshToken(e.currentTarget.value)}
              placeholder={tokenFields.editRefreshTokenPlaceholder}
              disabled={upsertMutation.isPending || editLoading}
            />
          </FormField>
          {tokenFields.showIdToken ? (
            <FormField label="ID Token（可选）">
              <Input
                value={editIdToken}
                onChange={(e) => setEditIdToken(e.currentTarget.value)}
                placeholder={tokenFields.editIdTokenPlaceholder}
                disabled={upsertMutation.isPending || editLoading}
              />
            </FormField>
          ) : null}
          {tokenFields.showTokenUri ? (
            <FormField label="Token URI（可选）">
              <Input
                value={editTokenUri}
                onChange={(e) => setEditTokenUri(e.currentTarget.value)}
                placeholder={tokenFields.editTokenUriPlaceholder}
                disabled={upsertMutation.isPending || editLoading}
              />
            </FormField>
          ) : null}
          <FormField label={tokenFields.expiresAtLabel}>
            <Input
              value={editExpiresAt}
              onChange={(e) => setEditExpiresAt(e.currentTarget.value)}
              placeholder={tokenFields.editExpiresAtPlaceholder}
              disabled={upsertMutation.isPending || editLoading}
            />
          </FormField>
          {tokenFields.showLastRefresh ? (
            <FormField label={tokenFields.lastRefreshLabel ?? "last_refresh（可选）"}>
              <Input
                value={editLastRefresh}
                onChange={(e) => setEditLastRefresh(e.currentTarget.value)}
                placeholder={tokenFields.editLastRefreshPlaceholder}
                disabled={upsertMutation.isPending || editLoading}
              />
            </FormField>
          ) : null}
          <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-3 dark:border-slate-700">
            <Button
              variant="secondary"
              onClick={() => setEditTarget(null)}
              disabled={upsertMutation.isPending || editLoading}
            >
              取消
            </Button>
            <Button
              variant="primary"
              onClick={onSaveEdit}
              disabled={upsertMutation.isPending || editLoading}
            >
              {editLoading ? "读取中…" : upsertMutation.isPending ? "保存中…" : "保存修改"}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}

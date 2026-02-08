// Usage:
// - Manages circuit breaker queries, open-circuit derivation, auto-refresh timer,
//   and provider reset logic for the HomePage.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { logToConsole } from "../../../services/consoleLog";
import { hasTauriRuntime } from "../../../services/tauriInvoke";
import type { OpenCircuitRow } from "../../../components/ProviderCircuitBadge";
import { gatewayKeys } from "../../../query/keys";
import {
  useGatewayCircuitResetProviderMutation,
  useGatewayCircuitStatusQuery,
} from "../../../query/gateway";
import { useProvidersListQuery } from "../../../query/providers";

export type HomeCircuitState = {
  openCircuits: OpenCircuitRow[];
  resettingProviderIds: Set<number>;
  handleResetProvider: (providerId: number) => void;
};

export function useHomeCircuitState(): HomeCircuitState {
  const tauriRuntime = hasTauriRuntime();
  const queryClient = useQueryClient();

  const [resettingProviderIds, setResettingProviderIds] = useState<Set<number>>(new Set());
  const openCircuitsAutoRefreshTimerRef = useRef<number | null>(null);

  const resetCircuitProviderMutation = useGatewayCircuitResetProviderMutation();
  const claudeCircuitsQuery = useGatewayCircuitStatusQuery("claude");
  const codexCircuitsQuery = useGatewayCircuitStatusQuery("codex");
  const geminiCircuitsQuery = useGatewayCircuitStatusQuery("gemini");
  const claudeProvidersQuery = useProvidersListQuery("claude");
  const codexProvidersQuery = useProvidersListQuery("codex");
  const geminiProvidersQuery = useProvidersListQuery("gemini");

  const openCircuits = useMemo<OpenCircuitRow[]>(() => {
    if (!tauriRuntime) return [];

    const specs = [
      {
        cliKey: "claude" as const,
        circuits: claudeCircuitsQuery.data ?? [],
        providers: claudeProvidersQuery.data ?? [],
      },
      {
        cliKey: "codex" as const,
        circuits: codexCircuitsQuery.data ?? [],
        providers: codexProvidersQuery.data ?? [],
      },
      {
        cliKey: "gemini" as const,
        circuits: geminiCircuitsQuery.data ?? [],
        providers: geminiProvidersQuery.data ?? [],
      },
    ];

    const rows: OpenCircuitRow[] = [];
    for (const spec of specs) {
      const unavailable = spec.circuits.filter(
        (row) =>
          row.state === "OPEN" ||
          (row.cooldown_until != null && Number.isFinite(row.cooldown_until))
      );
      if (unavailable.length === 0) continue;

      const providerNameById: Record<number, string> = {};
      for (const provider of spec.providers) {
        const name = provider.name?.trim();
        if (!name) continue;
        providerNameById[provider.id] = name;
      }

      for (const row of unavailable) {
        const cooldownUntil = row.cooldown_until ?? null;
        if (row.state !== "OPEN") {
          rows.push({
            cli_key: spec.cliKey,
            provider_id: row.provider_id,
            provider_name: providerNameById[row.provider_id] ?? "未知",
            open_until: cooldownUntil,
          });
          continue;
        }

        const openUntil = row.open_until ?? null;
        const until =
          openUntil == null
            ? cooldownUntil
            : cooldownUntil == null
              ? openUntil
              : Math.max(openUntil, cooldownUntil);

        rows.push({
          cli_key: spec.cliKey,
          provider_id: row.provider_id,
          provider_name: providerNameById[row.provider_id] ?? "未知",
          open_until: until,
        });
      }
    }
    rows.sort((a, b) => {
      const aUntil = a.open_until ?? Number.POSITIVE_INFINITY;
      const bUntil = b.open_until ?? Number.POSITIVE_INFINITY;
      if (aUntil !== bUntil) return aUntil - bUntil;
      if (a.cli_key !== b.cli_key) return a.cli_key.localeCompare(b.cli_key);
      return a.provider_name.localeCompare(b.provider_name);
    });

    return rows;
  }, [
    claudeCircuitsQuery.data,
    claudeProvidersQuery.data,
    codexCircuitsQuery.data,
    codexProvidersQuery.data,
    geminiCircuitsQuery.data,
    geminiProvidersQuery.data,
    tauriRuntime,
  ]);

  const handleResetProvider = useCallback(
    async (providerId: number) => {
      if (resettingProviderIds.has(providerId)) return;

      setResettingProviderIds((prev) => new Set(prev).add(providerId));
      try {
        const result = await resetCircuitProviderMutation.mutateAsync({ providerId });
        if (result) {
          toast.success("已解除熔断");
        } else {
          toast.error("解除熔断失败");
        }
      } catch (err) {
        logToConsole("error", "解除熔断失败", { providerId, error: String(err) });
        toast.error("解除熔断失败");
      } finally {
        setResettingProviderIds((prev) => {
          const next = new Set(prev);
          next.delete(providerId);
          return next;
        });
      }
    },
    [resetCircuitProviderMutation, resettingProviderIds]
  );

  // Auto-refresh circuits when the earliest open_until expires
  useEffect(() => {
    if (openCircuitsAutoRefreshTimerRef.current != null) {
      window.clearTimeout(openCircuitsAutoRefreshTimerRef.current);
      openCircuitsAutoRefreshTimerRef.current = null;
    }

    if (!tauriRuntime) return;
    if (openCircuits.length === 0) return;

    const nowUnix = Math.floor(Date.now() / 1000);
    let nextOpenUntil: number | null = null;
    for (const row of openCircuits) {
      const until = row.open_until;
      if (until == null) continue;
      if (nextOpenUntil == null || until < nextOpenUntil) nextOpenUntil = until;
    }

    const delayMs =
      nextOpenUntil != null ? Math.max(200, (nextOpenUntil - nowUnix) * 1000 + 250) : 30_000;

    openCircuitsAutoRefreshTimerRef.current = window.setTimeout(() => {
      openCircuitsAutoRefreshTimerRef.current = null;
      queryClient.invalidateQueries({ queryKey: gatewayKeys.circuits() });
    }, delayMs);

    return () => {
      if (openCircuitsAutoRefreshTimerRef.current != null) {
        window.clearTimeout(openCircuitsAutoRefreshTimerRef.current);
        openCircuitsAutoRefreshTimerRef.current = null;
      }
    };
  }, [openCircuits, queryClient, tauriRuntime]);

  return {
    openCircuits,
    resettingProviderIds,
    handleResetProvider,
  };
}

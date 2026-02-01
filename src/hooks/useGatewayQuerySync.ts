import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { gatewayKeys, requestLogsKeys, usageKeys } from "../query/keys";
import { hasTauriRuntime } from "../services/tauriInvoke";

const CIRCUIT_INVALIDATE_THROTTLE_MS = 500;
const STATUS_INVALIDATE_THROTTLE_MS = 300;
const REQUEST_INVALIDATE_THROTTLE_MS = 1000;

export function useGatewayQuerySync() {
  const queryClient = useQueryClient();

  const circuitTimerRef = useRef<number | null>(null);
  const statusTimerRef = useRef<number | null>(null);
  const requestTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!hasTauriRuntime()) return;

    let cancelled = false;
    let unlistenCircuit: null | (() => void) = null;
    let unlistenStatus: null | (() => void) = null;
    let unlistenRequest: null | (() => void) = null;

    const invalidateCircuits = () => {
      queryClient.invalidateQueries({ queryKey: gatewayKeys.circuits() });
    };

    const invalidateStatus = () => {
      queryClient.invalidateQueries({ queryKey: gatewayKeys.status() });
    };

    const invalidateRequestDerived = () => {
      queryClient.invalidateQueries({ queryKey: requestLogsKeys.lists() });
      queryClient.invalidateQueries({ queryKey: usageKeys.all });
    };

    const scheduleInvalidateCircuits = () => {
      if (circuitTimerRef.current != null) return;
      circuitTimerRef.current = window.setTimeout(() => {
        circuitTimerRef.current = null;
        if (cancelled) return;
        invalidateCircuits();
      }, CIRCUIT_INVALIDATE_THROTTLE_MS);
    };

    const scheduleInvalidateStatus = () => {
      if (statusTimerRef.current != null) return;
      statusTimerRef.current = window.setTimeout(() => {
        statusTimerRef.current = null;
        if (cancelled) return;
        invalidateStatus();
      }, STATUS_INVALIDATE_THROTTLE_MS);
    };

    const scheduleInvalidateRequestDerived = () => {
      if (requestTimerRef.current != null) return;
      requestTimerRef.current = window.setTimeout(() => {
        requestTimerRef.current = null;
        if (cancelled) return;
        invalidateRequestDerived();
      }, REQUEST_INVALIDATE_THROTTLE_MS);
    };

    import("@tauri-apps/api/event")
      .then(({ listen }) =>
        Promise.all([
          listen("gateway:circuit", () => {
            if (cancelled) return;
            scheduleInvalidateCircuits();
          }),
          listen("gateway:status", () => {
            if (cancelled) return;
            scheduleInvalidateStatus();
          }),
          listen("gateway:request", () => {
            if (cancelled) return;
            scheduleInvalidateRequestDerived();
          }),
        ])
      )
      .then(([circuit, status, request]) => {
        unlistenCircuit = circuit;
        unlistenStatus = status;
        unlistenRequest = request;
      })
      .catch(() => {
        // ignore: events unavailable in non-tauri environment
      });

    return () => {
      cancelled = true;
      unlistenCircuit?.();
      unlistenStatus?.();
      unlistenRequest?.();

      if (circuitTimerRef.current != null) {
        window.clearTimeout(circuitTimerRef.current);
        circuitTimerRef.current = null;
      }
      if (statusTimerRef.current != null) {
        window.clearTimeout(statusTimerRef.current);
        statusTimerRef.current = null;
      }
      if (requestTimerRef.current != null) {
        window.clearTimeout(requestTimerRef.current);
        requestTimerRef.current = null;
      }
    };
  }, [queryClient]);
}

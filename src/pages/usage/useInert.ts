import { useEffect } from "react";
import type { RefObject } from "react";

export function useInert(ref: RefObject<HTMLElement | null>, enabled: boolean) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (enabled) el.setAttribute("inert", "");
    else el.removeAttribute("inert");
    return () => el.removeAttribute("inert");
  }, [enabled, ref]);
}

export function useAutoFocus(ref: RefObject<HTMLElement | null>, enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    ref.current?.focus();
  }, [enabled, ref]);
}

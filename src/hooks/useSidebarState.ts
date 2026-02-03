import { useCallback, useEffect, useState } from "react";
import { useResponsive } from "./useMediaQuery";

export type SidebarState = {
  /** Whether the sidebar is currently open (visible) */
  isOpen: boolean;
  /** Whether the mobile drawer is open */
  isMobileDrawerOpen: boolean;
  /** Toggle the sidebar open/closed state */
  toggle: () => void;
  /** Open the sidebar */
  open: () => void;
  /** Close the sidebar */
  close: () => void;
  /** Toggle the mobile drawer */
  toggleMobileDrawer: () => void;
  /** Open the mobile drawer */
  openMobileDrawer: () => void;
  /** Close the mobile drawer */
  closeMobileDrawer: () => void;
};

const SIDEBAR_STORAGE_KEY = "aio-sidebar-open";

/**
 * Hook to manage sidebar visibility state with responsive behavior
 *
 * Behavior:
 * - Desktop (lg+): Sidebar always visible, can be toggled for collapsed mode
 * - Tablet (md-lg): Sidebar hidden by default, can be toggled
 * - Mobile (<md): Sidebar replaced by mobile drawer navigation
 */
export function useSidebarState(): SidebarState {
  const { isDesktop } = useResponsive();

  // Desktop sidebar open state (persisted)
  const [isOpen, setIsOpen] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    const stored = localStorage.getItem(SIDEBAR_STORAGE_KEY);
    return stored !== "false"; // Default to open
  });

  // Mobile drawer state (not persisted)
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);

  // Persist desktop sidebar state
  useEffect(() => {
    localStorage.setItem(SIDEBAR_STORAGE_KEY, String(isOpen));
  }, [isOpen]);

  // Auto-close mobile drawer on breakpoint change
  useEffect(() => {
    if (isDesktop) {
      setIsMobileDrawerOpen(false);
    }
  }, [isDesktop]);

  // Close mobile drawer on route change (handled via closeMobileDrawer in nav links)

  const toggle = useCallback(() => {
    setIsOpen((prev) => !prev);
  }, []);

  const open = useCallback(() => {
    setIsOpen(true);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
  }, []);

  const toggleMobileDrawer = useCallback(() => {
    setIsMobileDrawerOpen((prev) => !prev);
  }, []);

  const openMobileDrawer = useCallback(() => {
    setIsMobileDrawerOpen(true);
  }, []);

  const closeMobileDrawer = useCallback(() => {
    setIsMobileDrawerOpen(false);
  }, []);

  return {
    isOpen,
    isMobileDrawerOpen,
    toggle,
    open,
    close,
    toggleMobileDrawer,
    openMobileDrawer,
    closeMobileDrawer,
  };
}

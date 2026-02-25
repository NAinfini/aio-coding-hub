import { Outlet } from "react-router-dom";
import { UpdateDialog } from "../components/UpdateDialog";
import { useResponsive } from "../hooks/useMediaQuery";
import { useSidebarState } from "../hooks/useSidebarState";
import { MobileHeader, MobileNav } from "../ui/MobileNav";
import { Sidebar } from "../ui/Sidebar";

export function AppLayout() {
  const { isDesktop } = useResponsive();
  const sidebar = useSidebarState();

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100 lg:h-screen lg:overflow-hidden">
      {/* Mobile header - only shown on small screens */}
      {!isDesktop && <MobileHeader onMenuClick={sidebar.toggleMobileDrawer} />}

      <div className="flex min-h-screen lg:h-full lg:min-h-0">
        {/* Desktop sidebar - hidden on mobile via CSS */}
        <div className="hidden lg:block">
          <Sidebar isOpen={sidebar.isOpen} />
        </div>

        {/* Main content area */}
        <div className="relative min-w-0 flex-1 bg-grid-pattern lg:min-h-0">
          {/* Window drag region for titleBarStyle: overlay */}
          <div data-tauri-drag-region className="absolute inset-x-0 top-0 z-10 h-8" />
          <main className="px-4 pb-4 pt-10 sm:px-6 sm:pb-5 sm:pt-11 lg:h-full lg:min-h-0 lg:overflow-hidden">
            <Outlet />
          </main>
        </div>
      </div>

      {/* Mobile navigation drawer */}
      <MobileNav isOpen={sidebar.isMobileDrawerOpen} onClose={sidebar.closeMobileDrawer} />

      <UpdateDialog />
    </div>
  );
}

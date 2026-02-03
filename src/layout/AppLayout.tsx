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
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* Mobile header - only shown on small screens */}
      {!isDesktop && <MobileHeader onMenuClick={sidebar.toggleMobileDrawer} />}

      <div className="flex min-h-screen">
        {/* Desktop sidebar - hidden on mobile via CSS */}
        <div className="hidden lg:block">
          <Sidebar isOpen={sidebar.isOpen} />
        </div>

        {/* Main content area */}
        <div className="min-w-0 flex-1 bg-grid-pattern">
          <main className="px-4 py-4 sm:px-6 sm:py-5">
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

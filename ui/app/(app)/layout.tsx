"use client";

// The app shell: the sidebar, the settings' state and the command palette.
// The page renders in the main area with its own PageHeader.

import { useSyncExternalStore } from "react";
import { AppSidebar } from "@/components/shell/sidebar/app-sidebar";
import {
  SIDEBAR_WIDTH_KEY,
  SIDEBAR_WIDTH_MAX,
  SIDEBAR_WIDTH_MIN,
} from "@/components/shell/sidebar/sidebar-resize-handle";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { SettingsProvider } from "@/components/settings/settings";
import { CommandPalette } from "@/components/shell/command-palette";

// The sidebar collapses to an icon rail with its toggle inside, so it's always
// reachable. On mobile it's a drawer; this floating toggle opens it there.
function MobileSidebarTrigger() {
  const { isMobile, openMobile } = useSidebar();
  if (!isMobile || openMobile) return null;
  return (
    <div
      data-slot="floating-sidebar-trigger"
      className="fixed bottom-3 left-3 z-20"
    >
      <SidebarTrigger />
    </div>
  );
}

// The width the user last dragged the sidebar to, if any.
function savedSidebarWidth(): React.CSSProperties | undefined {
  try {
    const w = Number(localStorage.getItem(SIDEBAR_WIDTH_KEY));
    if (w >= SIDEBAR_WIDTH_MIN && w <= SIDEBAR_WIDTH_MAX)
      return { "--sidebar-width": `${w}px` } as React.CSSProperties;
  } catch {
    // Storage unavailable (e.g. blocked): use the default width.
  }
  return undefined;
}

// Nothing to subscribe to: the value only differs between server and client.
const noSubscribe = () => () => {};

export default function AppLayout({ children }: { children: React.ReactNode }) {
  // The sidebar's width comes from the browser's storage, which the server
  // does not have. So render after mount, and the server and browser agree.
  const mounted = useSyncExternalStore(
    noSubscribe,
    () => true,
    () => false,
  );
  if (!mounted) return null;

  return (
    <SettingsProvider>
      <CommandPalette />
      <SidebarProvider style={savedSidebarWidth()}>
        <div className="flex h-dvh w-full pr-0.5">
          <AppSidebar />
          <SidebarInset>
            <MobileSidebarTrigger />
            <main className="flex min-h-0 flex-1 flex-col">{children}</main>
          </SidebarInset>
        </div>
      </SidebarProvider>
    </SettingsProvider>
  );
}

"use client";

// The app shell shared by every page: sidebar, settings, command palette.
// Pages (chat, Reports, …) render in the main area with their own PageHeader.

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
import { SettingsProvider } from "@/components/settings/settings-dialog";
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
  // Threads load in the browser only; rendering on the server first produces
  // a hydration mismatch in the thread list, so render after mount.
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

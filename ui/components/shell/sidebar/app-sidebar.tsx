"use client";

import type * as React from "react";
import { Eclipse } from "lucide-react";
import { brandFont } from "@/lib/fonts";
import { NavUser } from "@/components/shell/sidebar/nav-user";
import { HOME, SECTIONS, useSettings } from "@/components/settings/settings";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { SidebarResizeHandle } from "./sidebar-resize-handle";

// App sidebar in the style of shadcn's sidebar-07: collapses to an icon rail
// (collapsible="icon") instead of disappearing. It lists the settings' sections.
export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { active, openSettings } = useSettings();
  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader className="h-16 justify-center border-b">
        <SidebarMenu>
          <SidebarMenuItem>
            {/* The brand opens Home. */}
            <SidebarMenuButton
              size="lg"
              onClick={() => openSettings("home")}
              aria-label="Lotus and Luna: home"
            >
              <div className="text-sidebar-foreground flex aspect-square size-8 shrink-0 items-center justify-center">
                <Eclipse className="size-6" />
              </div>
              <span
                className={`${brandFont.className} flex-1 truncate text-left text-base`}
              >
                Lotus and Luna
              </span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      {/* Scrolls, without a visible scrollbar. */}
      <SidebarContent className="px-2 pt-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip={HOME.name}
              isActive={active === "home"}
              onClick={() => openSettings("home")}
            >
              <HOME.icon />
              <span>Home</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          {SECTIONS.map((s) => (
            <SidebarMenuItem key={s.id}>
              <SidebarMenuButton
                tooltip={s.name}
                isActive={active === s.id}
                onClick={() => openSettings(s.id)}
              >
                <s.icon />
                <span>{s.name}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarContent>
      <SidebarResizeHandle />
      {/* You (opens Account) with the sidebar toggle inline; stacked when collapsed. */}
      <SidebarFooter className="border-t">
        <div className="flex items-center gap-1 group-data-[collapsible=icon]:flex-col">
          <SidebarMenu className="min-w-0 flex-1">
            <SidebarMenuItem>
              <NavUser />
            </SidebarMenuItem>
          </SidebarMenu>
          <SidebarTrigger />
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}

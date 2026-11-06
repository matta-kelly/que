"use client";

import type * as React from "react";
import { useRouter } from "next/navigation";
import { Eclipse, MessageSquareText } from "lucide-react";
import { brandFont } from "@/lib/fonts";
import { NavUser } from "@/components/shell/sidebar/nav-user";
import { useChatEnabled } from "@/hooks/use-chat-enabled";
import { useNewChat } from "@/hooks/use-new-chat";
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
import { ChatsSection } from "./chats-section";
import { SidebarResizeHandle } from "./sidebar-resize-handle";

// App sidebar in the style of shadcn's sidebar-07: collapses to an icon rail
// (collapsible="icon") instead of disappearing.
export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const newChat = useNewChat();
  const chat = useChatEnabled();
  const router = useRouter();
  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader className="aui-sidebar-header h-16 justify-center border-b">
        <SidebarMenu>
          <SidebarMenuItem>
            {/* The brand opens a fresh chat, or home on a deployment that serves no chat. */}
            <SidebarMenuButton
              size="lg"
              onClick={chat === false ? () => router.push("/") : newChat}
              aria-label={
                chat === false
                  ? "Lotus and Luna: home"
                  : "Lotus and Luna: new chat"
              }
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
      <SidebarContent className="aui-sidebar-content px-2 pt-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {/* The dropdown sections, Chats first. Collapsed rail: a chats icon
            that opens the sidebar. */}
        {chat && (
          <>
            <ChatsSection />
            <SidebarMenu className="hidden group-data-[collapsible=icon]:flex">
              <SidebarMenuItem>
                <RailChatsButton />
              </SidebarMenuItem>
            </SidebarMenu>
          </>
        )}
      </SidebarContent>
      <SidebarResizeHandle />
      {/* You (opens Settings) with the sidebar toggle inline; stacked when collapsed. */}
      <SidebarFooter className="aui-sidebar-footer border-t">
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

// Collapsed rail: the chats icon; clicking it opens a fresh chat.
function RailChatsButton() {
  const newChat = useNewChat();
  return (
    <SidebarMenuButton tooltip="Chats" onClick={newChat}>
      <MessageSquareText />
      <span>Chats</span>
    </SidebarMenuButton>
  );
}

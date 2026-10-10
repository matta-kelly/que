"use client";

// The signed-in user at the bottom of the sidebar (avatar, name, email).
// Clicking opens Settings (on Home). Collapsed rail: just the avatar.

import { SidebarMenuButton } from "@/components/ui/sidebar";
import { useSettings } from "@/components/settings/settings-dialog";
import { UserAvatar, useMe } from "@/components/user";

export function NavUser() {
  const { data: me } = useMe();
  const { openSettings } = useSettings();
  if (!me) return null;

  return (
    <SidebarMenuButton size="lg" tooltip={me.name} onClick={() => openSettings()} data-slot="nav-user">
      <UserAvatar user={me} />
      <div className="grid flex-1 text-left text-sm leading-tight">
        <span className="truncate font-medium">{me.name}</span>
        <span className="text-muted-foreground truncate text-xs">{me.email}</span>
      </div>
    </SidebarMenuButton>
  );
}

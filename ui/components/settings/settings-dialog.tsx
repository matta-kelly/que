"use client";

// Settings: a large dialog over the chat with a slim section menu on the left.
// Based on shadcn's "sidebar in a dialog" block (sidebar-13). Opens on Home
// (search + a tile per section). Add sections to SECTIONS; they get a tile and
// become searchable here and in the command palette (`keywords` are extra
// search terms). Open it from anywhere with useSettings().openSettings().

import * as React from "react";
import { Cable, CircleUser, House, Users } from "lucide-react";
import { titleFont } from "@/lib/fonts";
import { CONNECTIONS_BLURB, ConnectionsList } from "@/components/settings/connections";
import { AccountSettings } from "@/components/settings/account";
import { SettingsHome } from "@/components/settings/home";
import { UsersList } from "@/components/settings/users";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from "@/components/ui/sidebar";

export const SECTIONS = [
  {
    id: "account",
    name: "Account",
    icon: CircleUser,
    keywords: "profile",
    description: "Your profile. Your email comes from your login.",
    content: <AccountSettings />,
  },
  {
    id: "connections",
    name: "Connections",
    icon: Cable,
    keywords: "connectors",
    description: CONNECTIONS_BLURB,
    content: <ConnectionsList />,
  },
  {
    id: "users",
    name: "Users",
    icon: Users,
    keywords: "people",
    description: "Everyone with access to que. People are added automatically the first time they sign in.",
    content: <UsersList />,
  },
] as const;

export type SectionId = "home" | (typeof SECTIONS)[number]["id"];

const SettingsContext = React.createContext<{ openSettings: (section?: SectionId) => void } | null>(null);

export function useSettings() {
  const ctx = React.useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used inside SettingsProvider");
  return ctx;
}

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const [active, setActive] = React.useState<SectionId>("home");
  const openSettings = React.useCallback((section: SectionId = "home") => {
    setActive(section);
    setOpen(true);
  }, []);
  const value = React.useMemo(() => ({ openSettings }), [openSettings]);
  const section =
    active === "home"
      ? {
          name: "Settings",
          description: "Search, or pick a section.",
          content: <SettingsHome sections={SECTIONS} onOpen={setActive} />,
        }
      : (SECTIONS.find((s) => s.id === active) ?? SECTIONS[0]);

  return (
    <SettingsContext.Provider value={value}>
      {children}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="h-[85dvh] w-[92vw] max-w-none overflow-hidden rounded-2xl p-0 sm:max-w-[min(1100px,92vw)]">
          <DialogTitle className="sr-only">Settings</DialogTitle>
          <DialogDescription className="sr-only">Manage your settings.</DialogDescription>
          <SidebarProvider className="min-h-0 items-stretch" style={{ "--sidebar-width": "11rem" } as React.CSSProperties}>
            <Sidebar collapsible="none" className="hidden border-r md:flex">
              <SidebarContent>
                <SidebarGroup>
                  <SidebarGroupContent>
                    <SidebarMenu>
                      <SidebarMenuItem>
                        <SidebarMenuButton isActive={active === "home"} onClick={() => setActive("home")}>
                          <House />
                          <span>Home</span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                      {SECTIONS.map((s) => (
                        <SidebarMenuItem key={s.id}>
                          <SidebarMenuButton isActive={s.id === active} onClick={() => setActive(s.id)}>
                            <s.icon />
                            <span>{s.name}</span>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      ))}
                    </SidebarMenu>
                  </SidebarGroupContent>
                </SidebarGroup>
              </SidebarContent>
            </Sidebar>
            <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
              <header className="shrink-0 px-8 pt-8 pb-4">
                <h2 className={`${titleFont.className} text-xl`}>{section.name}</h2>
                <p className="text-muted-foreground text-sm">{section.description}</p>
              </header>
              <div className="flex-1 overflow-y-auto px-8 pb-8">{section.content}</div>
            </main>
          </SidebarProvider>
        </DialogContent>
      </Dialog>
    </SettingsContext.Provider>
  );
}

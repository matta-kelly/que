"use client";

// Settings: the app's one page. Home is a search over a tile per section. The
// sidebar lists the sections, and the command palette finds them. Add a section
// to SECTIONS: it gets a tile, a sidebar entry and a palette entry (`keywords`
// are extra search terms). Open one from anywhere with useSettings().openSettings().

import * as React from "react";
import { Cable, CircleUser, Settings, Users } from "lucide-react";
import {
  CONNECTIONS_BLURB,
  ConnectionsList,
} from "@/components/settings/connections";
import { AccountSettings } from "@/components/settings/account";
import { SettingsHome } from "@/components/settings/home";
import { UsersList } from "@/components/settings/users";
import { PageHeader } from "@/components/shell/page-header";

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
    description:
      "Everyone with access to que. People are added automatically the first time they sign in.",
    content: <UsersList />,
  },
] as const;

export type SectionId = "home" | (typeof SECTIONS)[number]["id"];

/** Home: the settings' first view, a search over a tile per section. */
export const HOME = {
  name: "Settings",
  icon: Settings,
  description: "Search, or pick a section.",
};

const SettingsContext = React.createContext<{
  active: SectionId;
  openSettings: (section?: SectionId) => void;
} | null>(null);

export function useSettings() {
  const ctx = React.useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used inside SettingsProvider");
  return ctx;
}

/** Holds the section the page shows. The page opens on Home. */
export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [active, setActive] = React.useState<SectionId>("home");
  const openSettings = React.useCallback(
    (section: SectionId = "home") => setActive(section),
    [],
  );
  const value = React.useMemo(
    () => ({ active, openSettings }),
    [active, openSettings],
  );
  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
}

/** The page: the header, then the active section with its name and description. */
export function SettingsPage() {
  const { active, openSettings } = useSettings();
  const section =
    active === "home"
      ? {
          ...HOME,
          content: <SettingsHome sections={SECTIONS} onOpen={openSettings} />,
        }
      : (SECTIONS.find((s) => s.id === active) ?? SECTIONS[0]);

  return (
    <>
      <PageHeader icon={<section.icon />} title={section.name} />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-5xl flex-col px-8 py-8">
          <p className="text-muted-foreground pb-6 text-sm">
            {section.description}
          </p>
          {section.content}
        </div>
      </div>
    </>
  );
}

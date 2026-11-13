"use client";

// Command palette: one search over everything: actions and settings (each
// section and each connector). Opens on "/" (when not typing in a field) or
// ⌘K / Ctrl+K.
//
// Scoped search: type a prefix like "settings:" or "action:" (or pick "Search
// in …") to search one type only; it shows as a pill, and Backspace on an empty
// search removes it. Without a scope, everything is searched by name.

import { useEffect, useState, type ReactNode } from "react";
import useSWR from "swr";
import { useTheme } from "next-themes";
import { Cable, Moon, Search, Sun, X, type LucideIcon } from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { SECTIONS, useSettings } from "@/components/settings/settings";
import { fetcher, QUE_API, type Connection } from "@/lib/que-api";

type Entry = {
  key: string;
  value: string;
  label: ReactNode;
  icon: LucideIcon;
  run: () => void;
};

// "Settings" → ["settings", "setting"]: what you can type before ":" for it.
const prefixesOf = (name: string) => {
  const plural = name.toLowerCase();
  return [...new Set([plural, plural.replace(/s$/, "")])];
};

// Search types, in display order: actions, then settings (its SECTIONS and
// each connector). `prefixes` are what you can type before ":" to scope to it.
const SCOPES = [
  { id: "actions", label: "Actions", prefixes: prefixesOf("Actions") },
  {
    id: "settings",
    label: "Settings",
    prefixes: [
      ...prefixesOf("Settings"),
      ...SECTIONS.flatMap((s) => prefixesOf(s.name)),
    ],
  },
];

const scopeFromPrefix = (word: string) =>
  SCOPES.find((s) => s.prefixes.includes(word.toLowerCase()));

const isTyping = (t: EventTarget | null) => {
  const el = t as HTMLElement | null;
  return (
    !!el &&
    (el.isContentEditable ||
      ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName))
  );
};

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const { openSettings } = useSettings();
  const { resolvedTheme, setTheme } = useTheme();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (
        e.key === "/" &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey &&
        !isTyping(e.target)
      ) {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Closing clears the scope and search, so the palette opens fresh.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (!open) {
      setScope(null);
      setSearch("");
    }
  }

  // Loaded once the palette opens. If it fails, connectors just don't show up
  // in search; Settings → Connections shows the error.
  const { data: connectors = [] } = useSWR<Connection[]>(
    open ? QUE_API.connections : null,
    fetcher,
  );

  const run = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };

  // "settings: foo" → scope Settings, search "foo".
  const onSearchChange = (value: string) => {
    const match = !scope && value.match(/^(\w+):\s?(.*)$/);
    const next = match && scopeFromPrefix(match[1]);
    if (next) {
      setScope(next.id);
      setSearch(match[2]);
    } else {
      setSearch(value);
    }
  };

  const dark = resolvedTheme === "dark";

  const groups: Record<string, Entry[]> = {
    actions: [
      {
        key: "theme",
        value: "theme dark light mode",
        label: `Switch to ${dark ? "light" : "dark"} theme`,
        icon: dark ? Sun : Moon,
        run: () => setTheme(dark ? "light" : "dark"),
      },
    ],
    settings: [
      ...SECTIONS.map((s) => ({
        key: s.id,
        value: `settings ${s.name} ${s.keywords}`,
        label: s.name,
        icon: s.icon,
        run: () => openSettings(s.id),
      })),
      ...connectors.map((c) => ({
        key: c.name,
        value: `connection ${c.title} ${c.name}`,
        label: `${c.title} connection`,
        icon: Cable,
        run: () => openSettings("connections"),
      })),
    ],
  };
  const shown = SCOPES.filter((s) => (scope ? s.id === scope : true));
  const scopeLabel = SCOPES.find((s) => s.id === scope)?.label;

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      title="Search"
      description="Search settings and actions"
      className="sm:max-w-3xl"
    >
      <CommandInput
        placeholder={
          scopeLabel
            ? `Search ${scopeLabel.toLowerCase()}…`
            : "Search everything…"
        }
        value={search}
        onValueChange={onSearchChange}
        onKeyDown={(e) => {
          if (e.key === "Backspace" && !search && scope) setScope(null);
        }}
        leading={
          scopeLabel && (
            <span
              data-slot="search-scope"
              className="bg-muted text-foreground flex shrink-0 items-center gap-1 rounded-md py-0.5 ps-2 pe-1 text-xs font-medium"
            >
              {scopeLabel}
              <button
                type="button"
                aria-label="Clear scope"
                onClick={() => setScope(null)}
                className="hover:bg-background rounded p-0.5"
              >
                <X className="size-3" />
              </button>
            </span>
          )
        }
      />
      <CommandList className="max-h-[60dvh]">
        <CommandEmpty>No results.</CommandEmpty>
        {/* Typing a type's name suggests scoping to it. */}
        {!scope && search && (
          <CommandGroup heading="Search in">
            {SCOPES.map((s) => (
              <CommandItem
                key={s.id}
                value={`search in ${s.label} ${s.prefixes.join(" ")}`}
                onSelect={() => {
                  setScope(s.id);
                  setSearch("");
                }}
              >
                <Search /> Search in {s.label}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {shown.map((s) =>
          groups[s.id].length ? (
            <CommandGroup key={s.id} heading={s.label}>
              {groups[s.id].map((e) => (
                <CommandItem key={e.key} value={e.value} onSelect={run(e.run)}>
                  <e.icon /> {e.label}
                </CommandItem>
              ))}
            </CommandGroup>
          ) : null,
        )}
      </CommandList>
    </CommandDialog>
  );
}

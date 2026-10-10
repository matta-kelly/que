"use client";

// Settings home: a search box over a grid of section tiles. Typing filters the
// tiles and also finds things inside sections (a connector, a person), each
// opening its section.

import { useState, type ComponentType } from "react";
import useSWR from "swr";
import { Cable, Search } from "lucide-react";
import { UserAvatar } from "@/components/user";
import { fetcher, QUE_API, type Connection, type User } from "@/lib/que-api";

type Section<Id extends string> = {
  id: Id;
  name: string;
  description: string;
  keywords: string;
  icon: ComponentType<{ className?: string }>;
};

type Match<Id extends string> = {
  key: string;
  label: string;
  hint: string;
  section: Id;
  icon: React.ReactNode;
};

export function SettingsHome<Id extends string>({
  sections,
  onOpen,
}: {
  sections: readonly Section<Id>[];
  onOpen: (id: Id) => void;
}) {
  const [query, setQuery] = useState("");
  // Only feed the search: if either fails to load, its section shows the error.
  const { data: connectors = [] } = useSWR<Connection[]>(
    QUE_API.connections,
    fetcher,
  );
  const { data: users = [] } = useSWR<User[]>(QUE_API.users, fetcher);

  const q = query.trim().toLowerCase();
  const has = (...texts: string[]) =>
    !q || texts.some((t) => t.toLowerCase().includes(q));
  const tiles = sections.filter((s) => has(s.name, s.description, s.keywords));
  const matches: Match<Id>[] = !q
    ? []
    : [
        ...connectors
          .filter((c) => has(c.title, c.name))
          .map((c) => ({
            key: `c-${c.name}`,
            label: `${c.title} connection`,
            hint: "Connections",
            section: "connections" as Id,
            icon: <Cable className="size-4" />,
          })),
        ...users
          .filter((u) => has(u.name, u.email))
          .map((u) => ({
            key: `u-${u.id}`,
            label: u.name,
            hint: `Users · ${u.email}`,
            section: "users" as Id,
            icon: <UserAvatar user={u} className="size-5 rounded-md" />,
          })),
      ].filter((m) => sections.some((s) => s.id === m.section));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex h-10 items-center gap-2 rounded-lg border px-3">
        <Search className="text-muted-foreground size-4 shrink-0" />
        <input
          type="search"
          aria-label="Search settings"
          placeholder="Search settings…"
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="placeholder:text-muted-foreground h-full min-w-0 flex-1 bg-transparent text-sm outline-none [&::-webkit-search-cancel-button]:hidden"
        />
      </div>

      {tiles.length > 0 && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          {tiles.map((s) => (
            <button
              key={s.id}
              type="button"
              data-testid={`settings-tile-${s.id}`}
              onClick={() => onOpen(s.id)}
              className="hover:bg-accent flex flex-col items-start gap-3 rounded-xl border p-4 text-left transition-colors"
            >
              <span className="bg-muted flex size-9 items-center justify-center rounded-lg">
                <s.icon className="size-5" />
              </span>
              <span>
                <span className="block text-sm font-medium">{s.name}</span>
                <span className="text-muted-foreground line-clamp-2 text-xs">
                  {s.description}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}

      {matches.length > 0 && (
        <div className="divide-y rounded-xl border">
          {matches.map((m) => (
            <button
              key={m.key}
              type="button"
              onClick={() => onOpen(m.section)}
              className="hover:bg-accent flex w-full items-center gap-3 p-3 text-left text-sm first:rounded-t-xl last:rounded-b-xl"
            >
              <span className="text-muted-foreground flex size-5 items-center justify-center">
                {m.icon}
              </span>
              <span className="flex-1 truncate">{m.label}</span>
              <span className="text-muted-foreground text-xs">{m.hint}</span>
            </button>
          ))}
        </div>
      )}

      {q && !tiles.length && !matches.length && (
        <p className="text-muted-foreground text-sm">
          No settings match “{query}”.
        </p>
      )}
    </div>
  );
}

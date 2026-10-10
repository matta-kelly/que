"use client";

// Users: everyone with access. People are added automatically the first time
// they sign in; the first user is an admin.

import useSWR from "swr";
import { UserAvatar } from "@/components/user";
import { fetcher, QUE_API, type User } from "@/lib/que-api";

export function UsersList() {
  const { data: users, error } = useSWR<User[]>(QUE_API.users, fetcher);

  return (
    <div className="divide-y rounded-xl border">
      {error ? (
        <p className="text-destructive p-4 text-sm">
          Couldn&apos;t load users.
        </p>
      ) : !users ? (
        <p className="text-muted-foreground p-4 text-sm">Loading…</p>
      ) : (
        users.map((u) => (
          <div
            key={u.id}
            data-testid={`user-${u.email}`}
            className="flex items-center gap-3 p-4"
          >
            <UserAvatar user={u} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{u.name}</p>
              <p className="text-muted-foreground truncate text-xs">
                {u.email}
              </p>
            </div>
            <span className="bg-muted rounded-md px-2 py-0.5 text-xs capitalize">
              {u.role}
            </span>
            <span className="text-muted-foreground hidden w-28 text-right text-xs sm:block">
              Joined {new Date(u.createdAt).toLocaleDateString()}
            </span>
          </div>
        ))
      )}
    </div>
  );
}

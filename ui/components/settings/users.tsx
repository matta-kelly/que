"use client";

// Users: everyone with access. People are added automatically the first time
// they sign in; the first user is an admin. An admin also grants each user's
// domains, and sets their role.

import { useState } from "react";
import useSWR from "swr";
import { UserAvatar } from "@/components/shell/user";
import {
  fetcher,
  QUE_API,
  type AdminUser,
  type Domain,
  type Me,
  type User,
} from "@/lib/que-api";

export function UsersList() {
  const { data: me } = useSWR<Me>(QUE_API.me, fetcher);
  const admin = me?.role === "admin";
  const {
    data: adminUsers,
    error: adminError,
    mutate: refreshAdminUsers,
  } = useSWR<AdminUser[]>(admin ? QUE_API.adminUsers : null, fetcher);
  const { data: domains } = useSWR<Domain[]>(
    admin ? QUE_API.adminDomains : null,
    fetcher,
  );
  const { data: users, error: usersError } = useSWR<User[]>(
    me && !admin ? QUE_API.users : null,
    fetcher,
  );

  const error = admin ? adminError : usersError;

  const loading = <p className="text-muted-foreground p-4 text-sm">Loading…</p>;
  const failed = (
    <p className="text-destructive p-4 text-sm">Couldn&apos;t load users.</p>
  );

  return (
    <div className="divide-y rounded-xl border">
      {error
        ? failed
        : admin
          ? !adminUsers || !domains
            ? loading
            : adminUsers.map((u) => (
                <AdminRow
                  key={u.id}
                  user={u}
                  domains={domains}
                  refresh={refreshAdminUsers}
                />
              ))
          : !users
            ? loading
            : users.map((u) => <UserRow key={u.id} user={u} />)}
    </div>
  );
}

/** The avatar, name and email of a user: what every row shows, admin or not. */
function Identity({ user }: { user: User }) {
  return (
    <>
      <UserAvatar user={user} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{user.name}</p>
        <p className="text-muted-foreground truncate text-xs">{user.email}</p>
      </div>
    </>
  );
}

/** A member's row: the user, and their role, as read-only. */
function UserRow({ user }: { user: User }) {
  return (
    <div
      data-testid={`user-${user.email}`}
      className="flex items-center gap-3 p-4"
    >
      <Identity user={user} />
      <span className="bg-muted rounded-md px-2 py-0.5 text-xs capitalize">
        {user.role}
      </span>
      <span className="text-muted-foreground hidden w-28 text-right text-xs sm:block">
        Joined {new Date(user.createdAt).toLocaleDateString()}
      </span>
    </div>
  );
}

/** An admin's row: a role control, a toggle for every domain, and the last refusal on the row. */
function AdminRow({
  user,
  domains,
  refresh,
}: {
  user: AdminUser;
  domains: Domain[];
  refresh: () => Promise<unknown>;
}) {
  const [error, setError] = useState<string | null>(null);

  /** Send a change; a refusal shows its error on the row, and a write refetches the list, so the row follows the server. */
  const send = async (url: string, init: RequestInit) => {
    setError(null);
    const res = await fetch(url, init);
    if (!res.ok) {
      setError((await res.json()).error ?? "Something went wrong");
      return;
    }
    await refresh();
  };

  const setGrant = (domain: string, on: boolean) =>
    send(`${QUE_API.adminUsers}/${user.id}/grants/${domain}`, {
      method: on ? "PUT" : "DELETE",
    });

  const setRole = (role: User["role"]) =>
    send(`${QUE_API.adminUsers}/${user.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ role }),
    });

  return (
    <div data-testid={`user-${user.email}`} className="flex flex-col gap-3 p-4">
      <div className="flex items-center gap-3">
        <Identity user={user} />
        <select
          data-testid={`role-${user.email}`}
          value={user.role}
          onChange={(e) => setRole(e.target.value as User["role"])}
          className="bg-muted rounded-md px-2 py-0.5 text-xs capitalize"
        >
          <option value="admin">admin</option>
          <option value="member">member</option>
        </select>
        <span className="text-muted-foreground hidden w-28 text-right text-xs sm:block">
          Joined {new Date(user.createdAt).toLocaleDateString()}
        </span>
      </div>
      <div className="flex flex-wrap gap-4">
        {domains.map((d) => (
          <label key={d.name} className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              data-testid={`grant-${user.email}-${d.name}`}
              checked={user.grants.includes(d.name)}
              onChange={(e) => setGrant(d.name, e.target.checked)}
            />
            <span>
              {d.name}
              <span className="text-muted-foreground">
                {" "}
                {[...d.connectors, ...d.roles].join(", ")}
              </span>
            </span>
          </label>
        ))}
      </div>
      {error && (
        <p role="alert" className="text-destructive text-xs">
          {error}
        </p>
      )}
    </div>
  );
}

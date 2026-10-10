"use client";

// The signed-in user: `useMe()` loads it (saving the profile updates it through
// SWR); `UserAvatar` shows their picture, or initials as a fallback.

import useSWR from "swr";
import { cn } from "@/lib/utils";
import { fetcher, QUE_API, type User } from "@/lib/que-api";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export const useMe = () => useSWR<User>(QUE_API.me, fetcher);

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");

export function UserAvatar({
  user,
  className,
}: {
  user: Pick<User, "name" | "avatarUrl">;
  className?: string;
}) {
  return (
    <Avatar className={cn("size-8 rounded-lg", className)}>
      {user.avatarUrl && <AvatarImage src={user.avatarUrl} alt={user.name} />}
      <AvatarFallback className="rounded-lg text-xs">
        {initials(user.name)}
      </AvatarFallback>
    </Avatar>
  );
}

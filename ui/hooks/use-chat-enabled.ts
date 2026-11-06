"use client";

// Whether this deployment serves que's chat: `false` when it sets QUE_CHAT=off, and `undefined` while
// the deployment loads. An older server that does not say, or a deployment that fails to load, counts as on.

import useSWR from "swr";
import { fetcher, QUE_API, type Deployment } from "@/lib/que-api";

export function useChatEnabled(): boolean | undefined {
  const { data, error } = useSWR<Deployment>(QUE_API.deployment, fetcher);
  if (error) return true;
  return data ? data.chat !== false : undefined;
}

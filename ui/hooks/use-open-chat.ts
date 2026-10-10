"use client";

import { useAui } from "@assistant-ui/react";
import { useRouter } from "next/navigation";

/** Where the chat page lives. */
export const CHAT_PATH = "/";

/** Open a chat on the chat page, from wherever you are. */
export function useOpenChat() {
  const aui = useAui();
  const router = useRouter();
  return (id: string) => {
    aui.threads.switchToThread(id);
    router.push(CHAT_PATH);
  };
}

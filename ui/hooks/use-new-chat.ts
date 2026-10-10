"use client";

import { useAui } from "@assistant-ui/react";
import { useRouter } from "next/navigation";
import { CHAT_PATH } from "@/hooks/use-open-chat";

/** Start a fresh chat and go to the chat page. */
export function useNewChat() {
  const aui = useAui();
  const router = useRouter();
  return () => {
    aui.threads.switchToNewThread();
    router.push(CHAT_PATH);
  };
}

"use client";

import { useNewChat } from "@/hooks/use-new-chat";
import { useEffect, useRef, useState } from "react";
import {
  Archive,
  ChevronDown,
  MessageSquareText,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { useAui } from "@assistant-ui/react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
} from "@/components/ui/sidebar";
import {
  ChatSelectionContext,
  ThreadListItems,
  ThreadListRoot,
  type ChatSelection,
} from "@/components/assistant-ui/elements/thread-list.aui";

// Chats section: a header row with the section toggle on the left and
// a search icon on the right. The search icon turns the row itself
// into a quick chat filter (Escape or ✕ to close). Global search is the command
// palette ("/" or ⌘K).
const iconButton =
  "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground flex size-7 shrink-0 items-center justify-center rounded-md";

const CHATS_OPEN_KEY = "que.chatsOpen";

export function ChatsSection() {
  const newChat = useNewChat();
  // Collapsed by default; remembers whether you left it open.
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem(CHATS_OPEN_KEY) === "true";
    } catch {
      return false;
    }
  });
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState("");
  // Search opens the section; closing search puts it back how it was.
  const wasOpen = useRef(open);
  const startSearch = () => {
    wasOpen.current = open;
    setOpen(true);
    setSearching(true);
  };
  const closeSearch = () => {
    setSearching(false);
    setQuery("");
    setOpen(wasOpen.current);
  };

  // Remember the user's choice (not the temporary open while searching).
  useEffect(() => {
    if (searching) return;
    try {
      localStorage.setItem(CHATS_OPEN_KEY, String(open));
    } catch {
      // Storage unavailable: the choice just isn't remembered.
    }
  }, [open, searching]);

  // Multi-select ("Select" in a chat's menu): archive or delete several chats.
  const aui = useAui();
  const [selected, setSelected] = useState<ReadonlySet<string> | null>(null);
  const selecting = selected !== null;
  const stopSelecting = () => setSelected(null);
  const selection: ChatSelection = {
    selecting,
    selected: selected ?? new Set(),
    toggle: (id) =>
      setSelected((cur) => {
        const next = new Set(cur ?? []);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      }),
    start: (id) => setSelected(new Set([id])),
  };
  const bulk = (action: "archive" | "delete") => {
    const ids = [...(selected ?? [])];
    if (!ids.length) return;
    if (
      action === "delete" &&
      !window.confirm(
        `Delete ${ids.length} chat${ids.length === 1 ? "" : "s"}? This can't be undone.`,
      )
    )
      return;
    for (const id of ids) aui.threads.item({ id })[action]();
    stopSelecting();
  };
  useEffect(() => {
    if (!selecting) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && stopSelecting();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selecting]);

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="group/chats group-data-[collapsible=icon]:hidden"
    >
      <SidebarGroup className="p-0">
        <div className="flex h-8 items-center">
          {selecting ? (
            <>
              <span className="text-sidebar-foreground/70 flex-1 px-2 text-xs font-medium">
                {selection.selected.size} selected
              </span>
              <button
                type="button"
                aria-label="Archive selected"
                title="Archive"
                disabled={!selection.selected.size}
                onClick={() => bulk("archive")}
                className={iconButton}
              >
                <Archive className="size-4" />
              </button>
              <button
                type="button"
                aria-label="Delete selected"
                title="Delete"
                disabled={!selection.selected.size}
                onClick={() => bulk("delete")}
                className={`${iconButton} hover:text-destructive`}
              >
                <Trash2 className="size-4" />
              </button>
              <button
                type="button"
                aria-label="Cancel selection"
                title="Cancel"
                onClick={stopSelecting}
                className={iconButton}
              >
                <X className="size-4" />
              </button>
            </>
          ) : searching ? (
            <>
              <Search className="text-sidebar-foreground/70 ms-2 size-4 shrink-0" />
              <input
                type="search"
                aria-label="Search threads"
                placeholder="Search chats"
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Escape" && closeSearch()}
                className="placeholder:text-sidebar-foreground/50 h-7 min-w-0 flex-1 bg-transparent px-2 text-sm outline-none [&::-webkit-search-cancel-button]:hidden"
              />
              <button
                type="button"
                aria-label="Close search"
                onClick={closeSearch}
                className={iconButton}
              >
                <X className="size-4" />
              </button>
            </>
          ) : (
            <>
              {/* "Chats" opens a fresh chat; the chevron folds the list. */}
              <SidebarGroupLabel className="flex-1 gap-0 p-0">
                <button
                  type="button"
                  onClick={newChat}
                  className="hover:text-sidebar-foreground flex h-full items-center px-2"
                >
                  <MessageSquareText className="me-2 !size-4" />
                  Chats
                </button>
                <CollapsibleTrigger
                  aria-label="Toggle chats"
                  className="hover:text-sidebar-foreground flex h-full items-center"
                >
                  <ChevronDown className="transition-transform group-data-[state=closed]/chats:-rotate-90" />
                </CollapsibleTrigger>
              </SidebarGroupLabel>
              <button
                type="button"
                aria-label="Search chats"
                onClick={startSearch}
                className={iconButton}
              >
                <Search className="size-4" />
              </button>
            </>
          )}
        </div>
        <CollapsibleContent>
          <SidebarGroupContent className="pt-1">
            <ChatSelectionContext.Provider value={selection}>
              <ThreadListRoot>
                <ThreadListItems searchQuery={query} />
              </ThreadListRoot>
            </ChatSelectionContext.Provider>
          </SidebarGroupContent>
        </CollapsibleContent>
      </SidebarGroup>
    </Collapsible>
  );
}

"use client";

import { useAuiState } from "@assistant-ui/react";
import { ChevronDownIcon } from "lucide-react";
import { useMemo, type FC } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useChatPick } from "@/hooks/use-chat-pick";
import { createClient } from "@/lib/langgraph-client";
import { priced } from "@/lib/cost";
import type { RunPick } from "@/lib/run-pick";
import { changePick } from "@/lib/run-pick-store";

/**
 * The agent and the model the open chat runs on, each with a menu to pick
 * another. The model can change at any message. The agent is fixed after the
 * first: the engines keep different state in a thread. A picker with fewer
 * than two entries is not shown.
 */
export const RunPickers: FC = () => {
  const client = useMemo(() => createClient(), []);
  const { deployment, thread, remoteId, shown } = useChatPick();
  const started = useAuiState((s) => s.thread.messages.length > 0);
  if (!deployment) return <div />;

  const change = (next: RunPick) => {
    changePick(thread, next);
    // A thread not made yet gets its pick when it is made.
    if (remoteId)
      client.threads.update(remoteId, { metadata: next }).catch(() => {});
  };

  return (
    <div data-slot="run-pickers" className="flex items-center gap-0.5">
      {deployment.agents.length > 1 && (
        <Picker
          label="Agent"
          value={shown.agent}
          names={deployment.agents.map((agent) => agent.name)}
          disabled={started}
          // The model follows the agent picked.
          onPick={(agent) => change({ agent, model: null })}
        />
      )}
      {deployment.models.length > 1 && (
        <Picker
          label="Model"
          value={shown.model}
          names={deployment.models.map((model) => model.name)}
          // What a model costs, seen before it is picked.
          detail={Object.fromEntries(
            deployment.models.map((model) => [
              model.name,
              model.price && priced(model.price),
            ]),
          )}
          onPick={(model) => change({ model })}
        />
      )}
    </div>
  );
};

const Picker: FC<{
  label: string;
  value: string | undefined;
  names: string[];
  disabled?: boolean;
  /** A line beside a name, by the name. */
  detail?: Record<string, string | undefined>;
  onPick: (name: string) => void;
}> = ({ label, value, names, disabled, detail, onPick }) => (
  <DropdownMenu>
    <DropdownMenuTrigger asChild disabled={disabled}>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-label={label}
        className="text-muted-foreground h-7 gap-1 px-2 text-xs font-normal"
      >
        {value}
        {!disabled && <ChevronDownIcon className="size-3 opacity-60" />}
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="start" side="top">
      <DropdownMenuRadioGroup value={value} onValueChange={onPick}>
        {names.map((name) => (
          // The row's name, for a screen reader and a test, is the name alone.
          <DropdownMenuRadioItem key={name} value={name} aria-label={name}>
            {name}
            {detail?.[name] && (
              <span className="text-muted-foreground ms-auto ps-6 text-xs tabular-nums">
                {detail[name]}
              </span>
            )}
          </DropdownMenuRadioItem>
        ))}
      </DropdownMenuRadioGroup>
    </DropdownMenuContent>
  </DropdownMenu>
);

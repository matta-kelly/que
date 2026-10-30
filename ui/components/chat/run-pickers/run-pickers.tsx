"use client";

import { useAuiState } from "@assistant-ui/react";
import { ChevronDownIcon } from "lucide-react";
import type { FC } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useChatPick } from "@/components/chat/run-pickers/use-chat-pick";
import { priced } from "@/components/chat/run-pickers/price";
import { agentPick, type RunPick } from "@/components/chat/run-pickers/pick";
import { changePick } from "@/components/chat/run-pickers/pick-store";
import { threads } from "@/components/runtime/que-client";

/**
 * The agent and the model the open chat runs on, each with a menu to pick
 * another. The model can change at any message. The agent is fixed after the
 * first: the loops of two agents keep different state in a thread. A picker with fewer
 * than two entries is not shown. A pick in a chat that is a thread on que's
 * server is kept on its record there; before, it is made with the thread.
 */
export const RunPickers: FC = () => {
  const { deployment, thread, remoteId, shown } = useChatPick();
  const started = useAuiState((s) => s.thread.messages.length > 0);
  if (!deployment) return <div />;

  const change = (next: RunPick) => {
    changePick(thread, next);
    if (remoteId) void threads.change(remoteId, next);
  };

  return (
    <div data-slot="run-pickers" className="flex items-center gap-0.5">
      {deployment.agents.length > 1 && (
        <Picker
          label="Agent"
          value={shown.agent}
          names={deployment.agents.map((agent) => agent.name)}
          disabled={started}
          onPick={(agent) => change(agentPick(agent))}
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

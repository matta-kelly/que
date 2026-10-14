"use client";

import { Lightbulb } from "lucide-react";
import { ActivityStep } from "./activity-step";

// The model's reasoning: "Thinking…" while streaming, then "Thought".
export function ThinkingStep({
  text,
  running,
}: {
  text: string;
  running: boolean;
}) {
  return (
    <ActivityStep
      icon={<Lightbulb />}
      label={running ? "Thinking…" : "Thought"}
      running={running}
    >
      {text && <p className="whitespace-pre-wrap">{text}</p>}
    </ActivityStep>
  );
}

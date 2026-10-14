// The label of a turn's summary row: "Working…" while the turn runs, then the
// count of its steps.
export function summaryLabel(steps: number, running: boolean): string {
  return running ? "Working…" : `${steps} step${steps === 1 ? "" : "s"}`;
}

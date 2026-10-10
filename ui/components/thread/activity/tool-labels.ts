// Human labels for tool calls. odoo_getCompany → "Odoo: get company";
// read_skill → "Read skill: odoo/lookup-company".
export function toolLabel(toolName: string, args: unknown): string {
  if (toolName === "read_skill")
    return `Read skill: ${(args as { id?: string })?.id ?? ""}`;
  const [pkg, op = ""] = toolName.split(/_(.*)/);
  const words = op.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase();
  return `${pkg.charAt(0).toUpperCase()}${pkg.slice(1)}: ${words}`;
}

// Short, readable preview of tool inputs/results.
export function preview(value: unknown, max = 600): string {
  const text =
    typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

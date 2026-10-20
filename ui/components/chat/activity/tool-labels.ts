// Human labels for tool calls. odoo_getCompany → "Odoo: get company";
// read_skill → "Read skill: odoo/lookup-company"; open_plugin → "Open plugin: odoo".
// A chat from before the rename holds open_package, with the argument `package`.
export function toolLabel(toolName: string, args: unknown): string {
  const given = (args ?? {}) as Record<string, string | undefined>;
  if (toolName === "read_skill") return `Read skill: ${given.id ?? ""}`;
  const plugin = given.plugin ?? given.package ?? "";
  if (toolName === "open_plugin" || toolName === "open_package")
    return `Open plugin: ${plugin}`;
  if (toolName === "load_operation")
    return `Load operation: ${plugin} ${given.operation ?? ""}`;
  const [name, op = ""] = toolName.split(/_(.*)/);
  const words = op.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase();
  return `${name.charAt(0).toUpperCase()}${name.slice(1)}: ${words}`;
}

// Short, readable preview of tool inputs/results.
export function preview(value: unknown, max = 600): string {
  const text =
    typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

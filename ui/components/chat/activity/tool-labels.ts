// Human labels for tool calls. An op's tool is its name in the graph, odoo-get-company → "Odoo get company";
// read_skill → "Read skill: odoo-lookup-company"; open_plugin → "Open plugin: odoo".
export function toolLabel(toolName: string, args: unknown): string {
  const given = (args ?? {}) as Record<string, string | undefined>;
  if (toolName === "read_skill") return `Read skill: ${given.id ?? ""}`;
  if (toolName === "open_plugin") return `Open plugin: ${given.plugin ?? ""}`;
  if (toolName === "load_operation")
    return `Load operation: ${given.plugin ?? ""} ${given.operation ?? ""}`;
  // A tool of the agent itself is named with `_` (read_file); an op's tool is its name, with `-` (odoo-get-company).
  if (toolName.includes("_")) {
    const [name, rest = ""] = toolName.split(/_(.*)/);
    return `${name.charAt(0).toUpperCase()}${name.slice(1)}: ${rest.replaceAll("_", " ")}`;
  }
  const words = toolName.replaceAll("-", " ");
  return `${words.charAt(0).toUpperCase()}${words.slice(1)}`;
}

// Short, readable preview of tool inputs/results.
export function preview(value: unknown, max = 600): string {
  const text =
    typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

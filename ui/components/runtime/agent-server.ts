// The agent server the UI talks to, and its graph. With no setting, they are que's
// own: `just up` starts the server on localhost:2024, and its graph is `agent`
// (server/harness/langgraph.json). So a que checkout needs no settings file.

export const agentServer = (setting: string | undefined) =>
  setting?.trim() || "http://localhost:2024";

export const agentGraph = (setting: string | undefined) =>
  setting?.trim() || "agent";

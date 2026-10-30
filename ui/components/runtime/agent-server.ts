// The server the UI talks to. With no setting, it is que's own: `just up` starts
// que's server on localhost:2024. So a que checkout needs no settings file.

export const agentServer = (setting: string | undefined) =>
  setting?.trim() || "http://localhost:2024";

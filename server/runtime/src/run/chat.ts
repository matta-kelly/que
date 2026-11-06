/**
 * Whether this deployment serves que's chat. A deployment sets `QUE_CHAT=off` to serve only the
 * control plane and MCP: its users bring their own AI over MCP, so no run spends the deployment's model.
 * Read at each request, as the deployment's env sets it.
 */

export const chatEnabled = () => process.env.QUE_CHAT !== "off";

/** What a user is told when the chat is off: a fact about the deployment, not a failure. */
export const CHAT_OFF =
  "Chat isn't enabled for this deployment. Connect your own AI to que over MCP.";

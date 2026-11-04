/**
 * One MCP session: the server, and the tools of the deployment this process
 * mounted, on the catalog of the user it answers for. Both mouths build a
 * session here: stdio for the whole process (`stdio.ts`), and HTTP once per
 * request (`serve.ts`), so a user's tool set is made in one place.
 *
 * The tools are assembled when the session is made: a deployment change is
 * seen by the next session, which over stdio is the next process, and over
 * HTTP is the next request.
 */

import { hkdfSync } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import {
  CLIENT_CAPABILITIES_META_KEY,
  createRequestStateCodec,
  inputRequired,
  type InputRequiredResult,
  type McpServer,
  type RequestStateCodec,
  type ServerContext,
} from "@modelcontextprotocol/server";
import { OpFailed } from "@mku1tra/que-plugin";
import type { User } from "@que/users";
import { door, type Ask, type PlacedOp } from "../assemble/door.js";
import { createMcpServer } from "./server.js";
import { toolsOf } from "./tools.js";

/** The mouth a session answers on: stdio holds a connection, and HTTP holds nothing between requests. */
type Mouth = "stdio" | "http";

/** The key of the one ask a call makes: the client echoes it in its answer. */
const ASK = "confirm";

/** What an ask seals into its `requestState`: the tool, and the parsed args the user's yes is for. */
type Pending = { tool: string; args: unknown };

/** Thrown by an ask that has to wait: the tool answers the ask's result as it is. */
class Waiting extends Error {
  constructor(readonly result: InputRequiredResult) {
    super("que: the call waits for the client's answer");
  }
}

/** The client capabilities a 2026-07-28 request's envelope carries, as this mouth reads them. */
type ClientCapabilities = { elicitation?: { form?: unknown } };

/**
 * The codec that seals an ask's state, bound to the user it was minted for:
 * another user's state fails to verify, and the call does not run.
 */
function codecFor(user: User): RequestStateCodec<Pending> {
  const secret = process.env.QUE_CREDENTIALS_KEY;
  if (!secret)
    throw new Error(
      "QUE_CREDENTIALS_KEY must be set: an MCP ask seals its state with a key derived from it",
    );
  const key = new Uint8Array(
    hkdfSync(
      "sha256",
      Buffer.from(secret, "base64"),
      "",
      "que/mcp/requestState",
      32,
    ),
  );
  return createRequestStateCodec<Pending>({ key, bind: () => user.id });
}

/**
 * The door's ask for one call. An answered ask is a decision. A call still
 * waiting is a `Waiting` throw, which the tool gives back as its result.
 */
function askFor(
  ctx: ServerContext,
  tool: string,
  mouth: Mouth,
  codec: RequestStateCodec<Pending>,
): Ask {
  return async (request) => {
    const answer = ctx.mcpReq.inputResponses?.[ASK] as
      { action?: string } | undefined;
    const state = ctx.mcpReq.requestState<Pending | undefined>();

    // The answer counts only for the call it was minted for: the same tool, on the same parsed args.
    if (
      answer &&
      state &&
      state.tool === tool &&
      isDeepStrictEqual(state.args, request.args)
    ) {
      if (answer.action === "accept") return { type: "approve" };
      if (answer.action === "cancel")
        return { type: "reject", message: "the user had dismissed the ask" };
      return { type: "reject" };
    }

    // A call that cannot be asked refuses now, rather than run without its yes.
    const capabilities = (
      ctx.mcpReq.envelope as Record<string, unknown> | undefined
    )?.[CLIENT_CAPABILITIES_META_KEY] as ClientCapabilities | undefined;
    if (ctx.mcpReq.envelope === undefined) {
      // A 2025-era request: over stdio the SDK's shim asks on the live connection, and a stateless HTTP mouth cannot.
      if (mouth === "http")
        throw new OpFailed(
          `${request.name} needs a yes, and que's stateless HTTP mouth can ask only a 2026-07-28 client: the call did not run`,
        );
    } else if (capabilities?.elicitation?.form === undefined) {
      throw new OpFailed(
        `${request.name} needs a yes, and this client does not declare elicitation: the call did not run`,
      );
    }

    throw new Waiting(
      inputRequired({
        inputRequests: {
          [ASK]: inputRequired.elicit({
            message: request.description,
            requestedSchema: { type: "object", properties: {} },
          }),
        },
        requestState: await codec.mint({ tool, args: request.args }, ctx),
      }),
    );
  };
}

/**
 * The MCP server for `user`: whoami, and one tool per op of each plugin in
 * their catalog, each running through the door as them. A server made with no
 * user has whoami alone, and needs no catalog or door.
 */
export async function sessionServer(
  user?: User,
  mouth: Mouth = "stdio",
): Promise<McpServer> {
  if (!user) return createMcpServer();

  // The catalog, and the door every op runs through as this user, on the same access the web UI uses.
  const [{ catalogFor }, { access }, { plugins }] = await Promise.all([
    import("../access/catalog.js"),
    import("../access/connections.js"),
    import("../mount/mounted.js"),
  ]);
  const codec = codecFor(user);
  const ops: PlacedOp[] = plugins.flatMap(({ definition }) =>
    definition.ops.map((op) => ({ plugin: definition.plugin, op })),
  );
  const server = createMcpServer(user, {
    requestState: { verify: codec.verify },
  });
  for (const tool of toolsOf(await catalogFor(user.id))) {
    server.registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema: tool.input,
        annotations: tool.annotations,
      },
      async (params, ctx) => {
        try {
          const call = door(
            access.getConnection,
            ops,
            askFor(ctx, tool.name, mouth, codec),
          );
          const result = await call(tool.placed, params, user.id);
          return {
            // An op that gives back nothing gives the JSON text null.
            content: [{ type: "text", text: JSON.stringify(result) ?? "null" }],
          };
        } catch (error) {
          if (error instanceof Waiting) return error.result;
          throw error;
        }
      },
    );
  }
  return server;
}

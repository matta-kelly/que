/**
 * One MCP session: the server, the tools and the skills of the deployment this
 * process mounted, on the catalog of the user it answers for. Both mouths build
 * a session here: stdio for the whole process (`stdio.ts`), and HTTP once per
 * request (`serve.ts`), so a user's tools and skills are made in one place.
 *
 * The tools and skills are assembled when the session is made: a deployment
 * change is seen by the next session, which over stdio is the next process, and
 * over HTTP is the next request.
 */

import type { McpServer } from "@modelcontextprotocol/server";
import { SkillsExtension } from "@modelcontextprotocol/server/ext/skills";
import type { User } from "@que/users";
import { door, type PlacedOp } from "../assemble/door.js";
import type { ServedSkill } from "../mount/skills.js";
import { createMcpServer } from "./server.js";
import { skillSource, skillsLine, skillTools } from "./skills.js";
import { toolsOf } from "./tools.js";

/**
 * The MCP server for `user`: whoami, one tool per skill of each plugin in their
 * catalog, then one tool per op, each running through the door as them, and the
 * skills again by the skills extension. A server made with no user has whoami alone and no skills, and
 * needs no catalog or door.
 */
export async function sessionServer(user?: User): Promise<McpServer> {
  if (!user) return withSkills(createMcpServer(), []);

  // The catalog, and the door every op runs through as this user, on the same access the settings UI sets.
  const [{ catalogFor }, { access }, { plugins }] = await Promise.all([
    import("../access/catalog.js"),
    import("../access/connections.js"),
    import("../mount/mounted.js"),
  ]);
  const ops: PlacedOp[] = plugins.flatMap(({ definition }) =>
    definition.ops.map((op) => ({ plugin: definition.plugin, op })),
  );
  const catalog = await catalogFor(user.id);
  const served = catalog.flatMap(({ plugin }) => plugin.skills);
  const server = createMcpServer(user, skillsLine(served));
  const call = door(access.getConnection, ops);
  const opTools = toolsOf(catalog);
  const opNames = new Set(opTools.map((tool) => tool.name));
  // The skills come first in the tool list: a client's model meets the playbooks before the ops.
  for (const skill of skillTools(served)) {
    if (opNames.has(skill.name))
      throw new Error(
        `mcp: the skill ${skill.name} has the name of an op, so it cannot be a tool`,
      );
    server.registerTool(
      skill.name,
      { description: skill.description, annotations: { readOnlyHint: true } },
      async () => ({ content: [{ type: "text", text: skill.text }] }),
    );
  }
  for (const tool of opTools) {
    server.registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema: tool.input,
        annotations: tool.annotations,
      },
      async (params) => {
        const result = await call(tool.placed, params, user.id);
        return {
          // An op that gives back nothing gives the JSON text null.
          content: [{ type: "text", text: JSON.stringify(result) ?? "null" }],
        };
      },
    );
  }
  return withSkills(server, served);
}

/** The server with the skills extension on these skills. Every session has it, so every caller sees one shape. */
function withSkills(server: McpServer, served: ServedSkill[]): McpServer {
  new SkillsExtension({ source: skillSource(served) }).attach(server);
  return server;
}

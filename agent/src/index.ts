/**
 * LangChain Agent - Entry Point
 *
 * Interactive CLI chat for testing the agent locally.
 * Run with: npm start (inside the dev container). Type "exit" or Ctrl+C to quit.
 * Runs as the identity from @que/identity (the dev user from .env).
 */

import "dotenv/config";
import * as readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import type { BaseMessage } from "langchain";
import { identify } from "@que/identity";
import { buildAgent } from "./agent.js";
import { users } from "./users.js";

// Chat init: who this chat is for, then an agent with only their packages.
const identity = await identify(new Headers());
if (!identity) throw new Error("No identity: set DEV_USER_EMAIL in .env");
const rep = (await users.ensure(identity)).id;
const agent = await buildAgent(rep);

const rl = readline.createInterface({ input, output });

// Full conversation so far; sent on every turn so the agent remembers context.
let messages: BaseMessage[] = [];

console.log(`🤖 Agent ready for ${rep}. Type "exit" to quit.\n`);

while (true) {
  const question = (await rl.question("📝 You: ")).trim();
  if (!question) continue;
  if (question === "exit") break;

  try {
    const result = await agent.invoke({ messages: [...messages, { role: "user", content: question }] });
    messages = result.messages;
    console.log(`\n🤖 Agent: ${messages.at(-1)?.content}\n`);
  } catch (error) {
    console.error("Error:", error);
  }
}

rl.close();

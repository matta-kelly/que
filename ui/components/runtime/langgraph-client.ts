import { Client } from "@langchain/langgraph-sdk";

// All requests go through the Next.js proxy at /api.
export const createClient = () =>
  new Client({
    apiUrl:
      typeof window !== "undefined"
        ? new URL("/api", window.location.href).href
        : "/api",
  });

import * as z from "zod";
import { definePackage } from "@que/core";

export default definePackage({
  name: "notes",
  title: "Notes",
  description: "A package that sits outside que, and needs a token.",
  credential: z.object({ token: z.string().min(1) }),
  connect: async (credential) => ({ token: credential.token }),
  ops: [
    {
      name: "token",
      title: "Token",
      description: "Says which token the connection holds.",
      schema: z.object({}),
      run: async ({ conn }) => ({ token: conn.token }),
    },
  ],
});

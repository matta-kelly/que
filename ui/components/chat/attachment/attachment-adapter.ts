import type { AttachmentAdapter } from "@assistant-ui/react";

/**
 * The chat's thread, as an attachment needs it: the id que's server gave it,
 * which a new chat has not got until it is made, and the way to make it.
 */
export type ChatThread = {
  remoteId: () => string | undefined;
  initialize: () => Promise<{ remoteId: string }>;
};

/**
 * The composer's attachments of one chat: a chosen file waits in the composer,
 * and goes to the chat's thread when the message is sent. The message says the
 * file's name and its id, so the run names the file and carries no bytes.
 */
export function queAttachments(thread: ChatThread): AttachmentAdapter {
  void thread;
  // The signature only: no upload, no name, no id. The tests decide what it does.
  return {
    accept: "*",
    async add({ file }) {
      return {
        id: "",
        type: "file",
        name: "",
        file,
        status: { type: "requires-action", reason: "composer-send" },
      };
    },
    async remove() {},
    async send() {
      return {
        id: "",
        type: "file",
        name: "",
        status: { type: "complete" },
        content: [],
      };
    },
  };
}

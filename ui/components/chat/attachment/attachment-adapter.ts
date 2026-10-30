import { generateId, type AttachmentAdapter } from "@assistant-ui/react";

/**
 * The chat's thread, as an attachment needs it: the id que's server gave it,
 * which a new chat has not got until it is made, and the way to make it.
 */
export type ChatThread = {
  remoteId: () => string | undefined;
  initialize: () => Promise<{ remoteId: string }>;
};

/** A file que's server keeps for a thread, as its upload answers. */
type QueFile = { id: string; name: string; mimeType: string; size: number };

/** A file in a message's text: its name, and the id the agent reads it by. */
const mention = (file: QueFile) => `${file.name} (id ${file.id})`;

/**
 * The file as the multipart body que's server reads, with the boundary its
 * content type names. FormData is serialized by the platform, so the boundary
 * is the one `Response` put in the header.
 */
async function multipart(
  file: File,
): Promise<{ body: ArrayBuffer; contentType: string }> {
  const form = new FormData();
  form.append("file", file, file.name);
  const encoded = new Response(form);
  return {
    body: await encoded.arrayBuffer(),
    contentType: encoded.headers.get("content-type") ?? "multipart/form-data",
  };
}

/**
 * The composer's attachments of one chat: a chosen file waits in the composer,
 * and goes to the chat's thread when the message is sent. The message says the
 * file's name and its id, so the run names the file and carries no bytes.
 */
export function queAttachments(thread: ChatThread): AttachmentAdapter {
  return {
    accept: "*",
    async add({ file }) {
      return {
        id: generateId(),
        type: "file",
        name: file.name,
        contentType: file.type,
        file,
        status: { type: "requires-action", reason: "composer-send" },
      };
    },
    async remove() {},
    async send(attachment) {
      // A new chat's thread is made before the upload, so the file has a home.
      const threadId =
        thread.remoteId() ?? (await thread.initialize()).remoteId;
      const { body, contentType } = await multipart(attachment.file);
      const res = await fetch(
        `/api/threads/${encodeURIComponent(threadId)}/files`,
        {
          method: "POST",
          headers: { "content-type": contentType },
          body,
        },
      );
      if (!res.ok) throw new Error(`que's server answered ${res.status}`);
      const file = (await res.json()) as QueFile;
      return {
        id: file.id,
        type: "file",
        name: file.name,
        contentType: file.mimeType,
        status: { type: "complete" },
        content: [{ type: "text", text: mention(file) }],
      };
    },
  };
}

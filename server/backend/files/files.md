---
type: component
description: "Files, que's attachments: a user attaches a file to a chat, que keeps it with the thread, and the agent and the thread's ops can read it. Read before changing how a file is uploaded, kept, reached or read. The store is in this folder; the routes, the agent's tools and the UI are named below."
status: running
---
A user attaches a file to a chat. que keeps it with the thread, and the agent and the thread's ops can read it.
- [[#Rules]] what holds of every file
- [[#Parts]] where each step is built

- [[que]]: the harness it is part of
- [[op-contract#Context]]: what an op gets of a thread's files

---
## Rules

- a file belongs to its thread, and only the thread's owner can reach it
	- a thread or a file that is not the user's answers the same 404 as one that is not there
	- an id from another thread is a failed call that names the id and the thread
- a file lives with the deployment's other data, so it survives a restart: a row on Postgres, and its bytes under `<data>/files/<thread>/<id>/` (`QUE_DATA_DIR`)
- the uploaded name is kept in the row, never as a path. A plugin and the model get bytes, never the store's path
- a file is at most 25 MB. A bigger one is a 413, answered before its body is read to the end
- a delete of the thread takes its files with it

## Parts

- store: `@que/files` (this folder). A file's row and its folder, by thread
- routes: `/threads/:id/files` (`runtime/src/run/files.ts`). Upload as a multipart part named `file`, list, read one back, delete
- the agent: two tools on each run (`runtime/src/runner/pi/attachments.ts`)
	- `list_attachments`: each file's id, name, type and size
	- `read_attachment`: one file by its id, in windows of at most 50 KB, each naming the offset of the next
		- text and CSV: read as they are
		- PDF: its text, extracted once and cached in the file's folder. A PDF with no text layer is a failed call
		- `.xlsx`: with no sheet, its sheets and their row counts. With one, the sheet as tab-separated rows, cached
		- PNG or JPEG: given to the model as an image
- ops: `ctx.files` on both kinds of op, scoped to the run's thread ([[op-contract#Context]])
- UI: the chat's attachment adapter (`ui/components/chat/attachment/`). It uploads to the thread, making a new chat's thread first, and puts each file's name and id in the message

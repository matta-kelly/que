// The config of `basis lint .`, from que's root: its notes are que-notes's (server/que-notes), whose schema gives
// their skip. The repo's root has no install, so this file names no package: its schema's file brings basis.
import notes from "./server/que-notes/schema.ts";

export default { schema: notes };

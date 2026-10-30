import { useEffect, useState, type FC } from "react";

/** A file que's server keeps for a thread, as its list gives it. */
type QueFile = { id: string; name: string; mimeType: string; size: number };

const listed = async (threadId: string): Promise<QueFile[]> => {
  const res = await fetch(`/api/threads/${encodeURIComponent(threadId)}/files`);
  if (!res.ok) throw new Error(`que's server answered ${res.status}`);
  return (await res.json()) as QueFile[];
};

/**
 * A thread's files, as que's server lists them: a reload shows the files the
 * thread holds, by name, rather than a preview of their contents.
 */
export const ThreadFiles: FC<{ threadId: string }> = ({ threadId }) => {
  const [files, setFiles] = useState<QueFile[]>([]);

  useEffect(() => {
    let held = true;
    listed(threadId)
      .then((found) => {
        if (held) setFiles(found);
      })
      .catch(() => {});
    return () => {
      held = false;
    };
  }, [threadId]);

  if (files.length === 0) return null;

  return (
    <ul
      aria-label="Files in this thread"
      className="aui-thread-files text-muted-foreground flex flex-wrap gap-1.5 text-sm"
    >
      {files.map((file) => (
        <li
          key={file.id}
          className="aui-thread-file truncate rounded-md border px-2 py-1"
        >
          {file.name}
        </li>
      ))}
    </ul>
  );
};

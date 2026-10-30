/**
 * pi's tasks and submissions on Postgres: their writes in a commit, and the reads by id and by scan.
 * Their records are JSON text, not jsonb, for the same reason as an entry's: jsonb refuses U+0000 and a lone
 * surrogate. What the queries filter and order on has a column of its own.
 */

import type { JsonValue } from "@earendil-works/chord";
import type {
  Cursor,
  Page,
  SubmissionQuery,
  SubmissionRecord,
  TaskQuery,
  TaskRecord,
} from "@earendil-works/pi-durable";
import { checkRecordId } from "./ids.ts";
import { encoded } from "./identity.ts";
import { page, scanSql, scanStart } from "./scan.ts";
import type { Queryable } from "./storage.ts";

type Row = { record: string };

const record = <T>(row: Row) => JSON.parse(row.record) as T;

/** A task is replaced whole; its id may not belong to a record of another type. */
export async function writeTask(
  db: Queryable,
  task: TaskRecord<JsonValue, JsonValue, JsonValue>,
): Promise<void> {
  await checkRecordId(db, task.id, "task");
  await db.query(
    `INSERT INTO pi.tasks (id, conversation_id, kind, status, abort_requested, background, record)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (id) DO UPDATE SET conversation_id = excluded.conversation_id, kind = excluded.kind,
       status = excluded.status, abort_requested = excluded.abort_requested,
       background = excluded.background, record = excluded.record`,
    [
      task.id,
      task.conversationId,
      encoded(task.kind),
      task.state.status,
      task.abortRequested,
      task.background,
      JSON.stringify(task),
    ],
  );
}

/** A submission is replaced whole; its id may not belong to a record of another type. */
export async function writeSubmission(
  db: Queryable,
  submission: SubmissionRecord,
): Promise<void> {
  await checkRecordId(db, submission.id, "submission");
  await db.query(
    `INSERT INTO pi.submissions (id, conversation_id, request_id, status, record)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (id) DO UPDATE SET conversation_id = excluded.conversation_id,
       request_id = excluded.request_id, status = excluded.status, record = excluded.record`,
    [
      submission.id,
      submission.conversationId,
      submission.requestId === undefined ? null : encoded(submission.requestId),
      submission.status,
      JSON.stringify(submission),
    ],
  );
}

export async function task(
  db: Queryable,
  id: number,
): Promise<TaskRecord<JsonValue, JsonValue, JsonValue> | undefined> {
  const { rows } = await db.query("SELECT record FROM pi.tasks WHERE id = $1", [
    id,
  ]);
  return rows[0] === undefined ? undefined : record(rows[0]);
}

export async function submission(
  db: Queryable,
  id: number,
): Promise<SubmissionRecord | undefined> {
  const { rows } = await db.query(
    "SELECT record FROM pi.submissions WHERE id = $1",
    [id],
  );
  return rows[0] === undefined ? undefined : record(rows[0]);
}

/** The submission of a conversation's request id. The newest write of the pair wins, as pi's index does. */
export async function submissionByRequest(
  db: Queryable,
  conversationId: number,
  requestId: string,
): Promise<SubmissionRecord | undefined> {
  const { rows } = await db.query(
    `SELECT record FROM pi.submissions
     WHERE conversation_id = $1 AND request_id = $2
     ORDER BY id DESC LIMIT 1`,
    [conversationId, encoded(requestId)],
  );
  return rows[0] === undefined ? undefined : record(rows[0]);
}

/** The tasks that match the query, in its order, after the cursor's id. The cursor holds its order. */
export async function scanTasks(
  db: Queryable,
  query: TaskQuery,
  limit: number,
  cursor: Cursor | undefined,
): Promise<Page<TaskRecord<JsonValue, JsonValue, JsonValue>, Cursor>> {
  const start = scanStart(query.order, cursor, "ascending");
  const { direction, clause, param } = scanSql(start);
  const clauses = [clause];
  const params: unknown[] = [param];
  const filter = (sql: string, value: unknown) => {
    params.push(value);
    clauses.push(`${sql} $${params.length}`);
  };
  if (query.conversationId !== undefined)
    filter("conversation_id =", query.conversationId);
  if (query.kind !== undefined) filter("kind =", encoded(query.kind));
  if (query.status !== undefined) filter("status =", query.status);
  if (query.abortRequested !== undefined)
    filter("abort_requested =", query.abortRequested);
  if (query.background !== undefined) filter("background =", query.background);
  params.push(limit + 1);
  const { rows } = await db.query(
    `SELECT record FROM pi.tasks WHERE ${clauses.join(" AND ")}
     ORDER BY id ${direction} LIMIT $${params.length}`,
    params,
  );
  const items = rows
    .slice(0, limit)
    .map((row) => record<TaskRecord<JsonValue, JsonValue, JsonValue>>(row));
  return page(items, rows.length > limit, start.order);
}

/** The submissions that match the query, in its order, after the cursor's id. The cursor holds its order. */
export async function scanSubmissions(
  db: Queryable,
  query: SubmissionQuery,
  limit: number,
  cursor: Cursor | undefined,
): Promise<Page<SubmissionRecord, Cursor>> {
  const start = scanStart(query.order, cursor, "ascending");
  const { direction, clause, param } = scanSql(start);
  const clauses = [clause];
  const params: unknown[] = [param];
  const filter = (sql: string, value: unknown) => {
    params.push(value);
    clauses.push(`${sql} $${params.length}`);
  };
  if (query.conversationId !== undefined)
    filter("conversation_id =", query.conversationId);
  if (query.status !== undefined) filter("status =", query.status);
  params.push(limit + 1);
  const { rows } = await db.query(
    `SELECT record FROM pi.submissions WHERE ${clauses.join(" AND ")}
     ORDER BY id ${direction} LIMIT $${params.length}`,
    params,
  );
  const items = rows
    .slice(0, limit)
    .map((row) => record<SubmissionRecord>(row));
  return page(items, rows.length > limit, start.order);
}

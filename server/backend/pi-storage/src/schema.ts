/**
 * pi's tables, in a Postgres schema of their own, `pi`, made when they are not there.
 * One statement, so Postgres runs it in one transaction. The lock makes two que processes
 * that start together do it one after the other, so the second finds it done.
 *
 * - `pi.ids`: the one id namespace of every record. It starts at 2: id 1 is the root conversation's.
 *   A sequence keeps each id it gave, also one that was never stored, so an id is never given twice.
 * - `pi.commit_seqs`: the sequence of each commit.
 * - `pi.entries`: each entry, by the conversation it is in, with its `head` and the sequence of the commit that wrote it.
 *   Its record is JSON text, not jsonb: jsonb refuses U+0000 and a lone surrogate, which JSON.stringify escapes.
 * - `pi.tasks` and `pi.submissions`: each record, with the columns their scans filter and order on. Their records are
 *   JSON text for the same reason as an entry's. A string they index (a task's `kind`, a submission's `request_id`) is
 *   stored JSON-encoded, which keeps a lone surrogate exact in a text column (see `identity.ts`).
 *   That encoding has no backfill: a store made before B5 holds no que data, so no old row is re-encoded.
 * - `pi.documents`: each incarnation, by its logical address and exact scope, with its lifetime. `pi.document_revisions`:
 *   each base or delta of its content, in commit-sequence order. Their indexed strings are JSON-encoded too.
 */
export const SETUP = `
  DO $$
  BEGIN
    PERFORM pg_advisory_xact_lock(hashtext('que.pi-storage'));
    CREATE SCHEMA IF NOT EXISTS pi;
    CREATE SEQUENCE IF NOT EXISTS pi.ids AS bigint START 2;
    CREATE SEQUENCE IF NOT EXISTS pi.commit_seqs AS bigint;
    CREATE TABLE IF NOT EXISTS pi.conversations (
      id                    bigint PRIMARY KEY,
      owner_conversation_id bigint,
      owner_task_id         bigint,
      record                jsonb  NOT NULL
    );
    CREATE INDEX IF NOT EXISTS conversations_by_owner_conversation
      ON pi.conversations (owner_conversation_id, id);
    CREATE INDEX IF NOT EXISTS conversations_by_owner_task
      ON pi.conversations (owner_task_id, id);
    CREATE TABLE IF NOT EXISTS pi.entries (
      id              bigint PRIMARY KEY,
      conversation_id bigint NOT NULL,
      head            bigint,
      commit_seq      bigint NOT NULL,
      record          text   NOT NULL
    );
    CREATE INDEX IF NOT EXISTS entries_by_conversation
      ON pi.entries (conversation_id, id);
    CREATE TABLE IF NOT EXISTS pi.tasks (
      id              bigint PRIMARY KEY,
      conversation_id bigint  NOT NULL,
      kind            text    NOT NULL,
      status          text    NOT NULL,
      abort_requested boolean NOT NULL,
      background      boolean NOT NULL,
      record          text    NOT NULL
    );
    CREATE INDEX IF NOT EXISTS tasks_by_status
      ON pi.tasks (status, id);
    CREATE INDEX IF NOT EXISTS tasks_by_conversation
      ON pi.tasks (conversation_id, id);
    CREATE INDEX IF NOT EXISTS tasks_by_kind
      ON pi.tasks (kind, id);
    CREATE INDEX IF NOT EXISTS tasks_by_abort_requested
      ON pi.tasks (abort_requested, id);
    CREATE INDEX IF NOT EXISTS tasks_by_background
      ON pi.tasks (background, id);
    CREATE TABLE IF NOT EXISTS pi.submissions (
      id              bigint PRIMARY KEY,
      conversation_id bigint NOT NULL,
      request_id      text,
      status          text   NOT NULL,
      record          text   NOT NULL
    );
    CREATE INDEX IF NOT EXISTS submissions_by_request
      ON pi.submissions (conversation_id, request_id);
    CREATE INDEX IF NOT EXISTS submissions_by_conversation
      ON pi.submissions (conversation_id, id);
    CREATE INDEX IF NOT EXISTS submissions_by_status
      ON pi.submissions (status, id);
    CREATE TABLE IF NOT EXISTS pi.documents (
      id         bigint PRIMARY KEY,
      address    text   NOT NULL,
      scope      text   NOT NULL,
      kind       text   NOT NULL,
      created_at bigint NOT NULL,
      retired_at bigint,
      record     text   NOT NULL
    );
    CREATE INDEX IF NOT EXISTS documents_by_address
      ON pi.documents (address, id);
    CREATE INDEX IF NOT EXISTS documents_by_scope
      ON pi.documents (scope, id);
    CREATE TABLE IF NOT EXISTS pi.document_revisions (
      document_id bigint  NOT NULL,
      seq         bigint  NOT NULL,
      kind        text    NOT NULL,
      version     integer NOT NULL,
      content     text    NOT NULL,
      PRIMARY KEY (document_id, seq)
    );
  END
  $$`;

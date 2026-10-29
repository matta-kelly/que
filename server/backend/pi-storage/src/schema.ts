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
  END
  $$`;
